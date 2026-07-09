import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TotalsRow } from "./TotalsRow";
import { offerMargin, type CalcTotals } from "@/services/calcTypes";
import { formatEuro as euro, formatPercent } from "@/services/calculations";

/**
 * Wat we aan een offerte overhouden: offerteprijs − netto materiaalinkoop.
 * `offerPrice` is de effectieve prijs (handmatig, afgerond of het voorstel), dus
 * de marge beweegt mee als je een andere afrondstap kiest. De stelpost blijft
 * erbuiten — die staat apart op de offerte en zit niet in de offerteprijs.
 */
export function CalcMarginCard({ totals, offerPrice }: { totals: CalcTotals; offerPrice: number }) {
  const { amount, pct } = offerMargin(offerPrice, totals.materialCost);
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
        <TotalsRow label="Offerteprijs" value={euro(offerPrice)} />
        <TotalsRow label="− Materiaal inkoop" value={euro(totals.materialCost)} muted />
        <div className="my-2 border-t" />
        <TotalsRow label="Marge" value={euro(amount)} strong valueClassName={kleur} />
        <TotalsRow label="Marge %" value={pct === null ? "—" : formatPercent(pct)} valueClassName={kleur} />
      </CardContent>
    </Card>
  );
}
