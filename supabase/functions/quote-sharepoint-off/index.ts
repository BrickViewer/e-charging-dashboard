import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { resolveProjectLocation } from "../_shared/projectLocation.ts";
import { GraphClient, sanitizeName, base64ToBytes } from "../_shared/sharepoint.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// quote-sharepoint-off — maakt server-side (app-only) het dossier + de ongetekende OFF aan.
// Vervangt de browser/delegated-variant, zodat admins geen Microsoft-Graph-token nodig hebben.
// Body: { quote_id, off_pdf_base64 }. Idempotent (skip als off_item_id al gezet).

const DOSSIER_SUBFOLDERS = ["Foto's", "Tekeningen", "Diverse", "Leveranciers", "Facturen", "Opdracht"];
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
    const quoteId = String(body.quote_id ?? "").trim();
    const offPdfBase64 = String(body.off_pdf_base64 ?? "");
    if (!quoteId || !offPdfBase64) return json({ status: "error", message: "quote_id en off_pdf_base64 verplicht" }, 400);

    // Org-config (doelmap). Niet ingesteld → niet blokkeren.
    const { data: org } = await sb.from("organizations").select("id, sharepoint_drive_id, sharepoint_root_item_id").order("created_at").limit(1).maybeSingle();
    const driveId = org?.sharepoint_drive_id as string | null;
    const rootItemId = (org?.sharepoint_root_item_id as string | null) ?? null;
    if (!driveId) return json({ status: "ok", skipped: "not_configured" });

    const tenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
    const clientId = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
    const secret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
    if (!tenant || !clientId || !secret) return json({ status: "ok", skipped: "no_secrets" });
    const gc = new GraphClient(tenant, clientId, secret);

    const { data: quote, error: qErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    if (quote.off_item_id) return json({ status: "ok", skipped: true });

    // Adres uit offer_details, fallback lead.
    const od = (quote.offer_details ?? {}) as Record<string, unknown>;
    let street = String(od.addressStreet ?? "").trim();
    let city = String(od.addressCity ?? "").trim();
    let postal = String(od.addressPostalCode ?? "").trim();
    if ((!street || !city) && quote.lead_id) {
      const { data: lead } = await sb.from("leads").select("address_street, postal_code, city").eq("id", quote.lead_id).maybeSingle();
      if (lead) { street = street || (lead.address_street ?? ""); city = city || (lead.city ?? ""); postal = postal || (lead.postal_code ?? ""); }
    }
    const addrLabel = [street, city].filter(Boolean).join(" ") || (quote.prospect_company ?? "Onbekende locatie");

    // project_location resolve / reuse (zelfde bedrijf+adres → 201-02) / create.
    let locId = quote.project_location_id as string | null;
    let loc: { location_number: number; folder_item_id: string | null; opdracht_item_id: string | null; folder_web_url: string | null } | null = null;
    if (locId) {
      const { data } = await sb.from("project_locations").select("location_number, folder_item_id, opdracht_item_id, folder_web_url").eq("id", locId).maybeSingle();
      loc = data;
    }
    if (!loc) {
      // Legacy/zonder vooraf gekoppeld object: resolve via de gedeelde helper (genormaliseerde match).
      const resolved = await resolveProjectLocation(sb, {
        org: quote.organization_id, company: quote.company_id ?? null,
        street, postal, city, lead: quote.lead_id ?? null, fallbackLabel: quote.prospect_company ?? undefined,
      });
      locId = resolved.id;
      const { data } = await sb.from("project_locations")
        .select("location_number, folder_item_id, opdracht_item_id, folder_web_url").eq("id", locId).maybeSingle();
      loc = data;
      await sb.from("quotes").update({ project_location_id: locId }).eq("id", quoteId);
    }
    if (!loc) return json({ status: "error", message: "Locatie kon niet worden bepaald" }, 500);
    const locNumber = Number(loc.location_number);

    // Dossiermap + 6 submappen onder de doelmap (idempotent: hergebruik folder_item_id).
    let folderId = loc.folder_item_id;
    if (!folderId) {
      const folderName = sanitizeName(`${addrLabel} (${locNumber})`);
      const dossier = await gc.ensureFolder(driveId, rootItemId ?? await gc.getDriveRootItemId(driveId), folderName);
      folderId = dossier.id;
      let opdrachtId = "";
      for (const sub of DOSSIER_SUBFOLDERS) {
        const f = await gc.ensureFolder(driveId, dossier.id, sub);
        if (sub === "Opdracht") opdrachtId = f.id;
      }
      await sb.from("project_locations").update({
        display_name: folderName, folder_item_id: dossier.id, folder_web_url: dossier.webUrl,
        opdracht_item_id: opdrachtId, updated_at: new Date().toISOString(),
      }).eq("id", locId);
    }

    // Documentnummer (RPC, race-safe) — één keer.
    let docNum = Number(quote.document_number);
    if (!docNum) {
      const { data: dn, error } = await sb.rpc("assign_document_number", { p_location_id: locId });
      if (error) throw error;
      docNum = Number(dn);
      await sb.from("quotes").update({ document_number: docNum }).eq("id", quoteId);
    }

    // Upload de ongetekende OFF in de dossier-root. Bestandsnaam = offertenummer (201-01-26).
    const offNumber = quote.quote_number ?? `${locNumber}-${String(docNum).padStart(2, "0")}-${String(new Date().getFullYear()).slice(-2)}`;
    const offName = sanitizeName(`${offNumber} OFF ${addrLabel}`) + ".pdf";
    const off = await gc.uploadFile(driveId, folderId!, offName, base64ToBytes(offPdfBase64));
    await sb.from("quotes").update({ off_item_id: off.id, off_web_url: off.webUrl }).eq("id", quoteId);

    return json({ status: "ok", folder_web_url: loc.folder_web_url, off_web_url: off.webUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "SharePoint-dossier mislukt" }, 500);
  }
});
