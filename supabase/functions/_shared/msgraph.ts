// Kleine generieke Microsoft Graph-helper (app-only, client credentials) voor
// niet-SharePoint-functies zoals graph-agenda. Gebruikt dezelfde Azure-app en
// dezelfde SHAREPOINT_*-secrets als _shared/sharepoint.ts; de benodigde
// application-permissies (bv. Calendars.ReadWrite) worden op die app verleend.

let cachedToken: { token: string; expiresAt: number } | null = null;

export class GraphError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.payload = payload;
  }
}

async function getToken(): Promise<string> {
  const tenant = Deno.env.get("SHAREPOINT_TENANT_ID");
  const clientId = Deno.env.get("SHAREPOINT_CLIENT_ID");
  const secret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!tenant || !clientId || !secret) throw new GraphError(500, "Graph-credentials (SHAREPOINT_*) ontbreken");

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 5 * 60 * 1000) return cachedToken.token;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  // deno-lint-ignore no-explicit-any
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new GraphError(res.status, `Token-fout: ${json.error_description || res.statusText}`, json);
  cachedToken = { token: json.access_token, expiresAt: now + (Number(json.expires_in || 3600) * 1000) };
  return cachedToken.token;
}

/** Rauwe Graph-call; gooit GraphError bij een non-2xx (status = Graph-status). */
export async function graphFetch<T>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  // deno-lint-ignore no-explicit-any
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw new GraphError(res.status, msg, json);
  }
  return json as T;
}
