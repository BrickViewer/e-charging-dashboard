import { supabase } from "@/integrations/supabase/client";

export async function getChargePoints() {
  return supabase
    .from("charge_points")
    .select("*, locations(name, address, client_id, clients(company_name))");
}

export async function getChargePointsByLocation(locationId: string) {
  return supabase.from("charge_points").select("*").eq("location_id", locationId);
}

export async function createChargePoints(data: Record<string, any>[]) {
  return supabase.from("charge_points").insert(data);
}

export async function updateChargePoint(id: string, data: Record<string, any>) {
  return supabase.from("charge_points").update(data).eq("id", id).select().single();
}
