// Types + pure rekenlogica van de interne kostencalculator.
// Rekenmodel volgt de calculatie-Excel: regels (qty × verkoop/kost/uren),
// uurloon × totaaluren, voorrijkosten (retour-km × €/km × dagen), stelpost.

export type CalcLineType = "product" | "vrij" | "uren";

export interface CalcLineDraft {
  /** Client-side regel-id (zie components/sales/calc/uid.ts). Wordt nooit
      opgeslagen: patch/verwijder/uitklap hangen eraan, de DB niet. */
  uid: string;
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
  /** Inkooptarief arbeid (e-group) per uur — raakt alleen de marge, nooit totalSell. */
  labor_cost_rate: number;
  km_price: number;
  retour_km: number;
  travel_days: number;
  stelpost_graafwerk: number;
  stelpost_note: string;
}

export interface CalcSummary {
  /** Vrije "Levering en installatie"-offertetekst, door de invuller zelf geschreven. */
  leveringText?: string;
  /** Laatst naar de offerte toegepaste tekst — guard zodat handmatige
      bewerkingen op de offerte-detailpagina niet overschreven worden. */
  _lastApplied?: string;
}

export interface CalcTotals {
  materialSell: number;
  materialCost: number;
  marginMaterial: number;
  hoursTotal: number;
  laborSell: number;
  /** Inkoop van de uren bij e-group (hoursTotal × labor_cost_rate) — alleen marge. */
  laborCost: number;
  travelSell: number;
  /** Stelpost graafwerk staat APART in de offerte (eigen PDF-veld) en telt
      dus niet mee in de commerciële prijs — zoals op het Excel-voorblad. */
  stelpost: number;
  totalSell: number;
  /** Voorstel voor de afgeronde commerciële prijs (hele euro's, naar boven). */
  suggestedCommercialPrice: number;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Stappen waarop de commerciële prijs met één klik afgerond kan worden. */
export const AFROND_STAPPEN = [25, 50, 100] as const;

/**
 * Naar boven afronden op een veelvoud. Altijd omhoog — een commerciële prijs
 * onder de calculatie zou marge weggeven, en dat is ook waarom
 * `suggestedCommercialPrice` een `ceil` is.
 */
export function roundUpTo(amount: number, step: number): number {
  if (step <= 0 || amount <= 0) return Math.max(0, r2(amount));
  return Math.ceil(r2(amount) / step) * step;
}

/**
 * Hoe de commerciële prijs tot stand komt. Een afrondstap is een REGEL en
 * beweegt dus mee als de calculatie verandert; een handmatig bedrag is een
 * bewuste keuze en blijft staan. Geen van beide = het voorstel volgen.
 */
export interface CommercialPriceChoice {
  roundStep: number | null;
  manual: number | null;
}

export const GEEN_COMMERCIELE_PRIJS_KEUZE: CommercialPriceChoice = { roundStep: null, manual: null };

export function commercialPriceFor(totals: CalcTotals, choice: CommercialPriceChoice): number {
  if (choice.roundStep) return roundUpTo(totals.totalSell, choice.roundStep);
  return choice.manual ?? totals.suggestedCommercialPrice;
}

export interface CommercialMargin {
  amount: number;
  /** Fractie (0,318), niet 31,8 — en bewust NIET afgerond: de opmaak doet dat. */
  pct: number | null;
}

/**
 * Wat er van een offerte overblijft: commerciële prijs minus de netto
 * materiaalinkoop en de arbeidsinkoop bij e-group (uren × inkooptarief), als
 * percentage van de commerciële prijs (zoals `serviceFeePct` in de
 * pricing-engine).
 *
 * De marge op arbeid (verkoop- minus inkooptarief) en de voorrijkosten zitten
 * dus in dit bedrag; het is een brutomarge, geen nettowinst.
 */
export function commercialMargin(commercialPrice: number, materialCost: number, laborCost: number): CommercialMargin {
  const amount = r2(commercialPrice - materialCost - laborCost);
  return { amount, pct: commercialPrice > 0 ? amount / commercialPrice : null };
}

/**
 * Bij het openen van een opgeslagen calculatie kennen we alleen het bedrag,
 * niet hoe het gekozen is. Valt het precies op een afrondstap, dan herstellen
 * we die stap — anders blijft de prijs waar hij stond aan de vorige kant.
 */
export function restoreCommercialPriceChoice(totals: CalcTotals, price: number | null): CommercialPriceChoice {
  if (price == null || price === totals.suggestedCommercialPrice) return GEEN_COMMERCIELE_PRIJS_KEUZE;
  const step = AFROND_STAPPEN.find((s) => roundUpTo(totals.totalSell, s) === price);
  return step ? { roundStep: step, manual: null } : { roundStep: null, manual: price };
}

/** Secties van het calculatieblad, in leesvolgorde. */
export type CalcSection = "laadpalen" | "installatiemateriaal" | "arbeid";

export const CALC_SECTIONS: { value: CalcSection; label: string }[] = [
  { value: "laadpalen", label: "Laadpalen" },
  { value: "installatiemateriaal", label: "Installatiemateriaal" },
  { value: "arbeid", label: "Arbeid & voorrijkosten" },
];

/**
 * In welke sectie hoort een regel? Totaal: elke regel valt in precies één
 * sectie, zodat niets onzichtbaar kan worden terwijl het wél meetelt.
 *
 * De arbeid-sectie routeert op line_type, NIET op category: alleen urenregels
 * hebben geen kost/verkoop (computeTotals negeert die), en alleen daar mogen de
 * bijbehorende kolommen dus leegblijven.
 */
export function sectionOfLine(line: Pick<CalcLineDraft, "line_type" | "category">): CalcSection {
  if (line.line_type === "uren") return "arbeid";
  if (line.category === "laadpalen") return "laadpalen";
  return "installatiemateriaal"; // installatiemateriaal, 'overig', null
}

const SECTION_RANK: Record<CalcSection, number> = { laadpalen: 0, installatiemateriaal: 1, arbeid: 2 };

/**
 * Regels gegroepeerd per sectie, in bladvolgorde — stabiel, dus de onderlinge
 * volgorde binnen een sectie blijft. Bepaalt bij opslaan `position`, en daarmee
 * ook de volgorde van de offerteregels en het calculatie-Excel.
 */
export function sortLinesBySection(lines: CalcLineDraft[]): CalcLineDraft[] {
  return [...lines].sort((a, b) => SECTION_RANK[sectionOfLine(a)] - SECTION_RANK[sectionOfLine(b)]);
}

/** Verkoop-subtotaal van één sectie. Urenregels tellen nooit mee in materiaal. */
export function sectionSellSubtotal(lines: CalcLineDraft[], section: CalcSection): number {
  let sum = 0;
  for (const line of lines) {
    if (line.line_type === "uren" || sectionOfLine(line) !== section) continue;
    sum = r2(sum + lineTotals(line).sell);
  }
  return sum;
}

/**
 * Uren komen uit twee bronnen: losse urenregels én de calculatietijd die op
 * materiaalregels zit (bv. 8 uur op een meterkast). Samen vormen ze
 * `computeTotals().hoursTotal`, dat het montagebedrag voedt — het blad toont
 * de splitsing zodat dat bedrag navolgbaar is.
 */
export function hoursSplit(lines: CalcLineDraft[]): { fromUrenLines: number; fromProductLines: number } {
  let fromUrenLines = 0;
  let fromProductLines = 0;
  for (const line of lines) {
    const hours = lineTotals(line).hours;
    if (line.line_type === "uren") fromUrenLines = r2(fromUrenLines + hours);
    else fromProductLines = r2(fromProductLines + hours);
  }
  return { fromUrenLines, fromProductLines };
}

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
  const laborCost = r2(hoursTotal * header.labor_cost_rate);
  const travelSell = r2(header.retour_km * header.km_price * header.travel_days);
  const stelpost = r2(header.stelpost_graafwerk || 0);
  const totalSell = r2(materialSell + laborSell + travelSell);
  return {
    materialSell,
    materialCost,
    marginMaterial: r2(materialSell - materialCost),
    hoursTotal,
    laborSell,
    laborCost,
    travelSell,
    stelpost,
    totalSell,
    suggestedCommercialPrice: Math.ceil(totalSell),
  };
}
