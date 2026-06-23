/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge fn: dynamische Road JSON */
// Road.io / e-Flux platform API client — MSP/roaming variant (Deno).
// Read-only: haalt roaming-locaties (de "MSP Locaties"-kaart) + tarieven op.
// Auth identiek aan de andere road-api kopieën: Bearer EFLUX_API_KEY + Provider-header.
import { CORS_ROAD } from "../_shared/cors.ts";

export interface RoadConfig {
  apiKey: string;
  providerId: string;
  baseUrl?: string;
}

export interface RoadErrorPayload {
  type?: string;
  message: string;
  status?: number;
  details?: Array<{ message: string; path?: string[]; type?: string; code?: string }>;
}

export class RoadApiError extends Error {
  status: number;
  payload: RoadErrorPayload;
  constructor(status: number, payload: RoadErrorPayload) {
    super(payload.message || `Road API error ${status}`);
    this.name = "RoadApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Eén poging tegen de roaming-search (voor diagnostiek + zelf-ontdekking van het juiste pad/params).
export interface ProbeAttempt {
  path: string;
  query: Record<string, string>;
  status: number;
  ok: boolean;
  message?: string;
  details?: unknown;
}

export class RoadClient {
  private baseUrl: string;
  private apiKey: string;
  private providerId: string;

  constructor(config: RoadConfig) {
    this.apiKey = config.apiKey;
    this.providerId = config.providerId;
    this.baseUrl = config.baseUrl ?? "https://api.road.io";
  }

  // deno-lint-ignore no-explicit-any
  async rawRequest(method: string, path: string, query?: Record<string, string>, body?: unknown): Promise<any> {
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
    const url = `${this.baseUrl}${path}${qs}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Provider": this.providerId,
      "Accept": "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });

    if (!res.ok) {
      let payload: RoadErrorPayload = { message: res.statusText, status: res.status };
      try {
        const json = await res.json();
        if (json?.error) payload = { ...json.error, status: res.status };
        else if (json?.message) payload = { message: json.message, status: res.status, details: json.details };
      } catch (_) { /* body niet JSON */ }
      throw new RoadApiError(res.status, payload);
    }
    if (res.status === 204) return undefined;
    return await res.json();
  }

  // Probeert de roaming map-search over kandidaat-paden + param-conventies. Geeft de eerste
  // geslaagde respons terug (met het werkende pad) plus de volledige poging-log voor diagnostiek.
  // deno-lint-ignore no-explicit-any
  async searchRoamingMap(bbox: BoundingBox, zoom?: number): Promise<{ path: string; query: Record<string, string>; data: any; attempts: ProbeAttempt[] }> {
    const candidatePaths = [
      "/roaming/search/map/search",
      "/1/roaming/search/map/search",
      "/2/roaming/search/map/search",
    ];
    const z = typeof zoom === "number" ? String(Math.round(zoom)) : undefined;
    const paramSets: Record<string, string>[] = [
      // meest waarschijnlijke conventies; details van een 400 vertellen ons de echte namen
      { minLat: String(bbox.south), maxLat: String(bbox.north), minLng: String(bbox.west), maxLng: String(bbox.east), ...(z ? { zoom: z } : {}) },
      { swLat: String(bbox.south), swLng: String(bbox.west), neLat: String(bbox.north), neLng: String(bbox.east), ...(z ? { zoom: z } : {}) },
      { north: String(bbox.north), south: String(bbox.south), east: String(bbox.east), west: String(bbox.west), ...(z ? { zoom: z } : {}) },
      { boundingBox: `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`, ...(z ? { zoom: z } : {}) },
    ];
    const attempts: ProbeAttempt[] = [];
    for (const path of candidatePaths) {
      let pathExists = true;
      for (const query of paramSets) {
        try {
          const data = await this.rawRequest("GET", path, query);
          attempts.push({ path, query, status: 200, ok: true });
          return { path, query, data, attempts };
        } catch (err) {
          if (err instanceof RoadApiError) {
            attempts.push({ path, query, status: err.status, ok: false, message: err.payload.message, details: err.payload.details });
            if (err.status === 404) { pathExists = false; break; } // pad bestaat niet → volgende pad
            // 400/422 → verkeerde params → probeer volgende param-set op ditzelfde pad
            if (err.status !== 400 && err.status !== 422) break; // andere fout (401/403/5xx) → stop met dit pad
          } else {
            attempts.push({ path, query, status: 0, ok: false, message: (err as Error).message });
            break;
          }
        }
      }
      if (!pathExists) continue;
    }
    throw new RoadApiError(attempts[attempts.length - 1]?.status ?? 502, {
      message: "Geen werkend roaming map-search endpoint gevonden",
      details: attempts as unknown as RoadErrorPayload["details"],
    });
  }

  // Tarief per locatie/EVSE — pas bij selectie. Zelfde pad-fallback.
  // deno-lint-ignore no-explicit-any
  async getRoamingTariff(params: Record<string, string>): Promise<{ path: string; data: any }> {
    const candidatePaths = ["/roaming/search/map/tariff", "/1/roaming/search/map/tariff", "/2/roaming/search/map/tariff"];
    let lastErr: RoadApiError | null = null;
    for (const path of candidatePaths) {
      try {
        const data = await this.rawRequest("GET", path, params);
        return { path, data };
      } catch (err) {
        if (err instanceof RoadApiError) { lastErr = err; if (err.status !== 404) break; }
        else throw err;
      }
    }
    throw lastErr ?? new RoadApiError(502, { message: "Geen werkend roaming tarief-endpoint" });
  }
}

export function clientFromEnvAndOrg(org: { eflux_provider_id?: string | null }): RoadClient | null {
  const apiKey = Deno.env.get("EFLUX_API_KEY");
  if (!apiKey || !org.eflux_provider_id) return null;
  return new RoadClient({ apiKey, providerId: org.eflux_provider_id });
}

export const corsHeaders = CORS_ROAD;
