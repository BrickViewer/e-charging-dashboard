import { supabase } from "@/integrations/supabase/client";

export async function getActivityLog(clientId?: string, limit = 50) {
  let query = supabase
    .from("activity_log")
    .select("*, clients(company_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function logActivity(data: {
  client_id?: string;
  organization_id?: string;
  user_id?: string;
  action: string;
  description: string;
}) {
  return supabase.from("activity_log").insert(data);
}
