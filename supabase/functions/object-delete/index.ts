import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveSecret } from "../_shared/secrets.ts";

// object-delete — verwijdert een object (project_location) en optioneel de SharePoint-map.
// quotes.project_location_id wordt automatisch NULL (FK on delete set null).
// Body: { object_id, delete_sharepoint }

const GRAPH = "https://graph.microsoft.com/v1.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getToken(tenant: string, clientId: string, secret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Token-fout (${res.status}): ${j.error_description || res.statusText}`);
  return j.access_token;
}
async function graphDelete(token: string, path: string): Promise<void> {
  const res = await fetch(`${GRAPH}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204 || res.status === 404) return; // verwijderd of al weg
  const j = await res.json().catch(() => ({}));
  throw new Error(`Graph ${res.status} op DELETE ${path}: ${j.error?.message || res.statusText}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const objectId = String(body.object_id ?? "").trim();
    const deleteSharepoint = body.delete_sharepoint === true;
    if (!objectId) return json({ status: "error", message: "object_id verplicht" }, 400);

    const { data: loc } = await sb.from("project_locations")
      .select("id, folder_item_id, organization_id").eq("id", objectId).maybeSingle();
    if (!loc) return json({ status: "error", message: "Object niet gevonden" }, 404);

    // Optioneel: de SharePoint-map verwijderen (app-only). Faalt dit → abort (rij blijft staan).
    if (deleteSharepoint && loc.folder_item_id) {
      const tenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
      const clientId = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
      const secret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
      if (!tenant || !clientId || !secret) return json({ status: "error", message: "SharePoint-secrets ontbreken" }, 400);
      const { data: org } = await sb.from("organizations").select("sharepoint_drive_id").eq("id", loc.organization_id).maybeSingle();
      const driveId = org?.sharepoint_drive_id as string | null;
      if (!driveId) return json({ status: "error", message: "SharePoint-drive niet ingesteld" }, 400);
      const token = await getToken(tenant, clientId, secret);
      await graphDelete(token, `/drives/${driveId}/items/${loc.folder_item_id}`);
    }

    const { error: delErr } = await sb.from("project_locations").delete().eq("id", objectId);
    if (delErr) throw delErr;

    return json({ status: "ok" });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwijderen mislukt" }, 500);
  }
});
