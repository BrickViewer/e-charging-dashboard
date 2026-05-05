import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

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

// Koppelt een (uit Road gesyncte) locatie aan een klant in e-charging.
// De cascading-trigger zet automatisch client_id op alle nog-NULL sessions
// van die locatie (cutoff-semantiek).
export async function linkLocationToClient(locationId: string, clientId: string) {
  const { data, error } = await supabase
    .from("locations")
    .update({ client_id: clientId })
    .eq("id", locationId)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("activity_log").insert({
    client_id: clientId,
    action: "location_linked",
    description: `Locatie gekoppeld aan klant`,
    metadata: { location_id: locationId },
  });

  return data;
}

// Ontkoppelt een locatie van een klant. Bestaande sessies blijven
// gestempeld op de oude klant (geen retroactieve ontkoppeling).
export async function unlinkLocation(locationId: string, previousClientId?: string) {
  const { data, error } = await supabase
    .from("locations")
    .update({ client_id: null, client_assigned_at: null })
    .eq("id", locationId)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("activity_log").insert({
    client_id: previousClientId ?? null,
    action: "location_unlinked",
    description: `Locatie ontkoppeld`,
    metadata: { location_id: locationId },
  });

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
