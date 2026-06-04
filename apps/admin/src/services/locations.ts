import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export async function getLocations(clientId?: string) {
  let query = supabase.from("locations").select("*, charge_points(*)");
  if (clientId) query = query.eq("client_id", clientId);
  return query.order("created_at", { ascending: false });
}

export async function createLocation(data: TablesInsert<"locations">) {
  return supabase.from("locations").insert(data).select().single();
}

export async function updateLocation(id: string, data: TablesUpdate<"locations">) {
  return supabase.from("locations").update(data).eq("id", id).select().single();
}

export type LocationClientChangeResult = {
  location: Tables<"locations">;
  previous_client_id: string | null;
  client_id: string | null;
  reassigned_sessions: number;
  retained_final_sessions: number;
  deleted_open_settlements: number;
};

type LocationClientRpc = {
  rpc(
    name: "set_location_client",
    args: { location_id: string; client_id: string | null },
  ): Promise<{ data: LocationClientChangeResult | null; error: Error | null }>;
};

// Koppelt een (uit Road gesyncte) locatie aan een klant in E-Charging.
// In pilotfase volgen alle niet-definitief afgerekende sessies deze koppeling.
export async function linkLocationToClient(locationId: string, clientId: string) {
  const rpcClient = supabase as unknown as LocationClientRpc;
  const { data, error } = await rpcClient.rpc("set_location_client", {
    location_id: locationId,
    client_id: clientId,
  });

  if (error) throw error;
  return data;
}

// Ontkoppelt een locatie van een klant. Niet-definitief afgerekende sessies
// worden losgekoppeld en gaan later mee naar een nieuwe klantkoppeling.
export async function unlinkLocation(locationId: string, _previousClientId?: string) {
  const rpcClient = supabase as unknown as LocationClientRpc;
  const { data, error } = await rpcClient.rpc("set_location_client", {
    location_id: locationId,
    client_id: null,
  });

  if (error) throw error;
  return data;
}

// Trigger een handmatige sync van Road → Supabase via de eflux-sync edge function.
// Returns het sync-resultaat zodat de UI feedback kan tonen.
export async function triggerEfluxSync() {
  const { data, error } = await supabase.functions.invoke("eflux-sync", {
    body: {},
  });
  if (error) throw error;
  return data;
}
