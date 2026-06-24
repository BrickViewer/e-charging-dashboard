// Microsoft Graph (SharePoint) client — gedeelde module. Eén canonieke GraphClient
// voor alle edge functions (quote-sharepoint-off / quote-accept / quote-opd-sync /
// object-delete). Wordt via de folder-prefixed deploy meegebundeld als
// _shared/sharepoint.ts (zelfde patroon als _shared/auth.ts), dus géén losse kopie
// meer naast elke functie.

export const GRAPH = "https://graph.microsoft.com/v1.0";

export class SharepointError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "SharepointError";
    this.status = status;
    this.payload = payload;
  }
}

export interface DriveItem { id: string; name: string; webUrl: string; size?: number; isFolder: boolean; lastModified?: string }

// Token-cache op module-niveau: edge-isolates worden hergebruikt, dus één token
// (~60 min geldig) wordt over warme invocaties hergebruikt.
let cachedToken: { token: string; expiresAt: number } | null = null;

// deno-lint-ignore no-explicit-any
function mapItem(x: any): DriveItem {
  return { id: x.id, name: x.name, webUrl: x.webUrl, size: x.size, isFolder: !!x.folder, lastModified: x.lastModifiedDateTime };
}

export class GraphClient {
  constructor(private tenantId: string, private clientId: string, private clientSecret: string) {}

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt - now > 5 * 60 * 1000) return cachedToken.token;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new SharepointError(res.status, `Token-fout: ${json.error_description || res.statusText}`, json);
    cachedToken = { token: json.access_token, expiresAt: now + (Number(json.expires_in || 3600) * 1000) };
    return cachedToken.token;
  }

  private async request<T>(method: string, path: string, opts: { body?: unknown; raw?: Uint8Array; contentType?: string; attempt?: number } = {}): Promise<T> {
    const attempt = opts.attempt ?? 0;
    const token = await this.getToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    let bodyInit: BodyInit | undefined;
    if (opts.raw !== undefined) {
      headers["Content-Type"] = opts.contentType ?? "application/octet-stream";
      bodyInit = opts.raw;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyInit = JSON.stringify(opts.body);
    }
    const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
    const res = await fetch(url, { method, headers, body: bodyInit });

    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const wait = retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return this.request<T>(method, path, { ...opts, attempt: attempt + 1 });
    }
    if (!res.ok) {
      let payload: unknown = null;
      try { payload = await res.json(); } catch { payload = await res.text().catch(() => null); }
      // deno-lint-ignore no-explicit-any
      const msg = (payload && typeof payload === "object" && (payload as any).error?.message) || res.statusText;
      throw new SharepointError(res.status, `Graph ${res.status}: ${msg}`, payload);
    }
    if (res.status === 204) return undefined as T;
    return await res.json() as T;
  }

  async resolveSite(hostname: string, sitePath: string): Promise<{ id: string; webUrl: string }> {
    const data = await this.request<{ id: string; webUrl: string }>("GET", `/sites/${hostname}:/sites/${sitePath}`);
    return { id: data.id, webUrl: data.webUrl };
  }
  async getDefaultDrive(siteId: string): Promise<{ id: string }> {
    const data = await this.request<{ id: string }>("GET", `/sites/${siteId}/drive`);
    return { id: data.id };
  }
  async getDriveRootItemId(driveId: string): Promise<string> {
    const data = await this.request<{ id: string }>("GET", `/drives/${driveId}/root`);
    return data.id;
  }
  async getChildByName(driveId: string, parentItemId: string, name: string): Promise<DriveItem | null> {
    const data = await this.request<{ value: unknown[] }>("GET", `/drives/${driveId}/items/${parentItemId}/children?$select=id,name,webUrl,size,file,folder,lastModifiedDateTime&$top=400`);
    // deno-lint-ignore no-explicit-any
    const it = (data.value || []).find((x: any) => x.name === name);
    return it ? mapItem(it) : null;
  }
  async ensureFolder(driveId: string, parentItemId: string, name: string): Promise<DriveItem> {
    try {
      const data = await this.request<unknown>("POST", `/drives/${driveId}/items/${parentItemId}/children`, {
        body: { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
      });
      return mapItem(data);
    } catch (e) {
      if (e instanceof SharepointError && (e.status === 409 || e.status === 400)) {
        const existing = await this.getChildByName(driveId, parentItemId, name);
        if (existing) return existing;
      }
      throw e;
    }
  }
  async uploadFile(driveId: string, parentItemId: string, name: string, bytes: Uint8Array, contentType = "application/pdf"): Promise<DriveItem> {
    const data = await this.request<unknown>("PUT", `/drives/${driveId}/items/${parentItemId}:/${encodeURIComponent(name)}:/content`, { raw: bytes, contentType });
    return mapItem(data);
  }
  async listChildren(driveId: string, itemId: string): Promise<DriveItem[]> {
    const data = await this.request<{ value: unknown[] }>("GET", `/drives/${driveId}/items/${itemId}/children?$select=id,name,webUrl,size,file,folder,lastModifiedDateTime&$top=400`);
    return (data.value || []).map(mapItem);
  }

  // Verwijder een drive-item. 204/404 = success (verwijderd of al weg). Spiegelt de
  // voormalige inline object-delete-impl 1:1: directe DELETE, géén retry, zelfde
  // foutmelding. (Token komt uit de gedeelde, gecachte getToken.)
  async deleteItem(driveId: string, itemId: string): Promise<void> {
    const token = await this.getToken();
    const path = `/drives/${driveId}/items/${itemId}`;
    const res = await fetch(`${GRAPH}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 204 || res.status === 404) return; // verwijderd of al weg
    // deno-lint-ignore no-explicit-any
    const j: any = await res.json().catch(() => ({}));
    throw new Error(`Graph ${res.status} op DELETE ${path}: ${j.error?.message || res.statusText}`);
  }
}

// Strip SharePoint-verboden tekens (" * : < > ? / \ |), normaliseer spaties + trailing dots.
export function sanitizeName(s: string): string {
  const out = (s || "")
    .replace(/["*:<>?/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 240);
  return out || "naamloos";
}

export function clientFromEnv(): GraphClient | null {
  const t = Deno.env.get("SHAREPOINT_TENANT_ID");
  const c = Deno.env.get("SHAREPOINT_CLIENT_ID");
  const s = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!t || !c || !s) return null;
  return new GraphClient(t, c, s);
}

// Standaard dossier-map + submappen (idempotent via ensureFolder). Eén bron van waarheid
// voor zowel quote-sharepoint-off (offerte) als object-ensure-folder (bij object-aanmaak).
export const DOSSIER_SUBFOLDERS = ["Aanvraag", "Foto's", "Tekeningen", "Diverse", "Leveranciers", "Facturen", "Opdracht", "Oplevering"];

export async function ensureDossierFolder(
  gc: GraphClient,
  driveId: string,
  parentItemId: string,
  folderName: string,
): Promise<{ folderId: string; webUrl: string; opdrachtId: string }> {
  const dossier = await gc.ensureFolder(driveId, parentItemId, folderName);
  let opdrachtId = "";
  for (const sub of DOSSIER_SUBFOLDERS) {
    const f = await gc.ensureFolder(driveId, dossier.id, sub);
    if (sub === "Opdracht") opdrachtId = f.id;
  }
  return { folderId: dossier.id, webUrl: dossier.webUrl, opdrachtId };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
