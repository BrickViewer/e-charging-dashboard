import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveSecret } from "../_shared/secrets.ts";

// sharepoint-setup — zet de org-brede SharePoint-doelmap vast op basis van NAMEN
// (site → bibliotheek → map) via app-only Graph. Bypasst de client-side mapkiezer.
// Body: { site_query?: "E-Charging", drive_name?: "Documenten", folder_name?: "02 Locaties" }

const GRAPH = "https://graph.microsoft.com/v1.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
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
// deno-lint-ignore no-explicit-any
async function graphGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph ${res.status} op ${path}: ${j.error?.message || res.statusText}`);
  return j;
}
// deno-lint-ignore no-explicit-any
async function graphSend(token: string, method: string, path: string, jsonBody?: unknown, raw?: Uint8Array, contentType?: string): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let body: BodyInit | undefined;
  if (raw !== undefined) { headers["Content-Type"] = contentType ?? "application/octet-stream"; body = raw; }
  else if (jsonBody !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(jsonBody); }
  const res = await fetch(`${GRAPH}${path}`, { method, headers, body });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph ${res.status} op ${method} ${path}: ${j.error?.message || res.statusText}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const siteQuery = String(body.site_query ?? "E-Charging").trim();
    const driveName = String(body.drive_name ?? "Documenten").trim();
    const folderName = String(body.folder_name ?? "02 Locaties").trim();

    const tenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
    const clientId = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
    const secret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
    if (!tenant || !clientId || !secret) return json({ status: "error", message: "SharePoint-secrets ontbreken (SHAREPOINT_*)" }, 400);

    const token = await getToken(tenant, clientId, secret);

    // 1) Site zoeken op naam.
    const sitesRes = await graphGet(token, `/sites?search=${encodeURIComponent(siteQuery)}`);
    const sites = (sitesRes.value ?? []) as Array<{ id: string; displayName?: string; name?: string; webUrl: string }>;
    const site = sites.find((s) => (s.displayName ?? s.name ?? "").toLowerCase() === siteQuery.toLowerCase()) ?? sites[0];
    if (!site) return json({ status: "error", message: `Site "${siteQuery}" niet gevonden`, sites_found: sites.map((s) => s.displayName ?? s.name) }, 404);

    // 2) Documentbibliotheek op naam (val terug op de standaard documentLibrary).
    const drivesRes = await graphGet(token, `/sites/${site.id}/drives`);
    const drives = (drivesRes.value ?? []) as Array<{ id: string; name: string; driveType?: string }>;
    const drive = drives.find((d) => (d.name ?? "").toLowerCase() === driveName.toLowerCase())
      ?? drives.find((d) => d.driveType === "documentLibrary") ?? drives[0];
    if (!drive) return json({ status: "error", message: `Bibliotheek "${driveName}" niet gevonden`, drives_found: drives.map((d) => d.name) }, 404);

    // 3) Doelmap op naam in de root van de bibliotheek.
    const childrenRes = await graphGet(token, `/drives/${drive.id}/root/children?$select=id,name,folder&$top=400`);
    const children = (childrenRes.value ?? []) as Array<{ id: string; name: string; folder?: unknown }>;
    const folder = children.find((c) => c.folder && (c.name ?? "").toLowerCase() === folderName.toLowerCase());
    if (!folder) return json({ status: "error", message: `Map "${folderName}" niet gevonden in bibliotheek "${drive.name}"`, folders_found: children.filter((c) => c.folder).map((c) => c.name) }, 404);

    // 4) Org-config vastleggen.
    const { data: org } = await sb.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
    if (!org) return json({ status: "error", message: "Geen organisatie gevonden" }, 404);
    const { error: upErr } = await sb.from("organizations").update({
      sharepoint_site_id: site.id,
      sharepoint_site_url: site.webUrl,
      sharepoint_site_name: site.displayName ?? site.name ?? siteQuery,
      sharepoint_drive_id: drive.id,
      sharepoint_root_item_id: folder.id,
    }).eq("id", org.id);
    if (upErr) throw upErr;

    // Optionele schrijf-test: map + bestand aanmaken ín de doelmap (precies wat de
    // OPD-upload doet), daarna opruimen. Bevestigt dat app-only WRITE werkt.
    let writeTest: string | null = null;
    if (body.test_write === true) {
      const testFolder = await graphSend(token, "POST", `/drives/${drive.id}/items/${folder.id}/children`,
        { name: "_verbindingstest", folder: {}, "@microsoft.graph.conflictBehavior": "rename" });
      await graphSend(token, "PUT", `/drives/${drive.id}/items/${testFolder.id}:/test.txt:/content`,
        undefined, new TextEncoder().encode("verbindingstest OK"), "text/plain");
      await graphSend(token, "DELETE", `/drives/${drive.id}/items/${testFolder.id}`);
      writeTest = "ok (map + bestand aangemaakt en weer opgeruimd)";
    }

    return json({
      status: "ok",
      site: site.displayName ?? site.name,
      site_url: site.webUrl,
      drive: drive.name,
      folder: folder.name,
      folder_id: folder.id,
      write_test: writeTest,
    });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Setup mislukt" }, 500);
  }
});
