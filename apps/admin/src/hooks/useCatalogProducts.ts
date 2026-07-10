import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Productcatalogus voor de interne kostencalculator. Prijsmodel volgt de
// calculatie-Excel: netto inkoop = bruto × (1 − leverancierskorting),
// verkoop = bruto × (1 + toeslag/korting-op-verkoop).
export type CatalogProduct = Database["public"]["Tables"]["catalog_products"]["Row"];
export type CatalogProductInsert = Database["public"]["Tables"]["catalog_products"]["Insert"];
export type CatalogProductUpdate = Database["public"]["Tables"]["catalog_products"]["Update"];

export const CATALOG_CATEGORIES: { value: string; label: string }[] = [
  { value: "laadpalen", label: "Laadpalen e.d." },
  { value: "installatiemateriaal", label: "Installatiemateriaal" },
  { value: "overig", label: "Overig" },
  { value: "arbeid", label: "Arbeid" },
];

export const catalogCategoryLabel = (v: string | null | undefined) =>
  CATALOG_CATEGORIES.find((c) => c.value === v)?.label ?? v ?? "";

/** Netto inkoop (= echte kostprijs) per eenheid. */
export const netCost = (p: Pick<CatalogProduct, "gross_price" | "supplier_discount_pct">) =>
  Math.round(Number(p.gross_price) * (1 - Number(p.supplier_discount_pct)) * 100) / 100;

/** Verkoopprijs per eenheid. */
export const sellPrice = (p: Pick<CatalogProduct, "gross_price" | "sell_adjustment_pct">) =>
  Math.round(Number(p.gross_price) * (1 + Number(p.sell_adjustment_pct)) * 100) / 100;

export function useCatalogProducts(opts?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: ["catalog-products", { includeInactive: opts?.includeInactive ?? false }],
    queryFn: async () => {
      let q = supabase.from("catalog_products").select("*").order("position").order("name");
      if (!opts?.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CatalogProduct[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["catalog-products"] });
}

export function useCreateCatalogProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insert: Omit<CatalogProductInsert, "organization_id">) => {
      // organization_id: oudste org (deterministisch — zelfde patroon als useContacts)
      const { data: org, error: orgErr } = await supabase.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) throw new Error("Geen organisatie gevonden");
      // Volledige rij terug: het calculatieblad zet een nieuw artikel meteen als
      // regel op het blad, en heeft daarvoor de prijsvelden nodig.
      const { data, error } = await supabase
        .from("catalog_products")
        .insert({ ...insert, organization_id: org.id })
        .select("*")
        .single();
      if (error) throw error;
      return data as CatalogProduct;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateCatalogProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CatalogProductUpdate }) => {
      const { error } = await supabase.from("catalog_products").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
