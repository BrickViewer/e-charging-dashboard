import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// Een in e-Flux verwijderd/gearchiveerd laadpunt (operational_status='archived') is geen actief
// laadpunt meer en moet nergens in de UI of in tellingen meedoen. eflux-sync zet dit signaal
// bij zowel een in Road gearchiveerde EVSE als een uit Road verdwenen controller.
export function isActiveChargePoint(cp: { operational_status?: string | null }): boolean {
  return cp.operational_status !== "archived";
}

export async function getChargePoints() {
  return supabase
    .from("charge_points")
    .select("*, locations(name, address, client_id, clients(client_number, company_name))");
}

export async function getChargePointsByLocation(locationId: string) {
  return supabase.from("charge_points").select("*").eq("location_id", locationId);
}

export async function createChargePoints(data: TablesInsert<"charge_points">[]) {
  return supabase.from("charge_points").insert(data);
}

export async function updateChargePoint(id: string, data: TablesUpdate<"charge_points">) {
  return supabase.from("charge_points").update(data).eq("id", id).select().single();
}
