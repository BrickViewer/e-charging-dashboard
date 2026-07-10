import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CalcHeaderDraft, CalcLineDraft, CalcSummary, CalcTotals } from "@/services/calcTypes";

export type QuoteCalculation = Database["public"]["Tables"]["quote_calculations"]["Row"];
export type QuoteCalculationLine = Database["public"]["Tables"]["quote_calculation_lines"]["Row"];

export function useQuoteCalculation(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-calculation", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data: calc, error } = await supabase
        .from("quote_calculations")
        .select("*")
        .eq("quote_id", quoteId!)
        .maybeSingle();
      if (error) throw error;
      if (!calc) return { calc: null, lines: [] as QuoteCalculationLine[] };
      const { data: lines, error: lErr } = await supabase
        .from("quote_calculation_lines")
        .select("*")
        .eq("calculation_id", calc.id)
        .order("position");
      if (lErr) throw lErr;
      return { calc: calc as QuoteCalculation, lines: (lines ?? []) as QuoteCalculationLine[] };
    },
  });
}

export interface SaveCalculationInput {
  quoteId: string;
  organizationId: string;
  status: "concept" | "afgerond" | "overgeslagen";
  header: CalcHeaderDraft;
  summary: CalcSummary;
  totals: CalcTotals;
  offerPriceRounded: number | null;
  lines: CalcLineDraft[];
}

/**
 * Slaat kop + regels op (upsert kop op quote_id; regels: verwijderen + opnieuw
 * invoegen — eenvoudig en atomair genoeg voor één bewerker per concept-offerte).
 */
export function useSaveQuoteCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCalculationInput) => {
      const { data: calc, error } = await supabase
        .from("quote_calculations")
        .upsert(
          {
            quote_id: input.quoteId,
            organization_id: input.organizationId,
            status: input.status,
            hourly_rate: input.header.hourly_rate,
            km_price: input.header.km_price,
            retour_km: input.header.retour_km,
            travel_days: input.header.travel_days,
            stelpost_graafwerk: input.header.stelpost_graafwerk,
            stelpost_note: input.header.stelpost_note || null,
            summary: input.summary as never,
            material_sell: input.totals.materialSell,
            material_cost: input.totals.materialCost,
            hours_total: input.totals.hoursTotal,
            labor_sell: input.totals.laborSell,
            travel_sell: input.totals.travelSell,
            total_sell: input.totals.totalSell,
            offer_price_rounded: input.offerPriceRounded,
            finalized_at: input.status === "afgerond" ? new Date().toISOString() : null,
          },
          { onConflict: "quote_id" },
        )
        .select("id")
        .single();
      if (error) throw error;

      // Regel-vervanging: eerst nieuwe regels invoegen, daarna pas de oude
      // verwijderen. Faalt de delete, dan staan er tijdelijk dubbele regels
      // (zichtbaar en herstelbaar) — andersom (delete-first) zou een gefaalde
      // insert de hele calculatie wissen.
      const { data: oldLines, error: oldErr } = await supabase
        .from("quote_calculation_lines")
        .select("id")
        .eq("calculation_id", calc.id);
      if (oldErr) throw oldErr;
      if (input.lines.length > 0) {
        const { error: insErr } = await supabase.from("quote_calculation_lines").insert(
          input.lines.map((l, i) => ({
            calculation_id: calc.id,
            organization_id: input.organizationId,
            line_type: l.line_type,
            product_id: l.product_id,
            description: l.description,
            category: l.category,
            supplier: l.supplier,
            order_number: l.order_number,
            unit: l.unit,
            qty: l.qty,
            unit_gross: l.unit_gross,
            unit_cost: l.unit_cost,
            unit_sell: l.unit_sell,
            unit_hours: l.unit_hours,
            position: i,
          })),
        );
        if (insErr) throw insErr;
      }
      const oldIds = (oldLines ?? []).map((l) => l.id);
      if (oldIds.length > 0) {
        const { error: delErr } = await supabase.from("quote_calculation_lines").delete().in("id", oldIds);
        if (delErr) throw delErr;
      }
      return calc.id as string;
    },
    onSuccess: (_id, input) => {
      qc.invalidateQueries({ queryKey: ["quote-calculation", input.quoteId] });
      qc.invalidateQueries({ queryKey: ["quote", input.quoteId] });
    },
  });
}
