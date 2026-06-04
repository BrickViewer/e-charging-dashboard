export interface RoadConfig { apiKey: string; providerId: string; baseUrl?: string; }
export interface RoadErrorPayload { type?: string; message: string; status?: number; }
export class RoadApiError extends Error {
  status: number; payload: RoadErrorPayload;
  constructor(status: number, payload: RoadErrorPayload) {
    super(payload.message || `Road API error ${status}`);
    this.name = "RoadApiError"; this.status = status; this.payload = payload;
  }
}
export class RoadClient {
  private baseUrl: string; private apiKey: string; private providerId: string;
  constructor(config: RoadConfig) {
    this.apiKey = config.apiKey; this.providerId = config.providerId;
    this.baseUrl = config.baseUrl ?? "https://api.road.io";
  }
  async rawRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`, "Provider": this.providerId, "Accept": "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let payload: RoadErrorPayload = { message: res.statusText, status: res.status };
      try {
        const json = await res.json();
        if (json?.error) payload = { ...json.error, status: res.status };
      } catch (_) {
        // Road sometimes returns an empty body for error responses.
      }
      throw new RoadApiError(res.status, payload);
    }
    if (res.status === 204) return undefined;
    return await res.json();
  }
}
export function clientFromEnvAndOrg(org: { eflux_provider_id?: string | null }): RoadClient | null {
  const apiKey = Deno.env.get("EFLUX_API_KEY");
  if (!apiKey || !org.eflux_provider_id) return null;
  return new RoadClient({ apiKey, providerId: org.eflux_provider_id });
}
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
