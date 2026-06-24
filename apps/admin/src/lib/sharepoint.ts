import { supabase } from "@/integrations/supabase/client";
import type { GraphFetchFn } from "@/hooks/useGraphApi";

// Vaste dossier-submappen.
export const DOSSIER_SUBFOLDERS = ["Aanvraag", "Foto's", "Tekeningen", "Diverse", "Leveranciers", "Facturen", "Opdracht", "Oplevering"];

export interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
}

export type SharepointConfig = { siteId: string | null; driveId: string | null; siteUrl: string | null; siteName: string | null; rootItemId: string | null } | null;

// SharePoint-verboden tekens strippen.
export function sanitizeName(s: string): string {
  const out = (s || "").replace(/["*:<>?/\\|]/g, " ").replace(/\s+/g, " ").replace(/\.+$/g, "").trim().slice(0, 240);
  return out || "naamloos";
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// De gekozen SharePoint-koppeling (org-niveau; gezet door de instellingen-picker).
export async function getSharepointConfig(): Promise<SharepointConfig> {
  const { data } = await supabase
    .from("organizations")
    .select("sharepoint_site_id, sharepoint_drive_id, sharepoint_site_url, sharepoint_site_name, sharepoint_root_item_id")
    .not("sharepoint_drive_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { siteId: data.sharepoint_site_id, driveId: data.sharepoint_drive_id, siteUrl: data.sharepoint_site_url, siteName: data.sharepoint_site_name, rootItemId: data.sharepoint_root_item_id };
}

// Sla de gekozen site/drive + doelmap op de organisatie op.
export async function saveSharepointConfig(orgId: string, cfg: { site_id: string; drive_id: string; site_url: string; site_name: string; root_item_id: string | null }) {
  const { error } = await supabase.from("organizations").update({
    sharepoint_site_id: cfg.site_id,
    sharepoint_drive_id: cfg.drive_id,
    sharepoint_site_url: cfg.site_url,
    sharepoint_site_name: cfg.site_name,
    sharepoint_root_item_id: cfg.root_item_id,
  }).eq("id", orgId);
  if (error) throw error;
}

// Top-level mappen van de bibliotheek (voor de doelmap-keuze in instellingen).
export async function listLibraryFolders(graphFetch: GraphFetchFn, driveId: string): Promise<{ id: string; name: string }[]> {
  const result = await graphFetch(`/drives/${driveId}/root/children?$select=id,name,folder&$top=400`);
  return ((result?.value ?? []) as Array<{ id: string; name: string; folder?: unknown }>).filter((x) => x.folder).map((x) => ({ id: x.id, name: x.name }));
}

// Standaard-doelmap waar alle dossiers in komen.
export const DEFAULT_TARGET_FOLDER = "02 Locaties";

// Zoek de top-level map met deze naam in de bibliotheek; maak 'm aan als 'ie niet bestaat.
// Race-veilig: bij een 409 (net door iemand anders aangemaakt) opnieuw zoeken.
export async function findOrCreateFolderByName(graphFetch: GraphFetchFn, driveId: string, name = DEFAULT_TARGET_FOLDER): Promise<{ id: string; name: string }> {
  const existing = await listLibraryFolders(graphFetch, driveId);
  const hit = existing.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  try {
    const created = await graphFetch(`/drives/${driveId}/root/children`, {
      method: "POST",
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    return { id: created.id, name: created.name };
  } catch {
    const again = await listLibraryFolders(graphFetch, driveId);
    const hit2 = again.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (hit2) return hit2;
    throw new Error(`Map "${name}" kon niet worden aangemaakt`);
  }
}

// Maak de dossiermap + 6 submappen. Onder parentItemId (de gekozen doelmap) of anders de drive-root.
export async function createDossierFolder(graphFetch: GraphFetchFn, driveId: string, folderName: string, parentItemId?: string | null): Promise<{ id: string; webUrl: string; opdrachtId: string }> {
  const parentPath = parentItemId ? `/drives/${driveId}/items/${parentItemId}/children` : `/drives/${driveId}/root/children`;
  const root = await graphFetch(parentPath, {
    method: "POST",
    body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
  });
  let opdrachtId = "";
  for (const name of DOSSIER_SUBFOLDERS) {
    const f = await graphFetch(`/drives/${driveId}/items/${root.id}/children`, {
      method: "POST",
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
    });
    if (name === "Opdracht") opdrachtId = f.id;
  }
  return { id: root.id, webUrl: root.webUrl, opdrachtId };
}

export async function listFolderChildren(graphFetch: GraphFetchFn, driveId: string, folderId: string): Promise<SharePointItem[]> {
  const result = await graphFetch(`/drives/${driveId}/items/${folderId}/children`);
  return (result?.value ?? []) as SharePointItem[];
}

// Upload een bestand naar een map (<4MB direct PUT, anders upload-sessie).
export async function uploadToFolder(graphFetch: GraphFetchFn, driveId: string, folderId: string, fileName: string, content: ArrayBuffer, contentType = "application/pdf"): Promise<SharePointItem> {
  const encoded = encodeURIComponent(fileName);
  if (content.byteLength < 4 * 1024 * 1024) {
    return await graphFetch(`/drives/${driveId}/items/${folderId}:/${encoded}:/content`, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: content as BodyInit,
    }) as SharePointItem;
  }
  const session = await graphFetch(`/drives/${driveId}/items/${folderId}:/${encoded}:/createUploadSession`, {
    method: "POST",
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name: fileName } }),
  });
  const chunkSize = 3200 * 1024;
  const total = content.byteLength;
  let offset = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = content.slice(offset, end);
    result = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${total}`, "Content-Length": String(chunk.byteLength) },
      body: chunk,
    }).then((r) => r.json());
    offset = end;
  }
  return result as SharePointItem;
}

// Idempotente eerste-verzend-stap: dossiermap + ongetekende OFF.
// Gooit een fout bij problemen (verzenden blokkeert). Geeft { skipped } als de OFF er al is.
export async function ensureDossierAndUploadOff(graphFetch: GraphFetchFn, quoteId: string, offPdfBase64: string): Promise<{ skipped?: boolean }> {
  // SharePoint nog niet ingesteld (geen drive gekozen) → niet blokkeren, de bestaande
  // offerte-flow blijft werken tot een admin de koppeling in Instellingen instelt.
  const cfg = await getSharepointConfig();
  if (!cfg?.driveId) return { skipped: true };

  const { data: quote, error: qErr } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (qErr) throw qErr;
  if (!quote) throw new Error("Offerte niet gevonden");
  if (quote.off_item_id) return { skipped: true };

  // Adres uit offer_details, fallback lead.
  const od = (quote.offer_details ?? {}) as Record<string, unknown>;
  let street = String(od.addressStreet ?? "").trim();
  let city = String(od.addressCity ?? "").trim();
  let postal = String(od.addressPostalCode ?? "").trim();
  if ((!street || !city) && quote.lead_id) {
    const { data: lead } = await supabase.from("leads").select("address_street, postal_code, city").eq("id", quote.lead_id).maybeSingle();
    if (lead) { street = street || (lead.address_street ?? ""); city = city || (lead.city ?? ""); postal = postal || (lead.postal_code ?? ""); }
  }
  const addrLabel = [street, city].filter(Boolean).join(" ") || (quote.prospect_company ?? "Onbekende locatie");

  // project_location (server-side trigger zet location_number) — idempotent.
  let locId = quote.project_location_id as string | null;
  let loc: { location_number: number; folder_item_id: string | null; opdracht_item_id: string | null; folder_web_url: string | null } | null = null;
  if (locId) {
    const { data } = await supabase.from("project_locations").select("location_number, folder_item_id, opdracht_item_id, folder_web_url").eq("id", locId).maybeSingle();
    loc = data;
  }
  // Tweede offerte voor dezelfde locatie (zelfde bedrijf + adres) → hergebruik de bestaande
  // locatie/map; het documentnummer telt door (201-01 → 201-02). Alleen bij een echt adres.
  if (!loc && street.trim() && city.trim()) {
    let mq = supabase.from("project_locations")
      .select("id, location_number, folder_item_id, opdracht_item_id, folder_web_url")
      .eq("organization_id", quote.organization_id)
      .ilike("address_street", street.trim())
      .ilike("city", city.trim())
      .limit(1);
    mq = quote.company_id ? mq.eq("company_id", quote.company_id) : mq.is("company_id", null);
    const { data: match } = await mq.maybeSingle();
    if (match) {
      locId = match.id;
      loc = { location_number: match.location_number, folder_item_id: match.folder_item_id, opdracht_item_id: match.opdracht_item_id, folder_web_url: match.folder_web_url };
      await supabase.from("quotes").update({ project_location_id: locId }).eq("id", quoteId);
    }
  }
  if (!loc) {
    const { data: created, error } = await supabase.from("project_locations").insert({
      organization_id: quote.organization_id, display_name: addrLabel,
      address_street: street || null, postal_code: postal || null, city: city || null,
      company_id: quote.company_id ?? null, lead_id: quote.lead_id ?? null,
    }).select("id, location_number, folder_item_id, opdracht_item_id, folder_web_url").single();
    if (error) throw error;
    locId = created.id;
    loc = created;
    await supabase.from("quotes").update({ project_location_id: locId }).eq("id", quoteId);
  }
  const locNumber = Number(loc.location_number);

  // Map + submappen (idempotent: hergebruik bestaande folder_item_id).
  let folderId = loc.folder_item_id;
  if (!folderId) {
    const folderName = sanitizeName(`${addrLabel} (${locNumber})`);
    const dossier = await createDossierFolder(graphFetch, cfg.driveId, folderName, cfg.rootItemId);
    folderId = dossier.id;
    await supabase.from("project_locations").update({
      display_name: folderName, folder_item_id: dossier.id, folder_web_url: dossier.webUrl,
      opdracht_item_id: dossier.opdrachtId, updated_at: new Date().toISOString(),
    }).eq("id", locId);
  }

  // Documentnummer (RPC, race-safe) — één keer.
  let docNum = Number(quote.document_number);
  if (!docNum) {
    const { data: dn, error } = await supabase.rpc("assign_document_number", { p_location_id: locId });
    if (error) throw error;
    docNum = Number(dn);
    await supabase.from("quotes").update({ document_number: docNum }).eq("id", quoteId);
  }

  // Upload ongetekende OFF in de dossier-root.
  const yy = String(new Date().getFullYear()).slice(-2);
  const doc2 = String(docNum).padStart(2, "0");
  const offName = sanitizeName(`${locNumber}-${doc2}-${yy} OFF ${addrLabel}`) + ".pdf";
  const off = await uploadToFolder(graphFetch, cfg.driveId, folderId!, offName, base64ToArrayBuffer(offPdfBase64));
  await supabase.from("quotes").update({ off_item_id: off.id, off_web_url: off.webUrl }).eq("id", quoteId);
  return {};
}
