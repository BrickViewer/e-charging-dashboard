import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type InstallationOrder = Database["public"]["Tables"]["installation_orders"]["Row"];
export type OrderWithClient = InstallationOrder & {
  clients: { company_name: string; client_number: number | null; kvk: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;
  quotes: { quote_number: string | null; line_items: unknown; total_hardware_cost: number | null; total_installation_cost: number | null } | null;
  leads: { estimated_charge_points: number | null; charger_type: string | null; address_street: string | null; postal_code: string | null; city: string | null; contact_phone: string | null } | null;
};

export const ORDER_STATUSES = ["nieuw", "overgedragen", "ingepland", "geinstalleerd", "afgerond", "geannuleerd"] as const;

// Resultaat van de order-handoff edge function. status 'not_configured' en
// 'validation_error' zijn info-paden (geen harde fout): de UI handelt ze apart af.
export type HandoffResult = {
  status: "ok" | "not_configured" | "validation_error" | "error";
  egroup_order_id?: string;
  egroup_order_number?: string;
  already_sent?: boolean;
  missing?: string[];
  message?: string;
};

export function useInstallationOrders() {
  return useQuery({
    queryKey: ["installation-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installation_orders")
        .select(
          "*, clients(company_name, client_number, kvk, contact_name, contact_email, contact_phone), quotes(quote_number, line_items, total_hardware_cost, total_installation_cost), leads(estimated_charge_points, charger_type, address_street, postal_code, city, contact_phone)",
        )
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

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installation_orders").delete().eq("id", id);
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
    // Geeft het volledige HandoffResult terug; de UI beslist per status wat te
    // tonen (ok / not_configured / validation_error). Alleen een echte 'error'
    // of een transport-fout gooit.
    mutationFn: async (orderId: string): Promise<HandoffResult> => {
      const { data, error } = await supabase.functions.invoke<HandoffResult>(
        "order-handoff",
        { body: { order_id: orderId } },
      );
      if (error) throw error;
      if (data?.status === "error") throw new Error(data.message || "Overdracht mislukt");
      return data ?? { status: "error", message: "Lege respons" };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
      qc.invalidateQueries({ queryKey: ["client-orders"] });
    },
  });
}

// Bewerkt het site-adres/contact-snapshot van een installatie-order (zodat de
// gebruiker het adres kan aanvullen voor de handoff naar E-Group).
export type SitePatch = Pick<
  Database["public"]["Tables"]["installation_orders"]["Update"],
  | "site_street"
  | "site_house_number"
  | "site_postal"
  | "site_city"
  | "site_contact_name"
  | "site_contact_email"
  | "site_contact_phone"
  | "service_summary"
>;

export function useUpdateOrderSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SitePatch }) => {
      const { error } = await supabase.from("installation_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
      qc.invalidateQueries({ queryKey: ["client-orders"] });
    },
  });
}
