import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_STD } from "../_shared/cors.ts";

// delete-team-member — verwijdert een intern teamlid volledig (auth-account + rollen + profiel).
// Hiërarchie wordt server-side afgedwongen:
//   - Alleen de superadmin mag verwijderen (admins hebben geen verwijder-macht).
//   - Een superadmin kan nooit worden verwijderd.
//   - Je kunt jezelf niet verwijderen.
//   - Alleen interne teamleden (met een rol) — nooit een klant-/portal-account.
// Body: { user_id: string }

const corsHeaders = CORS_STD;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Auth: alleen de ingelogde superadmin mag verwijderen.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ status: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: "unauthorized" }, 401);
    const { data: callerSa } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "superadmin").maybeSingle();
    if (!callerSa) return json({ status: "forbidden", message: "Alleen de superadmin mag teamleden verwijderen" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id ?? "").trim();
    if (!targetId) return json({ status: "error", message: "user_id verplicht" }, 400);
    if (targetId === user.id) return json({ status: "error", message: "Je kunt jezelf niet verwijderen" }, 400);

    // Doel moet een intern teamlid zijn (heeft minstens één rol).
    const { data: targetRoles } = await admin
      .from("user_roles").select("role").eq("user_id", targetId);
    const roles = (targetRoles ?? []).map((r: { role: string }) => r.role);
    if (roles.length === 0) {
      return json({ status: "error", message: "Doelgebruiker is geen intern teamlid" }, 400);
    }
    if (roles.includes("superadmin")) {
      return json({ status: "forbidden", message: "Een superadmin kan niet worden verwijderd" }, 403);
    }

    // Extra veiligheid: nooit een klant-/portal-account via deze functie raken.
    const { data: client } = await admin
      .from("clients").select("id").eq("portal_user_id", targetId).maybeSingle();
    if (client) {
      return json({ status: "error", message: "Dit is een klant-account, geen teamlid" }, 400);
    }

    // Verwijder het auth-account (cascade verwijdert user_roles + profiel).
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) throw delErr;

    return json({ status: "deleted", user_id: targetId });
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("delete-team-member failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});
