import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { clientFromEnv, sanitizeName, base64ToBytes } from "./sharepoint.ts";

// Gedeelde, BLOKKERENDE eerste-verzend-stap (alleen via x-internal-secret aangeroepen
// door quote-send / quote-request-signoff). Maakt het SharePoint-dossier + submappen
// aan en uploadt de ONGETEKENDE OFF. Idempotent: als de OFF al geüpload is → skip.
// Body: { quote_id, off_pdf_base64 }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUBFOLDERS = ["Foto's", "Tekeningen", "Diverse", "Leveranciers", "Facturen", "Opdracht"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    // Alleen interne (x-internal-secret) aanroepen.
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: true });
    if (!auth.ok) return auth.response;
    if (auth.kind !== "internal") return json({ status: "forbidden", message: "Alleen interne aanroep" }, 403);

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    const offB64 = typeof body.off_pdf_base64 === "string" ? body.off_pdf_base64 : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);

    // Idempotent: OFF al geüpload → niets te doen.
    if (quote.off_item_id) return json({ status: "ok", skipped: true, reason: "already_uploaded" });

    // SharePoint-config + secrets. Niet geconfigureerd → overslaan (niet blokkeren) zodat
    // de bestaande offerte-flow blijft werken tot de koppeling is ingesteld.
    const gc = clientFromEnv();
    const { data: org } = await sb.from("organizations").select("sharepoint_site_id, sharepoint_drive_id, sharepoint_root_item_id").eq("id", quote.organization_id).maybeSingle();
    const driveId = org?.sharepoint_drive_id as string | null;
    const rootItemId = org?.sharepoint_root_item_id as string | null;
    if (!gc || !driveId || !rootItemId) {
      return json({ status: "ok", skipped: true, reason: "not_configured" });
    }
    if (!offB64) return json({ status: "error", message: "off_pdf_base64 ontbreekt" }, 400);

    // Adres uit offer_details, fallback lead.
    const od = (quote.offer_details ?? {}) as Record<string, unknown>;
    let street = String(od.addressStreet ?? "").trim();
    let city = String(od.addressCity ?? "").trim();
    let postal = String(od.addressPostalCode ?? "").trim();
    if ((!street || !city) && quote.lead_id) {
      const { data: lead } = await sb.from("leads").select("address_street, postal_code, city").eq("id", quote.lead_id).maybeSingle();
      if (lead) {
        street = street || String(lead.address_street ?? "").trim();
        city = city || String(lead.city ?? "").trim();
        postal = postal || String(lead.postal_code ?? "").trim();
      }
    }
    const addrLabel = [street, city].filter(Boolean).join(" ") || String(quote.prospect_company ?? "Onbekende locatie");

    // 1. project_location resolve-or-create (trigger zet location_number).
    let locId = quote.project_location_id as string | null;
    let locNumber: number;
    if (locId) {
      const { data: loc } = await sb.from("project_locations").select("location_number").eq("id", locId).maybeSingle();
      locNumber = Number(loc?.location_number);
    } else {
      const { data: loc, error: lErr } = await sb.from("project_locations").insert({
        organization_id: quote.organization_id,
        display_name: addrLabel,
        address_street: street || null,
        postal_code: postal || null,
        city: city || null,
        company_id: quote.company_id ?? null,
        lead_id: quote.lead_id ?? null,
      }).select("id, location_number").single();
      if (lErr) throw lErr;
      locId = loc.id;
      locNumber = Number(loc.location_number);
      await sb.from("quotes").update({ project_location_id: locId }).eq("id", quoteId);
    }

    // 2. Mappenboom: dossiermap + 6 submappen.
    const folderName = sanitizeName(`${addrLabel} (${locNumber})`);
    const dossier = await gc.ensureFolder(driveId, rootItemId, folderName);
    let opdrachtId = "";
    for (const sub of SUBFOLDERS) {
      const f = await gc.ensureFolder(driveId, dossier.id, sanitizeName(sub));
      if (sub === "Opdracht") opdrachtId = f.id;
    }
    await sb.from("project_locations").update({
      display_name: folderName,
      folder_item_id: dossier.id,
      folder_web_url: dossier.webUrl,
      opdracht_item_id: opdrachtId,
      updated_at: new Date().toISOString(),
    }).eq("id", locId);

    // 3. Documentnummer (één keer; reuse bij retry).
    let docNum = Number(quote.document_number);
    if (!docNum) {
      const { data: dn, error: dErr } = await sb.rpc("assign_document_number", { p_location_id: locId });
      if (dErr) throw dErr;
      docNum = Number(dn);
      await sb.from("quotes").update({ document_number: docNum }).eq("id", quoteId);
    }

    // 4. Upload ongetekende OFF in de dossier-root.
    const yy = String(new Date().getFullYear()).slice(-2);
    const doc2 = String(docNum).padStart(2, "0");
    const offName = sanitizeName(`${locNumber}-${doc2}-${yy} OFF ${addrLabel}`) + ".pdf";
    const off = await gc.uploadFile(driveId, dossier.id, offName, base64ToBytes(offB64));
    await sb.from("quotes").update({ off_item_id: off.id, off_web_url: off.webUrl }).eq("id", quoteId);

    return json({ status: "ok", folderWebUrl: dossier.webUrl, offWebUrl: off.webUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "SharePoint-init mislukt" }, 500);
  }
});
