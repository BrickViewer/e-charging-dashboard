/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge fn: dynamische Road JSON */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { type BoundingBox, clientFromEnvAndOrg, corsHeaders, RoadApiError, RoadClient } from "./road-api.ts";

// Haalt de MSP/roaming-laadlocaties op (de "MSP Locaties"-kaart uit de e-Flux-portal) voor een
// bounding box, of het tarief van één locatie. Read-only; admin-gated. Body:
//   { bbox: {north,south,east,west}, zoom? }            → locaties in beeld
//   { action: "tariff", locationId, evseId? }           → pricing van één locatie
// Het exacte Road-pad/veldnamen worden zelf-ontdekt (pad-fallback) en gelogd voor finalisatie.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
function num(v: any): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// deno-lint-ignore no-explicit-any
function firstArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const k of ["data", "locations", "results", "items", "features"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

// Defensieve mapping: de exacte Road-veldnamen kennen we pas na de eerste live-call (zie debug-log).
// Daarom proberen we meerdere gangbare namen + GeoJSON (features/geometry).
// deno-lint-ignore no-explicit-any
function normalizeLocation(raw: any) {
  const p = raw?.properties ?? raw; // GeoJSON feature → properties
  const geom = raw?.geometry?.coordinates ?? raw?.geoLocation?.coordinates ?? p?.geoLocation?.coordinates;
  let lat = num(p?.latitude ?? p?.lat ?? raw?.latitude ?? raw?.lat);
  let lng = num(p?.longitude ?? p?.lng ?? p?.lon ?? raw?.longitude ?? raw?.lng);
  if ((lat === null || lng === null) && Array.isArray(geom) && geom.length >= 2) {
    lng = num(geom[0]); lat = num(geom[1]); // GeoJSON = [lng, lat]
  }
  // deno-lint-ignore no-explicit-any
  const evsesRaw: any[] = Array.isArray(p?.evses) ? p.evses : Array.isArray(p?.connectors) ? p.connectors : [];
  const evses = evsesRaw.map((e) => ({
    evseId: e?.evseId ?? e?.uid ?? e?.id ?? e?.ocppIdentity ?? null,
    status: e?.status ?? e?.availability ?? null,
    connectorType: e?.connectorType ?? e?.standard ?? e?.type ?? null,
    maxPower: num(e?.maxPower ?? e?.power ?? e?.maxPowerKw),
  }));
  const availableCount = num(p?.availableEvses ?? p?.available ?? p?.numAvailable);
  const totalCount = num(p?.totalEvses ?? p?.total ?? p?.numEvses) ?? (evses.length || null);
  const joinedStreet = [p?.street, p?.streetNumber].filter(Boolean).join(" ");
  const address = p?.address ?? (joinedStreet || p?.fullAddress || null);
  return {
    id: p?.id ?? p?.locationId ?? p?.externalId ?? p?.uid ?? raw?.id ?? null,
    name: p?.name ?? p?.locationName ?? p?.displayName ?? null,
    address,
    city: p?.city ?? null,
    postalCode: p?.postal_code ?? p?.postalCode ?? null,
    lat, lng,
    available: availableCount,
    total: totalCount,
    operator: p?.operator?.name ?? p?.operatorName ?? p?.cpoName ?? p?.operator ?? null,
    evses,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const { data: org, error } = await supabase
      .from("organizations").select("eflux_provider_id").limit(1).maybeSingle();
    if (error) throw error;

    const client: RoadClient | null = clientFromEnvAndOrg(org ?? {});
    if (!client) return json({ status: "not_configured", message: "EFLUX_API_KEY of Road Provider ID ontbreekt" });

    const body = await req.json().catch(() => ({}));

    // --- Tarief van één locatie (bij selectie) ---
    if (body?.action === "tariff") {
      const params: Record<string, string> = {};
      if (body.locationId) params.locationId = String(body.locationId);
      if (body.evseId) params.evseId = String(body.evseId);
      try {
        const { path, data } = await client.getRoamingTariff(params);
        console.log("[msp-locations] tariff", JSON.stringify({ path, sample: data }));
        // deno-lint-ignore no-explicit-any
        const t: any = data?.data ?? data;
        return json({
          status: "ok",
          tariff: {
            perKwh: num(t?.perKwh ?? t?.pricePerKwh ?? t?.energy ?? t?.kwhPrice),
            perHour: num(t?.perHour ?? t?.pricePerHour ?? t?.time ?? t?.hourPrice),
            currency: t?.currency ?? "EUR",
          },
          raw: t,
        });
      } catch (err) {
        if (err instanceof RoadApiError) return json({ status: "road_error", statusCode: err.status, message: err.message, details: err.payload.details });
        throw err;
      }
    }

    // --- Locaties in de bounding box ---
    const b = body?.bbox ?? {};
    const bbox: BoundingBox = { north: Number(b.north), south: Number(b.south), east: Number(b.east), west: Number(b.west) };
    if (![bbox.north, bbox.south, bbox.east, bbox.west].every((n) => Number.isFinite(n))) {
      return json({ status: "error", message: "bbox {north,south,east,west} vereist" }, 400);
    }

    try {
      const { path, query, data, attempts } = await client.searchRoamingMap(bbox, body?.zoom);
      const items = firstArray(data);
      const MAX = 500;
      const capped = items.length > MAX;
      const locations = items.slice(0, MAX).map(normalizeLocation).filter((l) => l.lat !== null && l.lng !== null);
      // Shape-ontdekking: log het werkende pad + één ruw voorbeeld (geen secrets).
      console.log("[msp-locations] resolved", JSON.stringify({
        path, query, rawCount: items.length, mapped: locations.length, capped,
        sampleKeys: Object.keys(items[0] ?? {}), sample: items[0] ?? null,
      }));
      return json({ status: "ok", path, count: locations.length, capped, locations });
    } catch (err) {
      if (err instanceof RoadApiError) {
        console.error("[msp-locations] road_error", JSON.stringify({ status: err.status, message: err.message, details: err.payload.details }));
        return json({ status: "road_error", statusCode: err.status, message: err.message, details: err.payload.details });
      }
      throw err;
    }
  } catch (err) {
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});
