import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MaterialStatus } from "@/services/installationHandoff";

// Werkvoorbereiding: de materialen-checklist per installatie-order. De regels
// zijn geseed uit de (bevroren) calculatie via de RPC start_work_preparation;
// handmatige regels hebben geen source_line_id. De bestellink komt live uit de
// catalogus (product_id-join) — vrije regels hebben er geen.

export type OrderMaterial = {
  id: string;
  installation_order_id: string;
  source_line_id: string | null;
  product_id: string | null;
  description: string;
  supplier: string | null;
  order_number: string | null;
  unit: string;
  qty: number;
  status: MaterialStatus;
  position: number;
  catalog_products: { order_url: string | null; extra_links: unknown } | null;
};

const MATERIAL_SELECT =
  "id, installation_order_id, source_line_id, product_id, description, supplier, order_number, unit, qty, status, position, " +
  "catalog_products(order_url, extra_links)";

export function useOrderMaterials(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order-materials", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installation_order_materials")
        .select(MATERIAL_SELECT)
        .eq("installation_order_id", orderId!)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as OrderMaterial[];
    },
  });
}

/**
 * Best-effort sync van de geaggregeerde materiaalstatus naar de e-portal-planner.
 * Mag nooit een mutatie laten falen; de edge stuurt het AGGREGAAT (niet de
 * delta), dus elke volgende mutatie of handmatige retry herstelt een gemiste
 * update volledig (laatste-wint, idempotent).
 */
export function queueMaterialSync(orderId: string) {
  void supabase.functions
    .invoke("order-material-sync", { body: { order_id: orderId } })
    .catch(() => {});
}

// De kaart-teller op het bord en de sync-badge leunen op deze keys.
function invalidateMaterialViews(qc: QueryClient, orderId: string) {
  qc.invalidateQueries({ queryKey: ["order-materials", orderId] });
  qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
  qc.invalidateQueries({ queryKey: ["onboarding-orders"] });
  qc.invalidateQueries({ queryKey: ["installation-orders"] });
  qc.invalidateQueries({ queryKey: ["client-orders"] });
}

/** Seedt de checklist uit de calculatie en zet work_prep_started_at (idempotent). */
export function useStartWorkPreparation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc("start_work_preparation", { p_order_id: orderId });
      if (error) throw error;
      return data as number; // aantal geseede regels
    },
    onSuccess: (_count, orderId) => invalidateMaterialViews(qc, orderId),
  });
}

export function useUpdateMaterialStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; orderId: string; status: MaterialStatus; handedOff: boolean }) => {
      const { error } = await supabase
        .from("installation_order_materials")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      invalidateMaterialViews(qc, input.orderId);
      if (input.handedOff) queueMaterialSync(input.orderId);
    },
  });
}

/** Handmatige regel (niet uit de calculatie); organization_id vult de DB-trigger. */
export function useAddMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: string;
      description: string;
      qty: number;
      unit?: string;
      supplier?: string | null;
      orderNumber?: string | null;
      position: number;
      handedOff: boolean;
    }) => {
      // organization_id vult de BEFORE INSERT-trigger uit de parent-order; het
      // generated Insert-type eist hem, vandaar de cast.
      const { error } = await supabase.from("installation_order_materials").insert({
        installation_order_id: input.orderId,
        description: input.description,
        qty: input.qty,
        unit: input.unit || "stuk",
        supplier: input.supplier || null,
        order_number: input.orderNumber || null,
        position: input.position,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      invalidateMaterialViews(qc, input.orderId);
      if (input.handedOff) queueMaterialSync(input.orderId);
    },
  });
}

export function useRemoveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; orderId: string; handedOff: boolean }) => {
      const { error } = await supabase.from("installation_order_materials").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      invalidateMaterialViews(qc, input.orderId);
      if (input.handedOff) queueMaterialSync(input.orderId);
    },
  });
}

/** Verwachte leverdatum + notitie voor de e-portal-planner (orderniveau). */
export function useUpdateOrderPrepInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: string;
      patch: { materials_expected_at?: string | null; preparation_notes?: string | null };
      handedOff: boolean;
    }) => {
      const { error } = await supabase.from("installation_orders").update(input.patch).eq("id", input.orderId);
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      invalidateMaterialViews(qc, input.orderId);
      if (input.handedOff) queueMaterialSync(input.orderId);
    },
  });
}
