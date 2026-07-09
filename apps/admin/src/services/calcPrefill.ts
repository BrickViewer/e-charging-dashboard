// Voorvul-mechaniek: een afgeronde calculatie schrijft de offerte grotendeels
// vol — prijs, klantgerichte regels en de gegenereerde "Levering en
// installatie"-tekst. Uren en kostprijzen blijven intern (aggregatie).

import { supabase } from "@/integrations/supabase/client";
import type { Quote, QuoteLineItem } from "@/hooks/useQuotes";
import type { OfferDetails } from "./offerTypes";
import type { CalcHeaderDraft, CalcLineDraft, CalcSummary, CalcTotals } from "./calcTypes";
import { generateLeveringText } from "./calcLeveringText";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Klantgerichte offerteregels: materiaal op verkoopprijs + één geaggregeerde
    montage-regel (uurloon × uren + voorrijkosten, mét afrondingsdelta zodat de
    som exact de afgeronde offerteprijs is). Nooit uren/kostprijzen. */
export function calcToLineItems(lines: CalcLineDraft[], totals: CalcTotals, offerPrice: number): QuoteLineItem[] {
  const items: QuoteLineItem[] = lines
    .filter((l) => l.line_type !== "uren")
    .map((l) => ({
      description: l.description || "—",
      qty: l.qty,
      unit_price: l.unit_sell,
      total: r2(l.qty * l.unit_sell),
    }));
  const montage = r2(offerPrice - totals.materialSell);
  if (montage > 0) {
    items.push({ description: "Installatie & montage", qty: 1, unit_price: montage, total: montage });
  }
  return items;
}

export interface ApplyCalcInput {
  quote: Quote;
  lines: CalcLineDraft[];
  header: CalcHeaderDraft;
  summary: CalcSummary;
  totals: CalcTotals;
  offerPrice: number;
  setSummary?: (s: CalcSummary) => void;
}

export interface ApplyCalcResult {
  leveringText: string;
  leveringOverwritten: boolean;
}

/**
 * Patcht de offerte met de calculatie-uitkomst. De leveringstekst wordt alleen
 * automatisch vervangen als de huidige tekst leeg is of gelijk aan de laatst
 * gegenereerde (dan is hij niet handmatig bewerkt) — het lastDefaultRef-patroon.
 */
export async function applyCalcToQuote(input: ApplyCalcInput): Promise<ApplyCalcResult> {
  const { quote, lines, header, summary, totals, offerPrice } = input;

  const generated = generateLeveringText(summary);
  const od = ((quote.offer_details ?? {}) as OfferDetails) || {};
  const current = (od.leveringText ?? "").trim();
  const lastGenerated = (summary._lastGeneratedLevering ?? "").trim();
  const leveringOverwritten = !!generated && (current === "" || current === lastGenerated);

  const nextOd: OfferDetails = {
    ...od,
    ...(leveringOverwritten ? { leveringText: generated } : {}),
    chargerModel: summary.chargerModel || od.chargerModel || null,
    numPoles: summary.numPoles ?? od.numPoles ?? null,
    loadBalancerModel: summary.loadBalancerModel || od.loadBalancerModel || null,
    eindgroepen: summary.eindgroepen ?? od.eindgroepen ?? null,
    eindgroepAmperage: summary.eindgroepAmperage ?? od.eindgroepAmperage ?? null,
    stelpostGraafwerk: header.stelpost_graafwerk > 0 ? header.stelpost_graafwerk : (od.stelpostGraafwerk ?? null),
  };

  const patch: Record<string, unknown> = {
    total_installation_cost: offerPrice,
    total_hardware_cost: 0,
    line_items: calcToLineItems(lines, totals, offerPrice) as unknown,
    offer_details: nextOd as unknown,
  };
  if (summary.numSockets && summary.numSockets > 0) patch.num_charge_points = summary.numSockets;

  const { error } = await supabase.from("quotes").update(patch).eq("id", quote.id);
  if (error) throw error;

  // Onthoud de gegenereerde tekst in de calc-summary, zodat een volgende
  // her-afronding weet of de gebruiker de tekst intussen handmatig wijzigde.
  if (generated && leveringOverwritten) {
    const nextSummary: CalcSummary = { ...summary, _lastGeneratedLevering: generated };
    const { error: sumErr } = await supabase
      .from("quote_calculations")
      .update({ summary: nextSummary as never })
      .eq("quote_id", quote.id);
    if (sumErr) throw sumErr;
    input.setSummary?.(nextSummary);
  }

  return { leveringText: generated, leveringOverwritten };
}
