// Voorvul-mechaniek: een afgeronde calculatie schrijft de offerte grotendeels
// vol — prijs, klantgerichte regels en de gegenereerde "Levering en
// installatie"-tekst. Uren en kostprijzen blijven intern (aggregatie).

import { supabase } from "@/integrations/supabase/client";
import type { QuoteLineItem } from "@/hooks/useQuotes";
import type { OfferDetails } from "./offerTypes";
import { r2, type CalcHeaderDraft, type CalcLineDraft, type CalcSummary, type CalcTotals } from "./calcTypes";
import { generateLeveringText } from "./calcLeveringText";

/** Klantgerichte offerteregels: materiaal op verkoopprijs + één geaggregeerde
    montage-regel (of kortingsregel bij een lager afgerond bedrag), zodat de
    som altijd exact de afgeronde offerteprijs is. Nooit uren/kostprijzen. */
export function calcToLineItems(lines: CalcLineDraft[], totals: CalcTotals, offerPrice: number): QuoteLineItem[] {
  const items: QuoteLineItem[] = lines
    .filter((l) => l.line_type !== "uren")
    .map((l) => ({
      description: l.description.trim() || "Materiaal",
      qty: l.qty,
      unit_price: l.unit_sell,
      total: r2(l.qty * l.unit_sell),
    }));
  const rest = r2(offerPrice - totals.materialSell);
  if (rest > 0.004) {
    items.push({ description: "Installatie & montage", qty: 1, unit_price: rest, total: rest });
  } else if (rest < -0.004) {
    items.push({ description: "Korting", qty: 1, unit_price: rest, total: rest });
  }
  return items;
}

export interface ApplyCalcInput {
  quoteId: string;
  lines: CalcLineDraft[];
  header: CalcHeaderDraft;
  summary: CalcSummary;
  totals: CalcTotals;
  offerPrice: number;
}

export interface ApplyCalcResult {
  /** Summary inclusief bijgewerkte _lastGeneratedLevering — door de caller mee
      te persisteren in dezelfde calc-save (géén tweede write nodig). */
  nextSummary: CalcSummary;
  leveringOverwritten: boolean;
}

/**
 * Patcht de offerte met de calculatie-uitkomst, op basis van de VERSE
 * offer_details uit de database (niet de mogelijk verouderde query-cache).
 * De leveringstekst wordt alleen automatisch vervangen als de huidige tekst
 * leeg is of gelijk aan de laatst gegenereerde (het lastDefaultRef-patroon);
 * de gestructureerde scope-velden volgen de calculatie onvoorwaardelijk —
 * de calculatie is de bron, dus leegmaken in de calc wist ze ook op de offerte.
 */
export async function applyCalcToQuote(input: ApplyCalcInput): Promise<ApplyCalcResult> {
  const { quoteId, lines, header, summary, totals, offerPrice } = input;

  const { data: fresh, error: freshErr } = await supabase
    .from("quotes")
    .select("id, offer_details")
    .eq("id", quoteId)
    .single();
  if (freshErr) throw freshErr;

  const generated = generateLeveringText(summary);
  const od = ((fresh.offer_details ?? {}) as OfferDetails) || {};
  const current = (od.leveringText ?? "").trim();
  const lastGenerated = (summary._lastGeneratedLevering ?? "").trim();
  const leveringOverwritten = !!generated && (current === "" || current === lastGenerated);

  const nextOd: OfferDetails = {
    ...od,
    ...(leveringOverwritten ? { leveringText: generated } : {}),
    chargerModel: summary.chargerModel?.trim() || null,
    numPoles: summary.numPoles ?? null,
    loadBalancerModel: summary.loadBalancerModel?.trim() || null,
    eindgroepen: summary.eindgroepen ?? null,
    eindgroepAmperage: summary.eindgroepAmperage ?? null,
    stelpostGraafwerk: header.stelpost_graafwerk > 0 ? header.stelpost_graafwerk : null,
  };

  const patch: Record<string, unknown> = {
    total_installation_cost: offerPrice,
    total_hardware_cost: 0,
    line_items: calcToLineItems(lines, totals, offerPrice) as unknown,
    offer_details: nextOd as unknown,
  };
  if (summary.numSockets && summary.numSockets > 0) patch.num_charge_points = summary.numSockets;

  const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
  if (error) throw error;

  const nextSummary: CalcSummary =
    generated && leveringOverwritten ? { ...summary, _lastGeneratedLevering: generated } : summary;
  return { nextSummary, leveringOverwritten };
}
