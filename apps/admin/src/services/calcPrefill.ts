// Voorvul-mechaniek: een afgeronde calculatie schrijft de offerte grotendeels
// vol — prijs, klantgerichte regels en de gegenereerde "Levering en
// installatie"-tekst. Uren en kostprijzen blijven intern (aggregatie).

import { supabase } from "@/integrations/supabase/client";
import type { QuoteLineItem } from "@/hooks/useQuotes";
import type { OfferDetails } from "./offerTypes";
import { r2, type CalcHeaderDraft, type CalcLineDraft, type CalcSummary, type CalcTotals } from "./calcTypes";

/** Klantgerichte offerteregels: materiaal op verkoopprijs + één geaggregeerde
    montage-regel (of kortingsregel bij een lager afgerond bedrag), zodat de
    som altijd exact de afgeronde commerciële prijs is. Nooit uren/kostprijzen. */
export function calcToLineItems(lines: CalcLineDraft[], totals: CalcTotals, commercialPrice: number): QuoteLineItem[] {
  const items: QuoteLineItem[] = lines
    .filter((l) => l.line_type !== "uren")
    .map((l) => ({
      description: l.description.trim() || "Materiaal",
      qty: l.qty,
      unit_price: l.unit_sell,
      total: r2(l.qty * l.unit_sell),
    }));
  const rest = r2(commercialPrice - totals.materialSell);
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
  commercialPrice: number;
}

export interface ApplyCalcResult {
  /** Summary inclusief bijgewerkte _lastApplied — door de caller mee te
      persisteren in dezelfde calc-save (géén tweede write nodig). */
  nextSummary: CalcSummary;
  leveringOverwritten: boolean;
}

/**
 * Patcht de offerte met de calculatie-uitkomst, op basis van de VERSE
 * offer_details uit de database (niet de mogelijk verouderde query-cache).
 * De offertetekst uit de calculator wordt alleen toegepast als de huidige
 * offertetekst leeg is of gelijk aan de laatst toegepaste (het
 * lastDefaultRef-patroon) — handmatige bewerkingen op de detailpagina winnen.
 */
export async function applyCalcToQuote(input: ApplyCalcInput): Promise<ApplyCalcResult> {
  const { quoteId, lines, header, summary, totals, commercialPrice } = input;

  const { data: fresh, error: freshErr } = await supabase
    .from("quotes")
    .select("id, offer_details")
    .eq("id", quoteId)
    .single();
  if (freshErr) throw freshErr;

  const calcText = (summary.leveringText ?? "").trim();
  const od = ((fresh.offer_details ?? {}) as OfferDetails) || {};
  const current = (od.leveringText ?? "").trim();
  const lastApplied = (summary._lastApplied ?? "").trim();
  const leveringOverwritten = !!calcText && (current === "" || current === lastApplied);

  const nextOd: OfferDetails = {
    ...od,
    ...(leveringOverwritten ? { leveringText: calcText } : {}),
    stelpostGraafwerk: header.stelpost_graafwerk > 0 ? header.stelpost_graafwerk : null,
  };

  const patch: Record<string, unknown> = {
    total_installation_cost: commercialPrice,
    total_hardware_cost: 0,
    line_items: calcToLineItems(lines, totals, commercialPrice) as unknown,
    offer_details: nextOd as unknown,
  };

  const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
  if (error) throw error;

  const nextSummary: CalcSummary =
    calcText && leveringOverwritten ? { ...summary, _lastApplied: calcText } : summary;
  return { nextSummary, leveringOverwritten };
}
