import { supabase } from "@/integrations/supabase/client";

export async function getClients() {
  return supabase
    .from("clients")
    .select("*, locations(*, charge_points(*))")
    .order("created_at", { ascending: false });
}

export async function getClientById(id: string) {
  return supabase
    .from("clients")
    .select("*, locations(*, charge_points(*))")
    .eq("id", id)
    .maybeSingle();
}

export async function updateClient(clientId: string, data: Record<string, any>) {
  return supabase
    .from("clients")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .select()
    .single();
}

export async function createClient(data: Record<string, any>) {
  return supabase
    .from("clients")
    .insert(data)
    .select()
    .single();
}
