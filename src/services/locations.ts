import { supabase } from "@/integrations/supabase/client";

export async function getLocations(clientId?: string) {
  let query = supabase.from("locations").select("*, charge_points(*)");
  if (clientId) query = query.eq("client_id", clientId);
  return query.order("created_at", { ascending: false });
}

export async function createLocation(data: Record<string, any>) {
  return supabase.from("locations").insert(data).select().single();
}

export async function updateLocation(id: string, data: Record<string, any>) {
  return supabase.from("locations").update(data).eq("id", id).select().single();
}
