import { supabase } from "@/integrations/supabase/client";

export async function getActivityLog(clientId?: string, limit = 50) {
  let query = supabase
    .from("activity_log")
    .select("*, clients(client_number, company_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function logActivity(data: {
  client_id?: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const rpcClient = supabase as unknown as {
    rpc(name: "create_activity_log", args: {
      client_id: string | null;
      action: string;
      description: string;
      metadata: Record<string, unknown>;
    }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("create_activity_log", {
    client_id: data.client_id ?? null,
    action: data.action,
    description: data.description,
    metadata: data.metadata ?? {},
  });
}
