import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Banknote, ArrowRight, Wallet, Landmark, Percent, AlertCircle, RefreshCw } from "lucide-react";
import { CashKpi } from "./CashKpi";
import { ReconStatusIndicator } from "./ReconStatusIndicator";
import { useMonthlyFinancialOverview } from "@/hooks/useAdminData";
import { formatEuro } from "@/services/calculations";
import { getCurrentMonth, monthFullLabel } from "@/lib/period";
import { PeriodStepper } from "@/components/portal/PeriodStepper";

// Tab 1 — CFO-maandoverzicht: per maand de tie-out van wat we van eFlux ontvingen tegen wat we aan
// klanten uitkeren + onze fee. Klik een maand om de afrekeningen van die maand te openen.
export function ReconciliationOverview({ onOpenMonth }: { onOpenMonth: (ym: string) => void }) {
  const { data, isLoading, isError, refetch } = useMonthlyFinancialOverview();

  const years = useMemo(() => {
    const set = new Set<number>((data ?? []).map((r) => r.year));
    set.add(getCurrentMonth().year);
    return Array.from(set).sort((a, b) => a - b); // oplopend; laatste = meest recent
  }, [data]);

  const [yearIdx, setYearIdx] = useState<number | null>(null);
  const idx = yearIdx ?? Math.max(0, years.length - 1);
  const year = years[idx] ?? getCurrentMonth().year;
  const rows = useMemo(() => (data ?? []).filter((r) => r.year === year), [data, year]);

  const tot = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          credit: a.credit + Number(r.eflux_credit_incl || 0),
          payout: a.payout + Number(r.payout_total || 0),
          fee: a.fee + Number(r.fee_total || 0),
          usage: a.usage + Number(r.eflux_usage_incl || 0),
          net: a.net + Number(r.eflux_net_incl || 0),
          activation: a.activation + Number(r.activation_total || 0),
        }),
        { credit: 0, payout: 0, fee: 0, usage: 0, net: 0, activation: 0 },
      ),
    [rows],
  );

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  // Laadfout — het maandoverzicht kon niet geladen worden; bied een retry i.p.v.
  // stilzwijgend een leeg maandoverzicht met €0-totalen te tonen.
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
      >
        <div className="flex items-center gap-2 text-sm text-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
          <span>Het maandoverzicht kon niet worden geladen. Controleer je verbinding en probeer opnieuw.</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Maandoverzicht & reconciliatie</h2>
          <p className="text-sm text-muted-foreground">
            Sluit per maand: <span className="font-medium text-foreground">ontvangen van eFlux</span> = uit te
            keren aan klanten + onze fee.
          </p>
        </div>
        <PeriodStepper label={`Heel ${year}`} index={idx} count={years.length} onIndexChange={setYearIdx} />
      </div>

      {/* Jaar-totalen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CashKpi label="Ontvangen van eFlux" value={formatEuro(tot.credit)} subtitle="vergoeding incl. BTW" icon={<Banknote className="h-4 w-4" />} accent="primary" />
        <CashKpi label="Uit te keren aan klanten" value={formatEuro(tot.payout)} subtitle="netto, excl. BTW" icon={<ArrowRight className="h-4 w-4" />} accent="muted" />
        <CashKpi label="Onze fee" value={formatEuro(tot.fee)} subtitle="service-fee" icon={<Percent className="h-4 w-4" />} accent="primary" />
        <CashKpi label="eFlux-kosten" value={formatEuro(tot.usage)} subtitle="platform incl. BTW" icon={<Wallet className="h-4 w-4" />} accent="amber" />
        <CashKpi label="Netto eFlux-stroom" value={formatEuro(tot.net)} subtitle="vergoeding − kosten" icon={<Landmark className="h-4 w-4" />} accent="muted" />
      </div>

      {/* Per-maand reconciliatietabel */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-left font-medium">Maand</th>
                  <th className="p-3 text-right font-medium">Ontvangen eFlux</th>
                  <th className="p-3 text-right font-medium">Onze sessie-omzet</th>
                  <th className="p-3 text-left font-medium">Verschil</th>
                  <th className="p-3 text-right font-medium">Uit te keren</th>
                  <th className="p-3 text-right font-medium">Onze fee</th>
                  <th className="p-3 text-right font-medium">eFlux-kosten</th>
                  <th className="p-3 text-right font-medium">Netto</th>
                  <th className="p-3 text-right font-medium">Afrekeningen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ym = `${r.year}-${String(r.month).padStart(2, "0")}`;
                  return (
                    <tr
                      key={ym}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                      onClick={() => onOpenMonth(ym)}
                      title="Open de afrekeningen van deze maand"
                    >
                      <td className="p-3 font-medium capitalize">{monthFullLabel(r.year, r.month)}</td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(Number(r.eflux_credit_incl || 0))}</td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(Number(r.sessions_reimb_incl || 0))}</td>
                      <td className="p-3"><ReconStatusIndicator status={r.recon_status} diff={Number(r.recon_diff_incl || 0)} /></td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(Number(r.payout_total || 0))}</td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(Number(r.fee_total || 0))}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{formatEuro(Number(r.eflux_usage_incl || 0))}</td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(Number(r.eflux_net_incl || 0))}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{r.settlements_final}/{r.settlements_total}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="p-12 text-center text-muted-foreground">Geen data voor {year}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Informatief — géén onderdeel van de tie-out. "Uit te keren" blijft bruto (dat is wat de
          reconciliatie sluit); dit toont los welk deel als activatiekosten verrekend wordt en wat er
          netto naar de klanten gaat. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Activatie verrekend (excl. BTW):{" "}
          <span className="tabular-nums text-foreground">{formatEuro(tot.activation)}</span>
        </span>
        <span>
          Netto aan klanten:{" "}
          <span className="tabular-nums text-foreground">{formatEuro(tot.payout - tot.activation)}</span>
        </span>
        <span className="italic text-muted-foreground/70">informatief · geen onderdeel van de tie-out</span>
      </div>

      <p className="text-xs text-muted-foreground">
        "Onze sessie-omzet" = som van de eFlux-vergoeding per sessie (excl. BTW) × 1,21. Een ⚠️-verschil is
        meestal maandgrens-timing dat in de buurmaand saldeert. "Uit te keren + onze fee" is per constructie
        gelijk aan onze sessie-omzet (excl. BTW). Reconciliatie is op bedrijfsniveau; per klant controleer je
        in de tab Afrekeningen.
      </p>
    </div>
  );
}
