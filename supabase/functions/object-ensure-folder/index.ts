import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { GraphClient, sanitizeName, ensureDossierFolder } from "../_shared/sharepoint.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// object-ensure-folder — maakt (app-only) ALTIJD de SharePoint-dossiermap voor een object aan.
// Aangeroepen door de AFTER-INSERT-trigger op project_locations (internal-secret) én handmatig (admin/sales).
// Idempotent (skip als folder_item_id al gezet). Graceful: skip als SharePoint niet geconfigureerd is.
// Body: { object_id }.

const corsHeaders = CORS_INTERNAL;
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
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: true, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const objectId = String(body.object_id ?? "").trim();
    if (!objectId) return json({ status: "error", message: "object_id verplicht" }, 400);

    const { data: loc, error: locErr } = await sb.from("project_locations")
      .select("id, organization_id, location_number, display_name, address_street, city, folder_item_id, folder_web_url")
      .eq("id", objectId).maybeSingle();
    if (locErr) throw locErr;
    if (!loc) return json({ status: "error", message: "Object niet gevonden" }, 404);

    // Org-config (doelmap). Niet ingesteld → niet blokkeren (object blijft bestaan).
    const { data: org } = await sb.from("organizations")
      .select("sharepoint_drive_id, sharepoint_root_item_id").eq("id", loc.organization_id).maybeSingle();
    const driveId = org?.sharepoint_drive_id as string | null;
    const rootItemId = (org?.sharepoint_root_item_id as string | null) ?? null;
    if (!driveId) return json({ status: "ok", skipped: "not_configured" });

    const tenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
    const clientId = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
    const secret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
    if (!tenant || !clientId || !secret) return json({ status: "ok", skipped: "no_secrets" });
    const gc = new GraphClient(tenant, clientId, secret);

    // Foldernaam = de canonieke objectnaam (mét komma: "Straat huisnr, Plaats (nr)").
    // sanitizeName strudt alleen SPO-verboden tekens (" * : < > ? / \ |); de komma blijft.
    const folderName = sanitizeName(loc.display_name || [loc.address_street, loc.city].filter(Boolean).join(", ") || `Object (${loc.location_number})`);

    if (loc.folder_item_id) {
      // Map bestaat al → hernoemen naar de canonieke naam (item-id blijft gelijk, links blijven werken).
      const renamed = await gc.renameItem(driveId, loc.folder_item_id, folderName);
      // Graph's teruggegeven webUrl is bij SPO onbetrouwbaar (eventual consistency), dus construeer
      // 'm deterministisch: vervang het laatste padsegment door de nieuwe (spatie→%20) naam.
      const newWebUrl = loc.folder_web_url
        ? loc.folder_web_url.replace(/\/[^/]*$/, "/" + folderName.replace(/ /g, "%20"))
        : (renamed.webUrl ?? null);
      if (newWebUrl && newWebUrl !== loc.folder_web_url) {
        const { error: urlErr } = await sb.from("project_locations").update({ folder_web_url: newWebUrl }).eq("id", objectId);
        if (urlErr) throw urlErr;
      }
      return json({ status: "ok", renamed: true, folder_web_url: newWebUrl ?? loc.folder_web_url });
    }

    // Nieuw object → dossiermap + submappen. De refs-write mag NIET stil falen: een genegeerde
    // 42501 (schema-hardening) liet refs leeg achter → quote-sharepoint-off maakte dubbele dossiers.
    const d = await ensureDossierFolder(gc, driveId, rootItemId ?? await gc.getDriveRootItemId(driveId), folderName);
    const { error: refErr } = await sb.from("project_locations").update({
      folder_item_id: d.folderId, folder_web_url: d.webUrl, opdracht_item_id: d.opdrachtId,
      updated_at: new Date().toISOString(),
    }).eq("id", objectId);
    if (refErr) throw refErr;

    return json({ status: "ok", folder_item_id: d.folderId, folder_web_url: d.webUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "SharePoint-map aanmaken mislukt" }, 500);
  }
});
