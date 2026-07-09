// Types + pure rekenlogica van de interne kostencalculator.
// Rekenmodel volgt de calculatie-Excel: regels (qty × verkoop/kost/uren),
// uurloon × totaaluren, voorrijkosten (retour-km × €/km × dagen), stelpost.

export type CalcLineType = "product" | "vrij" | "uren";

export interface CalcLineDraft {
  id?: string;
  line_type: CalcLineType;
  product_id: string | null;
  description: string;
  category: string | null;
  supplier: string | null;
  order_number: string | null;
  unit: string;
  qty: number;
  unit_gross: number;
  unit_cost: number;
  unit_sell: number;
  unit_hours: number;
  position: number;
}

export interface CalcHeaderDraft {
  hourly_rate: number;
  km_price: number;
  retour_km: number;
  travel_days: number;
  stelpost_graafwerk: number;
  stelpost_note: string;
}

export interface CalcSummary {
  chargerModel?: string;
  numPoles?: number;
  numSockets?: number;
  loadBalancerModel?: string;
  eindgroepen?: number;
  eindgroepAmperage?: number;
  _lastGeneratedLevering?: string;
}

export interface CalcTotals {
  materialSell: number;
  materialCost: number;
  marginMaterial: number;
  hoursTotal: number;
  laborSell: number;
  travelSell: number;
  /** Stelpost graafwerk staat APART in de offerte (eigen PDF-veld) en telt
      dus niet mee in de offerteprijs — zoals op het Excel-voorblad. */
  stelpost: number;
  totalSell: number;
  /** Voorstel voor de afgeronde offerteprijs (hele euro's, naar boven). */
  suggestedOfferPrice: number;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotals(line: Pick<CalcLineDraft, "qty" | "unit_cost" | "unit_sell" | "unit_hours">) {
  return {
    cost: r2(line.qty * line.unit_cost),
    sell: r2(line.qty * line.unit_sell),
    hours: r2(line.qty * line.unit_hours),
  };
}

/**
 * Totale calculatie. Urenregels tellen alleen mee in uren (het bedrag komt uit
 * uurloon × totaaluren) — zo kan een urenregel nooit dubbel meetellen.
 */
export function computeTotals(lines: CalcLineDraft[], header: CalcHeaderDraft): CalcTotals {
  let materialSell = 0;
  let materialCost = 0;
  let hoursTotal = 0;
  for (const line of lines) {
    const t = lineTotals(line);
    hoursTotal = r2(hoursTotal + t.hours);
    if (line.line_type !== "uren") {
      materialSell = r2(materialSell + t.sell);
      materialCost = r2(materialCost + t.cost);
    }
  }
  const laborSell = r2(hoursTotal * header.hourly_rate);
  const travelSell = r2(header.retour_km * header.km_price * header.travel_days);
  const stelpost = r2(header.stelpost_graafwerk || 0);
  const totalSell = r2(materialSell + laborSell + travelSell);
  return {
    materialSell,
    materialCost,
    marginMaterial: r2(materialSell - materialCost),
    hoursTotal,
    laborSell,
    travelSell,
    stelpost,
    totalSell,
    suggestedOfferPrice: Math.ceil(totalSell),
  };
}
