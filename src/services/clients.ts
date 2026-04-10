import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

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

export async function updateClient(clientId: string, data: TablesUpdate<"clients">) {
  return supabase
    .from("clients")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .select()
    .single();
}

export async function createClient(data: TablesInsert<"clients">) {
  return supabase.from("clients").insert(data).select().single();
}
