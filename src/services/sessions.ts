import { supabase } from "@/integrations/supabase/client";

export async function getSessions(clientId?: string, limit = 1000) {
  let query = supabase
    .from("charging_sessions")
    .select("*, clients(company_name), charge_points(name), locations(name)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function getSessionsByChargePoint(chargePointId: string, limit = 10) {
  return supabase
    .from("charging_sessions")
    .select("*")
    .eq("charge_point_id", chargePointId)
    .order("started_at", { ascending: false })
    .limit(limit);
}
