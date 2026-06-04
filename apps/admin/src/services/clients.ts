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

export type ClientPrivacyErasureResult = {
  status: "ok" | "partial";
  message?: string;
  client_id?: string;
  client_number?: number | null;
  erased_client_label?: string;
  auth_user_deleted?: boolean;
  auth_delete_error?: string | null;
  counts?: Record<string, number>;
};

export async function deleteClientProfile(
  clientId: string,
  confirmationName: string,
) {
  const { data, error } = await supabase.functions.invoke<ClientPrivacyErasureResult>(
    "erase-client",
    {
      body: {
        client_id: clientId,
        confirmation_name: confirmationName,
      },
    },
  );

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as
        | { message?: string; error?: string }
        | null;
      throw new Error(payload?.message || payload?.error || error.message);
    }
    throw error;
  }
  return data;
}
