// Gedeelde dossier-resolutie voor offerte-gebonden SharePoint-uploads
// (OFF-pdf, interne CALC-xlsx). Eén implementatie — het kopiëren van dit
// blok was precies waar de 42501-regressie (2026-07-06) vandaan kwam.
//
// Resolvet: org-config + Graph-client, adreslabel, project_location (incl.
// dossiermap + refs-write mét error-check) en het documentnummer.

// deno-lint-ignore-file no-explicit-any
import { resolveSecret } from "./secrets.ts";
import { resolveProjectLocation } from "./projectLocation.ts";
import { joinStreetAndHouse } from "./installationHandoff.ts";
import { GraphClient, sanitizeName, ensureDossierFolder } from "./sharepoint.ts";

export type QuoteDossier =
  | { ok: true; gc: GraphClient; driveId: string; folderId: string; folderWebUrl: string | null; quote: any; addrLabel: string; offNumber: string }
  | { ok: false; skipped?: string; error?: string; status?: number };

export async function resolveQuoteDossier(sb: any, quoteId: string): Promise<QuoteDossier> {
  // Org-config (doelmap). Niet ingesteld → niet blokkeren.
  const { data: org } = await sb.from("organizations").select("id, sharepoint_drive_id, sharepoint_root_item_id").order("created_at").limit(1).maybeSingle();
  const driveId = org?.sharepoint_drive_id as string | null;
  const rootItemId = (org?.sharepoint_root_item_id as string | null) ?? null;
  if (!driveId) return { ok: false, skipped: "not_configured" };

  const [tenant, clientId, secret] = await Promise.all([
    resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id"),
    resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id"),
    resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret"),
  ]);
  if (!tenant || !clientId || !secret) return { ok: false, skipped: "no_secrets" };
  const gc = new GraphClient(tenant, clientId, secret);

  const { data: quote, error: qErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { ok: false, error: "Offerte niet gevonden", status: 404 };

  // Adres uit offer_details, fallback lead.
  const od = (quote.offer_details ?? {}) as Record<string, unknown>;
  let street = String(od.addressStreet ?? "").trim();
  let city = String(od.addressCity ?? "").trim();
  let postal = String(od.addressPostalCode ?? "").trim();
  if ((!street || !city) && quote.lead_id) {
    const { data: lead } = await sb.from("leads").select("address_street, house_number, postal_code, city").eq("id", quote.lead_id).maybeSingle();
    // leads slaan straat en huisnummer los op; hieronder is `street` één volledige regel.
    if (lead) { street = street || joinStreetAndHouse(lead.address_street, lead.house_number); city = city || (lead.city ?? ""); postal = postal || (lead.postal_code ?? ""); }
  }
  const addrLabel = [street, city].filter(Boolean).join(" ") || (quote.prospect_company ?? "Onbekende locatie");

  // project_location resolve / reuse / create.
  let locId = quote.project_location_id as string | null;
  let loc: { location_number: number; display_name: string | null; folder_item_id: string | null; opdracht_item_id: string | null; folder_web_url: string | null } | null = null;
  if (locId) {
    // Error hard doorgeven: een opgeslikte transient fout zou hieronder een
    // NIEUWE locatie resolven en de offerte stil van dossier laten wisselen.
    const { data, error } = await sb.from("project_locations").select("location_number, display_name, folder_item_id, opdracht_item_id, folder_web_url").eq("id", locId).maybeSingle();
    if (error) throw error;
    loc = data;
  }
  if (!loc) {
    const resolved = await resolveProjectLocation(sb, {
      org: quote.organization_id, company: quote.company_id ?? null,
      street, postal, city, lead: quote.lead_id ?? null, fallbackLabel: quote.prospect_company ?? undefined,
    });
    locId = resolved.id;
    const { data, error } = await sb.from("project_locations")
      .select("location_number, display_name, folder_item_id, opdracht_item_id, folder_web_url").eq("id", locId).maybeSingle();
    if (error) throw error;
    loc = data;
    const { error: linkErr } = await sb.from("quotes").update({ project_location_id: locId }).eq("id", quoteId);
    if (linkErr) throw linkErr;
  }
  if (!loc) return { ok: false, error: "Locatie kon niet worden bepaald", status: 500 };
  const locNumber = Number(loc.location_number);

  // Dossiermap + submappen (idempotent: hergebruik folder_item_id). Mapnaam = de
  // CANONIEKE objectnaam (display_name) — afwijkende namen gaven dubbele dossiers.
  let folderId = loc.folder_item_id;
  if (!folderId) {
    const folderName = sanitizeName(loc.display_name || `${addrLabel} (${locNumber})`);
    const d = await ensureDossierFolder(gc, driveId, rootItemId ?? await gc.getDriveRootItemId(driveId), folderName);
    folderId = d.folderId;
    // Alleen refs opslaan; fouten NIET stil negeren (42501-regressie 2026-07-06).
    const { error: refErr } = await sb.from("project_locations").update({
      folder_item_id: d.folderId, folder_web_url: d.webUrl,
      opdracht_item_id: d.opdrachtId, updated_at: new Date().toISOString(),
    }).eq("id", locId);
    if (refErr) throw refErr;
  }

  // Documentnummer (RPC, race-safe) — één keer.
  let docNum = Number(quote.document_number);
  if (!docNum) {
    const { data: dn, error } = await sb.rpc("assign_document_number", { p_location_id: locId });
    if (error) throw error;
    docNum = Number(dn);
    const { error: dnErr } = await sb.from("quotes").update({ document_number: docNum }).eq("id", quoteId);
    if (dnErr) throw dnErr;
  }

  const offNumber = quote.quote_number ?? `${locNumber}-${String(docNum).padStart(2, "0")}-${String(new Date().getFullYear()).slice(-2)}`;
  return { ok: true, gc, driveId, folderId: folderId!, folderWebUrl: loc.folder_web_url, quote, addrLabel, offNumber };
}
