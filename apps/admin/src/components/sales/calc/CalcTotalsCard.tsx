import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumField } from "./NumField";
import type { CalcTotals } from "@/services/calcTypes";
import { formatEuro as euro } from "@/services/calculations";

export function CalcTotalsCard({
  totals,
  offerPrice,
  frozen,
  onOfferPriceCommit,
}: {
  totals: CalcTotals;
  offerPrice: number;
  frozen: boolean;
  onOfferPriceCommit: (n: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Totalen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <Row label="Materiaal (verkoop)" value={euro(totals.materialSell)} />
        <Row label="Materiaal (inkoop netto)" value={euro(totals.materialCost)} muted />
        <Row label="Marge materiaal" value={euro(totals.marginMaterial)} accent />
        <Row label="Arbeid" value={euro(totals.laborSell)} />
        <Row label="Voorrijkosten" value={euro(totals.travelSell)} />
        <div className="my-2 border-t" />
        <Row label="Totaal calculatie" value={euro(totals.totalSell)} strong />
        {totals.stelpost > 0 && <Row label="Stelpost graafwerk (apart in offerte)" value={euro(totals.stelpost)} muted />}
        <div className="grid gap-1.5 pt-2">
          <Label className="text-xs">Offerteprijs (afgerond)</Label>
          <NumField
            className="h-9 text-right text-base font-semibold tabular-nums"
            value={offerPrice}
            disabled={frozen}
            onCommit={onOfferPriceCommit}
          />
          <p className="text-[11px] text-muted-foreground">
            Voorstel: {euro(totals.suggestedOfferPrice)} (naar boven afgerond, zoals op het Excel-voorblad). Leegmaken = terug naar het
            voorstel. Dit bedrag wordt de offerteprijs.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted, strong, accent }: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${muted ? "text-muted-foreground" : ""} ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : ""} ${accent ? "font-medium text-primary" : ""} ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
