import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_STD } from "../_shared/cors.ts";

// assign-user-role — keurt een toegangsverzoek goed (rol toekennen) of weigert het.
// Rol-gating: admin/manager mag ALLEEN de superadmin toekennen; sales/marketing/viewer
// mag elke admin (en superadmin). De superadmin-rol is nooit via deze weg toekenbaar.
// Body: { request_id?: string, user_id?: string, role?: app_role, action?: "approve"|"deny" }

const corsHeaders = CORS_STD;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const ALLOWED_ROLES = ["admin", "manager", "sales", "marketing", "viewer"];
const SUPERADMIN_ONLY_ROLES = ["admin", "manager"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    // Auth: wie roept aan? (admin of superadmin)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ status: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: "unauthorized" }, 401);

    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (callerRoles ?? []).map((r: { role: string }) => r.role);
    const isSuperadmin = roles.includes("superadmin");
    const isAdmin = isSuperadmin || roles.includes("admin");
    if (!isAdmin) return json({ status: "forbidden", message: "Alleen een admin of superadmin mag dit" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action === "deny" ? "deny" : "approve";
    const requestId = String(body.request_id ?? "").trim() || null;
    let targetUserId = String(body.user_id ?? "").trim() || null;

    // Doel + huidige status uit het verzoek halen.
    let reqStatus: string | null = null;
    if (requestId) {
      const { data } = await admin.from("access_requests").select("user_id, status").eq("id", requestId).maybeSingle();
      if (!data) return json({ status: "error", message: "Toegangsverzoek niet gevonden" }, 404);
      targetUserId = data.user_id;
      reqStatus = data.status;
    } else if (targetUserId) {
      const { data } = await admin.from("access_requests").select("status").eq("user_id", targetUserId).maybeSingle();
      reqStatus = data?.status ?? null;
    }
    if (!targetUserId) return json({ status: "error", message: "request_id of user_id verplicht" }, 400);
    if (reqStatus && reqStatus !== "pending") {
      return json({ status: "error", message: "Dit verzoek is al afgehandeld" }, 409);
    }

    if (action === "deny") {
      await admin.from("access_requests")
        .update({ status: "denied", decided_by: user.id, decided_at: new Date().toISOString() })
        .eq("user_id", targetUserId).eq("status", "pending");
      return json({ status: "denied", user_id: targetUserId });
    }

    // approve → rol valideren + gating
    const role = String(body.role ?? "").trim();
    if (!ALLOWED_ROLES.includes(role)) return json({ status: "error", message: "Ongeldige rol" }, 400);
    if (SUPERADMIN_ONLY_ROLES.includes(role) && !isSuperadmin) {
      return json({ status: "forbidden", message: `Alleen de superadmin mag de rol '${role}' toekennen` }, 403);
    }

    // Precies één rol zetten (oude rollen wissen, zoals invite-team-member).
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: targetUserId, role });
    if (roleErr) throw roleErr;

    await admin.from("access_requests")
      .update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString(), role_granted: role })
      .eq("user_id", targetUserId);

    return json({ status: "approved", user_id: targetUserId, role });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Toekennen mislukt" }, 500);
  }
});
