import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MspEvse {
  evseId: string | null;
  status: string | null;
  connectorType: string | null;
  maxPower: number | null;
}

export interface MspLocation {
  id: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  available: number | null;
  total: number | null;
  operator: string | null;
  evses: MspEvse[];
}

export interface Bbox { north: number; south: number; east: number; west: number; }

interface MspResponse {
  status: string;
  locations?: MspLocation[];
  count?: number;
  capped?: boolean;
  message?: string;
  statusCode?: number;
}

// Rond de bbox af (~0,01° ≈ 1 km) zodat kleine kaartbewegingen niet telkens opnieuw fetchen.
function roundBbox(b: Bbox): Bbox {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { north: r(b.north), south: r(b.south), east: r(b.east), west: r(b.west) };
}

export function useMspLocations(bbox: Bbox | null) {
  const key = bbox ? roundBbox(bbox) : null;
  return useQuery({
    queryKey: ["msp-locations", key],
    enabled: !!key,
    placeholderData: keepPreviousData, // markers blijven staan tijdens pannen/zoomen
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<MspResponse>("eflux-msp-locations", { body: { bbox: key } });
      if (error) throw error;
      if (data?.status === "not_configured") throw new Error(data.message || "eFlux-koppeling niet geconfigureerd");
      if (data?.status === "road_error") throw new Error(`Road ${data.statusCode ?? ""}: ${data.message ?? "fout"}`);
      if (data?.status !== "ok") throw new Error(data?.message || "Locaties ophalen mislukt");
      return data;
    },
  });
}

export interface MspTariff { perKwh: number | null; perHour: number | null; currency: string; }

export function useMspLocationTariff(locationId: string | null) {
  return useQuery({
    queryKey: ["msp-location-tariff", locationId],
    enabled: !!locationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ status: string; tariff?: MspTariff; message?: string; statusCode?: number }>(
        "eflux-msp-locations",
        { body: { action: "tariff", locationId } },
      );
      if (error) throw error;
      if (data?.status === "road_error") throw new Error(`Road ${data.statusCode ?? ""}: ${data.message ?? "fout"}`);
      if (data?.status !== "ok") throw new Error(data?.message || "Tarief ophalen mislukt");
      return data.tariff ?? null;
    },
  });
}
