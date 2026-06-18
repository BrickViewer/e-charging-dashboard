import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { clientFromEnv, SharepointError } from "./sharepoint.ts";

// Verbindt + test de SharePoint-koppeling. Resolvet de site + documentbibliotheek
// uit de opgegeven site-URL en bewaart site_id/drive_id/root_item_id op de organisatie.
// Body: { site_url }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const gc = clientFromEnv();
    if (!gc) return json({ status: "not_configured", message: "SharePoint-secrets ontbreken (SHAREPOINT_TENANT_ID/CLIENT_ID/CLIENT_SECRET in Edge Function secrets)." });

    const body = await req.json().catch(() => ({}));
    const siteUrl = typeof body.site_url === "string" ? body.site_url.trim() : "";
    if (!siteUrl) return json({ status: "error", message: "site_url ontbreekt" }, 400);

    let hostname = "", sitePath = "";
    try {
      const u = new URL(siteUrl);
      hostname = u.hostname;
      const parts = u.pathname.split("/").filter(Boolean); // ["sites","Dossiers", ...]
      const i = parts.indexOf("sites");
      sitePath = i >= 0 && parts[i + 1] ? parts[i + 1] : (parts[0] ?? "");
    } catch {
      return json({ status: "error", message: "Ongeldige site-URL" }, 400);
    }
    if (!hostname || !sitePath) return json({ status: "error", message: "Kon host/site uit de URL niet bepalen (verwacht .../sites/<naam>)" }, 400);

    const site = await gc.resolveSite(hostname, sitePath);
    const drive = await gc.getDefaultDrive(site.id);
    const rootItemId = await gc.getDriveRootItemId(drive.id);

    // Org van de ingelogde gebruiker.
    const { data: prof } = await sb.from("profiles").select("organization_id").eq("user_id", auth.userId!).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) return json({ status: "error", message: "Geen organisatie gevonden voor deze gebruiker" }, 400);

    await sb.from("organizations").update({
      sharepoint_site_url: siteUrl,
      sharepoint_site_id: site.id,
      sharepoint_drive_id: drive.id,
      sharepoint_root_item_id: rootItemId,
    }).eq("id", orgId);

    return json({ status: "ok", siteId: site.id, driveId: drive.id, rootItemId, webUrl: site.webUrl });
  } catch (err) {
    if (err instanceof SharepointError) return json({ status: "sharepoint_error", statusCode: err.status, message: err.message }, 200);
    return json({ status: "error", message: err instanceof Error ? err.message : "Verbinden mislukt" }, 500);
  }
});
