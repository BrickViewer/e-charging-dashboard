import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type InstallationOrder = Database["public"]["Tables"]["installation_orders"]["Row"];
export type OrderWithClient = InstallationOrder & { clients: { company_name: string; client_number: number | null } | null };

export const ORDER_STATUSES = ["nieuw", "overgedragen", "ingepland", "geinstalleerd", "afgerond", "geannuleerd"] as const;

export function useInstallationOrders() {
  return useQuery({
    queryKey: ["installation-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installation_orders")
        .select("*, clients(company_name, client_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderWithClient[];
    },
  });
}

export function useClientOrders(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-orders", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installation_orders")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InstallationOrder[];
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["installation_orders"]["Update"] }) => {
      const { error } = await supabase.from("installation_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
      qc.invalidateQueries({ queryKey: ["client-orders"] });
    },
  });
}

export function useHandoffOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; external_ref?: string; message?: string }>(
        "order-handoff",
        { body: { order_id: orderId } },
      );
      if (error) throw error;
      if (data?.status && data.status !== "ok") throw new Error(data.message || "Overdracht mislukt");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
      qc.invalidateQueries({ queryKey: ["client-orders"] });
    },
  });
}
