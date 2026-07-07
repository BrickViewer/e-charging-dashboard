import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/hash.ts";
import { CORS_GET_POST } from "../_shared/cors.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// Accept-client-invitation — valideert token, maakt user-account aan,
// koppelt portal_user_id aan client, marker invite als accepted.
//
// Body:
//   GET ?token=...           → returnt invitation-info (voor invite-pagina render)
//   POST { token, password } → accepteert invitation: maakt auth user, koppelt aan client
//
// Public function (verify_jwt: false) — wordt aangeroepen vanaf de invite-pagina
// vóór de klant überhaupt is ingelogd.

const corsHeaders = CORS_GET_POST;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return json({ status: "error", message: "token verplicht" }, 400);
      return await handleGet(supabase, token);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, password } = body;
      if (!token || !password) {
        return json({ status: "error", message: "token + password verplicht" }, 400);
      }
      if (password.length < 10) {
        return json({ status: "error", message: "Wachtwoord minimaal 10 tekens" }, 400);
      }
      return await handlePost(supabase, token, password);
    }

    return json({ status: "error", message: "Method not allowed" }, 405);
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("accept-client-invitation failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});

async function handleGet(supabase: SupabaseClient, token: string) {
  const tokenHash = await sha256Hex(token);
  const { data: invite, error } = await supabase
    .from("client_invitations")
    .select("id, client_id, email, status, expires_at, clients(client_number, company_name, contact_name, portal_user_id)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!invite) return json({ status: "not_found", message: "Uitnodiging niet gevonden" }, 404);

  if (invite.clients?.portal_user_id) {
    return json({ status: "already_accepted", message: "Deze klant heeft al een actief portal-account. Log in via /login." });
  }

  if (invite.status === "accepted") {
    return json({ status: "already_accepted", message: "Deze uitnodiging is al gebruikt. Log in via /login." });
  }
  if (invite.status === "revoked") {
    return json({ status: "revoked", message: "Deze uitnodiging is ingetrokken. Vraag E-Charging om een nieuwe." });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase
      .from("client_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return json({ status: "expired", message: "Deze uitnodiging is verlopen. Vraag E-Charging om een nieuwe." });
  }

  return json({
    status: "valid",
    email: invite.email,
    client_number: invite.clients?.client_number,
    company_name: invite.clients?.company_name,
    contact_name: invite.clients?.contact_name,
    expires_at: invite.expires_at,
  });
}

async function handlePost(supabase: SupabaseClient, token: string, password: string) {
  const tokenHash = await sha256Hex(token);
  const { data: invite, error } = await supabase
    .from("client_invitations")
    .select("id, client_id, email, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!invite) return json({ status: "not_found", message: "Uitnodiging niet gevonden" }, 404);

  if (invite.status !== "pending") {
    return json({ status: "invalid", message: `Uitnodiging is ${invite.status}` }, 409);
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase
      .from("client_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return json({ status: "expired", message: "Deze uitnodiging is verlopen" }, 410);
  }

  // Check of er al een user met deze email bestaat (edge case)
  // We gebruiken admin.listUsers met een filter, of admin.getUserByEmail (niet bestaand) — alternatief:
  // probeer createUser; als 'User already registered', vang dit op
  const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true, // auto-confirm — invite zelf is al de verificatie
    user_metadata: { invited_for_client_id: invite.client_id },
  });

  if (createErr) {
    // Als user al bestaat, probeer 'm te vinden via signInWithPassword (niet beschikbaar voor admin)
    // In plaats daarvan: gebruik listUsers
    if (createErr.message?.includes("already")) {
      const { data: existingUsers } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      // Kan ook via een raw query op auth.users; maar simpel: error terug
      return json({
        status: "user_exists",
        message: "Er bestaat al een account met dit e-mailadres. Vraag E-Charging om handmatig te koppelen of log in via /login.",
      }, 409);
    }
    throw createErr;
  }

  const userId = createdUser.user!.id;

  const { error: claimErr } = await supabase.rpc("accept_client_invitation", {
    invitation_token_hash: tokenHash,
    accepted_user_id: userId,
  });

  if (claimErr) {
    await supabase.auth.admin.deleteUser(userId).catch((deleteErr: Error) => {
      console.error("delete orphan invite user failed:", deleteErr.message);
    });
    throw claimErr;
  }

  return json({
    status: "accepted",
    user_id: userId,
    email: invite.email,
    redirect: "/portal/gegevens?welkom=1",
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
