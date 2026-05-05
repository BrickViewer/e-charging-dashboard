import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Accept-client-invitation — valideert token, maakt user-account aan,
// koppelt portal_user_id aan client, marker invite als accepted.
//
// Body:
//   GET ?token=...           → returnt invitation-info (voor invite-pagina render)
//   POST { token, password } → accepteert invitation: maakt auth user, koppelt aan client
//
// Public function (verify_jwt: false) — wordt aangeroepen vanaf de invite-pagina
// vóór de klant überhaupt is ingelogd.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
      if (password.length < 8) {
        return json({ status: "error", message: "Wachtwoord minimaal 8 tekens" }, 400);
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

async function handleGet(supabase: any, token: string) {
  const { data: invite, error } = await supabase
    .from("client_invitations")
    .select("id, client_id, email, status, expires_at, clients(company_name, contact_name)")
    .eq("token", token)
    .maybeSingle();

  if (error) throw error;
  if (!invite) return json({ status: "not_found", message: "Uitnodiging niet gevonden" }, 404);

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
    company_name: invite.clients?.company_name,
    contact_name: invite.clients?.contact_name,
    expires_at: invite.expires_at,
  });
}

async function handlePost(supabase: any, token: string, password: string) {
  const { data: invite, error } = await supabase
    .from("client_invitations")
    .select("id, client_id, email, status, expires_at")
    .eq("token", token)
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
  let userId: string;
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

  userId = createdUser.user!.id;

  // Wijs 'client' rol toe
  const { error: roleErr } = await supabase
    .from("user_roles")
    .insert({
      user_id: userId,
      role: "client",
    });
  if (roleErr && !roleErr.message?.includes("duplicate")) {
    console.error("user_roles insert failed:", roleErr.message);
  }

  // Koppel portal_user_id op client
  const { error: linkErr } = await supabase
    .from("clients")
    .update({ portal_user_id: userId })
    .eq("id", invite.client_id);
  if (linkErr) throw linkErr;

  // Marker invite as accepted
  const { error: acceptErr } = await supabase
    .from("client_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (acceptErr) console.error("invitation accept update failed:", acceptErr.message);

  // Activity log
  await supabase.from("activity_log").insert({
    client_id: invite.client_id,
    user_id: userId,
    action: "invitation_accepted",
    description: `Klant heeft uitnodiging geaccepteerd en account aangemaakt`,
    metadata: { invitation_id: invite.id, email: invite.email },
  });

  return json({
    status: "accepted",
    user_id: userId,
    email: invite.email,
    redirect: "/portal",
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
