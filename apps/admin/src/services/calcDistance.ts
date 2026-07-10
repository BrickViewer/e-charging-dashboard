// Automatische kilometerberekening voor de calculator: rijafstand van het
// kantoor (organisatie-adres, Zaltbommel) naar de projectlocatie.
// Sleutelloze diensten: PDOK Locatieserver (NL-geocoding) + OSRM (route).
// Best-effort — bij falen blijft handmatig invullen gewoon werken.

import { supabase } from "@/integrations/supabase/client";

const FALLBACK_OFFICE = "Dwarsweg 8, 5301KT Zaltbommel";

interface LatLon { lat: number; lon: number }

async function geocodeNl(address: string): Promise<LatLon | null> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(address)}&rows=1&fl=centroide_ll`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const centroide: string | undefined = json?.response?.docs?.[0]?.centroide_ll; // "POINT(5.24 51.81)"
  const m = centroide?.match(/POINT\(([\d.-]+) ([\d.-]+)\)/);
  if (!m) return null;
  return { lon: Number(m[1]), lat: Number(m[2]) };
}

async function drivingKm(from: LatLon, to: LatLon): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const meters: number | undefined = json?.routes?.[0]?.distance;
  return typeof meters === "number" ? meters / 1000 : null;
}

// Kantooradres + coördinaten één keer per sessie resolven.
let officePromise: Promise<{ address: string; coords: LatLon } | null> | null = null;
async function resolveOffice(): Promise<{ address: string; coords: LatLon } | null> {
  officePromise ??= (async () => {
    const { data } = await supabase.from("organizations").select("address, address_street, address_postal, address_city").order("created_at").limit(1).maybeSingle();
    const address =
      (data?.address as string | null)?.trim() ||
      [data?.address_street, data?.address_postal, data?.address_city].filter(Boolean).join(" ").trim() ||
      FALLBACK_OFFICE;
    const coords = (await geocodeNl(address)) ?? (await geocodeNl(FALLBACK_OFFICE));
    return coords ? { address, coords } : null;
  })();
  return officePromise;
}

export interface DistanceResult {
  retourKm: number;
  officeAddress: string;
  targetAddress: string;
}

/** Retour-kilometers (heen + terug, hele km) van kantoor naar het opgegeven adres. */
export async function calcRetourKm(targetAddress: string): Promise<DistanceResult | null> {
  const target = targetAddress.trim();
  if (!target) return null;
  try {
    const office = await resolveOffice();
    if (!office) return null;
    const coords = await geocodeNl(target);
    if (!coords) return null;
    const km = await drivingKm(office.coords, coords);
    if (km == null) return null;
    return { retourKm: Math.round(km * 2), officeAddress: office.address, targetAddress: target };
  } catch {
    return null;
  }
}

/** Projectadres van een offerte: offer_details → project_location → lead. */
export async function resolveQuoteAddress(quote: {
  offer_details: unknown;
  project_location_id: string | null;
  lead_id: string | null;
}): Promise<string | null> {
  const od = (quote.offer_details ?? {}) as Record<string, unknown>;
  const fromOd = [od.addressStreet, od.addressPostalCode, od.addressCity]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (fromOd) return fromOd;

  if (quote.project_location_id) {
    const { data } = await supabase
      .from("project_locations")
      .select("address_street, house_number, postal_code, city")
      .eq("id", quote.project_location_id)
      .maybeSingle();
    const addr = [data?.address_street, data?.house_number, data?.postal_code, data?.city]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (addr) return addr;
  }

  if (quote.lead_id) {
    const { data } = await supabase
      .from("leads")
      .select("address_street, postal_code, city")
      .eq("id", quote.lead_id)
      .maybeSingle();
    const addr = [data?.address_street, data?.postal_code, data?.city]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (addr) return addr;
  }
  return null;
}
