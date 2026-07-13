import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TotalsRow } from "./TotalsRow";
import { commercialMargin, type CalcTotals } from "@/services/calcTypes";
import { formatEuro as euro, formatPercent } from "@/services/calculations";

/**
 * Wat we aan een offerte overhouden: commerciële prijs − netto materiaalinkoop
 * − arbeidsinkoop bij e-group (uren × inkooptarief) − voorrijkosten (gaan
 * één-op-één door naar e-group). `commercialPrice` is de effectieve prijs
 * (handmatig, afgerond of het voorstel), dus de marge beweegt mee als je een
 * andere afrondstap kiest. De stelpost blijft erbuiten — die staat apart op de
 * offerte en zit niet in de commerciële prijs.
 */
export function CalcMarginCard({
  totals,
  commercialPrice,
  laborCostRate,
}: {
  totals: CalcTotals;
  commercialPrice: number;
  /** Alleen voor de detailtekst; het bedrag zelf zit al in totals.laborCost. */
  laborCostRate: number;
}) {
  const { amount, pct } = commercialMargin(commercialPrice, totals.materialCost, totals.laborCost, totals.travelSell);
  // Kleur hangt aan het BEDRAG: bij een lege calculatie is pct null maar de
  // marge nul, en die hoort al rood te zijn.
  const ongezond = amount <= 0;
  const kleur = cn("font-medium", ongezond ? "text-destructive" : "text-primary");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Marge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <TotalsRow label="Commerciële prijs" value={euro(commercialPrice)} />
        <TotalsRow label="− Materiaal inkoop" value={euro(totals.materialCost)} muted />
        <TotalsRow
          label={`− Arbeid e-group (${totals.hoursTotal.toLocaleString("nl-NL")} u × ${euro(laborCostRate)})`}
          value={euro(totals.laborCost)}
          muted
        />
        <TotalsRow label="− Voorrijkosten e-group" value={euro(totals.travelSell)} muted />
        <div className="my-2 border-t" />
        <TotalsRow label="Marge" value={euro(amount)} strong valueClassName={kleur} />
        <TotalsRow label="Marge %" value={pct === null ? "—" : formatPercent(pct)} valueClassName={kleur} />
      </CardContent>
    </Card>
  );
}
