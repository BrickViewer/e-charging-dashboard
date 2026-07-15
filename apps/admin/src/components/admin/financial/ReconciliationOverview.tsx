import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Banknote, ArrowRight, Wallet, Landmark, Percent, AlertCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronRight, ExternalLink, CheckCircle2, Clock, Unlink,
} from "lucide-react";
import { CashKpi } from "./CashKpi";
import { ReconStatusIndicator } from "./ReconStatusIndicator";
import { useMonthlyFinancialOverview, useAllSettlements } from "@/hooks/useAdminData";
import { formatEuro } from "@/services/calculations";
import { buildMonthlyFinancials, sumFinancials, type MonthFinancials } from "@/services/financialModel";
import type { AdminSettlement } from "@/types/db";
import { getCurrentMonth, monthFullLabel } from "@/lib/period";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { Link } from "react-router-dom";

// Tab 1 — CFO-cockpit. Per maand de sluitende geldstroom:
//   Ontvangen van eFlux  →  Toegewezen (uit te keren + fee) + Nog niet toegewezen  →  marge,
// plus de uitbetaalstatus (is alles uitbetaald?). Klik een maand voor de volledige waterfall.
export function ReconciliationOverview({ onOpenMonth }: { onOpenMonth: (ym: string) => void }) {
  const ov = useMonthlyFinancialOverview();
  const st = useAllSettlements();
  const isLoading = ov.isLoading || st.isLoading;
  const isError = ov.isError || st.isError;

  const allMonths = useMemo(
    () => buildMonthlyFinancials(ov.data, (st.data ?? []) as AdminSettlement[]),
    [ov.data, st.data],
  );

  const years = useMemo(() => {
    const set = new Set<number>(allMonths.map((m) => m.year));
    set.add(getCurrentMonth().year);
    return Array.from(set).sort((a, b) => a - b); // oplopend; laatste = meest recent
  }, [allMonths]);

  const [yearIdx, setYearIdx] = useState<number | null>(null);
  const idx = yearIdx ?? Math.max(0, years.length - 1);
  const year = years[idx] ?? getCurrentMonth().year;
  const months = useMemo(() => allMonths.filter((m) => m.year === year), [allMonths, year]);
  const tot = useMemo(() => sumFinancials(months), [months]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  // Laadfout — bied een retry i.p.v. stilzwijgend een leeg overzicht met €0-totalen.
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
        <Button variant="outline" size="sm" onClick={() => { void ov.refetch(); void st.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  const verwachtSuffix = tot.ontvangenVerwacht > 0.005 ? ` · ${formatEuro(tot.ontvangenVerwacht)} verwacht` : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Maandoverzicht & reconciliatie</h2>
          <p className="text-sm text-muted-foreground">
            Wat eFlux ons betaalt, verdeeld over{" "}
            <span className="font-medium text-foreground">klanten + onze fee</span> en{" "}
            <span className="font-medium text-foreground">nog niet toegewezen</span> — met de uitbetaalstatus.
          </p>
        </div>
        <PeriodStepper label={`Heel ${year}`} index={idx} count={years.length} onIndexChange={setYearIdx} />
      </div>

      {/* Jaar-KPI's — consistente BTW-basis (aangegeven in het bijschrift van elke tegel) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <CashKpi label="Ontvangen van eFlux" value={formatEuro(tot.ontvangenActueel)} subtitle={`vergoeding incl. BTW${verwachtSuffix}`} icon={<Banknote className="h-4 w-4" />} accent="primary" />
        <CashKpi label="Nog niet toegewezen" value={formatEuro(tot.unassignedExcl)} subtitle="koppel klant · excl. BTW" icon={<Unlink className="h-4 w-4" />} accent={tot.unassignedExcl > 0.005 ? "amber" : "muted"} />
        <CashKpi label="Uit te keren aan klanten" value={formatEuro(tot.payoutTotal)} subtitle="bruto, excl. BTW" icon={<ArrowRight className="h-4 w-4" />} accent="muted" />
        <CashKpi label="Onze fee" value={formatEuro(tot.feeTotal)} subtitle="service-fee, excl. BTW" icon={<Percent className="h-4 w-4" />} accent="primary" />
        <CashKpi label="eFlux-kosten" value={formatEuro(tot.usageIncl)} subtitle="platform incl. BTW" icon={<Wallet className="h-4 w-4" />} accent="amber" />
        <CashKpi label="Onze marge" value={formatEuro(tot.margeExcl)} subtitle="fee − kosten, excl. BTW" icon={<Landmark className="h-4 w-4" />} accent="muted" changePositive={tot.margeExcl >= 0} />
      </div>

      {/* Actiepunt — ongekoppelde eFlux-vergoeding; maak het koppelen vindbaar */}
      {tot.unassignedExcl > 0.005 && (
        <Link
          to="/admin/locaties"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--status-amber)/0.3)] bg-[hsl(var(--status-amber)/0.08)] px-4 py-3 transition-colors hover:bg-[hsl(var(--status-amber)/0.14)]"
        >
          <div className="flex items-center gap-2 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[hsl(var(--status-amber))]" />
            <span>
              <span className="font-medium">{formatEuro(tot.unassignedExcl)}</span> eFlux-vergoeding is nog niet
              toegewezen aan een klant — koppel de bijbehorende locaties aan een klant.
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--status-amber))]">
            Naar locaties <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {/* Uitbetaalstatus — beantwoordt "hebben we alles uitbetaald?" */}
      <PayoutStatusBar tot={tot} />

      {/* Per-maand tabel — klik een rij voor de volledige waterfall */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-left font-medium">Maand</th>
                  <th className="p-3 text-right font-medium">Ontvangen eFlux</th>
                  <th className="p-3 text-left font-medium">Reconciliatie</th>
                  <th className="p-3 text-right font-medium">Nog niet toegewezen</th>
                  <th className="p-3 text-right font-medium">Uitbetaald</th>
                  <th className="p-3 text-right font-medium">Openstaand</th>
                  <th className="p-3 text-right font-medium">Onze marge</th>
                  <th className="p-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
                  const isOpen = expanded === ym;
                  return (
                    <MonthRow
                      key={ym}
                      m={m}
                      ym={ym}
                      isOpen={isOpen}
                      onToggle={() => setExpanded(isOpen ? null : ym)}
                      onOpenMonth={onOpenMonth}
                    />
                  );
                })}
                {months.length === 0 && (
                  <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">Geen data voor {year}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sluitende toelichting + BTW-basis-legenda */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Sluit per maand:</span> ontvangen van eFlux (excl. BTW) ={" "}
          toegewezen aan klanten (uit te keren + onze fee) + nog niet toegewezen. "Nog niet toegewezen" is de
          vergoeding van sessies zonder gekoppelde klant — koppel de locatie aan een klant zodat die omzet wordt
          uitgekeerd en fee oplevert. "Onze marge" = onze fee − eFlux-platformkosten (ongekoppeld telt niet mee).
        </p>
        <p>
          De reconciliatie vergelijkt de eFlux-creditfactuur met onze sessie-omzet × 1,21 (op de cent). Een ⚠️
          is meestal maandgrens-timing dat in de buurmaand saldeert. Bedragen zijn incl. BTW waar het om
          eFlux/uitbetalingen gaat en excl. BTW bij omzet/fee/marge. Reconciliatie is op bedrijfsniveau; per
          klant controleer je in de tab Afrekeningen.
        </p>
      </div>
    </div>
  );
}

// Compacte uitbetaalstatus-balk: uitbetaald vs openstaand (goedgekeurd, nog niet betaald)
// vs nog niet goedgekeurd. Het directe antwoord op "is alles uitbetaald?".
function PayoutStatusBar({ tot }: { tot: ReturnType<typeof sumFinancials> }) {
  const paid = tot.uitbetaaldIncl;
  const open = tot.openstaandIncl;
  const pending = tot.nogNietGoedgekeurdIncl;
  const total = paid + open + pending;
  const pct = (v: number) => (total > 0 ? `${(v / total) * 100}%` : "0%");

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <p className="cockpit-section-label">Uitbetaalstatus aan klanten</p>
          <p className="text-xs text-muted-foreground">netto over te boeken · incl. BTW</p>
        </div>

        {total > 0 ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-primary" style={{ width: pct(paid) }} title={`Uitbetaald ${formatEuro(paid)}`} />
              <div className="bg-[hsl(var(--status-amber))]" style={{ width: pct(open) }} title={`Openstaand ${formatEuro(open)}`} />
              <div className="bg-muted-foreground/30" style={{ width: pct(pending) }} title={`Nog niet goedgekeurd ${formatEuro(pending)}`} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatusFigure color="text-primary" dot="bg-primary" label="Uitbetaald" value={paid} hint={paid > 0 ? "geld is de deur uit" : "nog niets uitbetaald"} />
              <StatusFigure color="text-[hsl(var(--status-amber))]" dot="bg-[hsl(var(--status-amber))]" label="Openstaand" value={open} hint="goedgekeurd, nog te betalen/factureren" />
              <StatusFigure color="text-muted-foreground" dot="bg-muted-foreground/30" label="Nog niet goedgekeurd" value={pending} hint="live/berekend — nog niet in de betaalflow" />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Geen afrekeningen aan klanten in dit jaar (alle sessie-omzet is nog niet toegewezen).</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusFigure({ color, dot, label, value, hint }: { color: string; dot: string; label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums leading-none ${color}`}>{formatEuro(value)}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground/70">{hint}</p>
    </div>
  );
}

function MonthRow({
  m, ym, isOpen, onToggle, onOpenMonth,
}: {
  m: MonthFinancials; ym: string; isOpen: boolean; onToggle: () => void; onOpenMonth: (ym: string) => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
        onClick={onToggle}
        title="Klik voor de volledige waterfall van deze maand"
      >
        <td className="p-3 font-medium capitalize">
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            {monthFullLabel(m.year, m.month)}
          </span>
        </td>
        <td className="p-3 text-right tabular-nums">
          {formatEuro(m.ontvangenActueel)}
          {m.factuurOntbreekt && (
            <span className="block text-[11px] font-normal text-muted-foreground">{formatEuro(m.ontvangenVerwacht)} verwacht</span>
          )}
        </td>
        <td className="p-3"><ReconStatusIndicator status={m.reconStatus} diff={m.reconDiffIncl} /></td>
        <td className="p-3 text-right tabular-nums">
          {m.unassignedExcl > 0.005 ? (
            <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--status-amber))]">
              <AlertTriangle className="h-3.5 w-3.5" /> {formatEuro(m.unassignedExcl)}
            </span>
          ) : (
            <span className="text-muted-foreground">{formatEuro(0)}</span>
          )}
        </td>
        <td className="p-3 text-right tabular-nums">
          {m.uitbetaaldIncl > 0.005 ? <span className="text-primary">{formatEuro(m.uitbetaaldIncl)}</span> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="p-3 text-right tabular-nums">
          {m.openstaandIncl > 0.005 ? <span className="text-[hsl(var(--status-amber))]">{formatEuro(m.openstaandIncl)}</span> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={`p-3 text-right tabular-nums ${m.margeExcl < 0 ? "text-[hsl(var(--status-red))]" : ""}`}>{formatEuro(m.margeExcl)}</td>
        <td className="p-3 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onOpenMonth(ym); }}
            title="Open de afrekeningen van deze maand"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={8} className="p-0">
            <MonthWaterfall m={m} ym={ym} onOpenMonth={onOpenMonth} />
          </td>
        </tr>
      )}
    </>
  );
}

// De volledige, sluitende waterfall van één maand.
function MonthWaterfall({ m, ym, onOpenMonth }: { m: MonthFinancials; ym: string; onOpenMonth: (ym: string) => void }) {
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-2">
      {/* Links: geldstroom in → bestemming → marge */}
      <div className="space-y-1.5 text-sm">
        <WLine label="Ontvangen van eFlux" sub="cpo-credit, incl. BTW" value={formatEuro(m.creditIncl)} strong />
        {m.factuurOntbreekt && (
          <WLine label="Verwacht (factuur nog niet binnen)" sub="sessie-omzet × 1,21" value={formatEuro(m.ontvangenVerwacht)} muted />
        )}
        <div className="my-1 border-t border-dashed border-border" />
        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bestemming (excl. BTW)</p>
        <WLine label="Toegewezen aan klanten" value={formatEuro(m.assignedExcl)} indent />
        <WLine label="↳ Uit te keren aan klanten" value={formatEuro(m.payoutTotal)} indent2 muted />
        <WLine label="↳ Onze fee" value={formatEuro(m.feeTotal)} indent2 muted />
        <WLine
          label="Nog niet toegewezen"
          sub="sessies zonder gekoppelde klant"
          value={formatEuro(m.unassignedExcl)}
          indent
          amber={m.unassignedExcl > 0.005}
        />
        <div className="my-1 border-t border-dashed border-border" />
        <WLine label="Sessie-omzet (excl. BTW)" sub="= toegewezen + nog niet toegewezen" value={formatEuro(m.sessionsReimbExcl)} />
        <div className="my-1 border-t border-dashed border-border" />
        <WLine label="− eFlux-platformkosten" sub="cpo-usage, excl. BTW" value={formatEuro(m.usageExcl)} muted />
        <WLine label="Onze marge" sub="fee − platformkosten" value={formatEuro(m.margeExcl)} strong red={m.margeExcl < 0} />
      </div>

      {/* Rechts: uitbetaalstatus van deze maand */}
      <div className="space-y-1.5 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uitbetaalstatus (incl. BTW)</p>
        <WLine label="Uitbetaald" sub="betaald / factuur voldaan" value={formatEuro(m.uitbetaaldIncl)} primary={m.uitbetaaldIncl > 0.005} />
        <WLine label="Te betalen via bank" sub="goedgekeurd, positief" value={formatEuro(m.teBetalenBankIncl)} amber={m.teBetalenBankIncl > 0.005} />
        <WLine label="Factuur te sturen" sub="goedgekeurd, incasso" value={formatEuro(m.factuurTeSturenIncl)} amber={m.factuurTeSturenIncl > 0.005} />
        <WLine label="Factuur open" sub="verstuurd, nog niet voldaan" value={formatEuro(m.factuurOpenIncl)} amber={m.factuurOpenIncl > 0.005} />
        <WLine label="Nog niet goedgekeurd" sub="live / berekend" value={formatEuro(m.nogNietGoedgekeurdIncl)} muted />
        <div className="pt-2 text-xs text-muted-foreground">
          {m.settlementsFinal}/{m.settlementsTotal} afrekening(en) goedgekeurd of verder in deze maand.
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => onOpenMonth(ym)}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Open afrekeningen van {monthFullLabel(m.year, m.month)}
        </Button>
      </div>
    </div>
  );
}

function WLine({
  label, sub, value, strong, muted, indent, indent2, amber, red, primary,
}: {
  label: string; sub?: string; value: string;
  strong?: boolean; muted?: boolean; indent?: boolean; indent2?: boolean; amber?: boolean; red?: boolean; primary?: boolean;
}) {
  const valueColor = red
    ? "text-[hsl(var(--status-red))]"
    : amber
    ? "text-[hsl(var(--status-amber))]"
    : primary
    ? "text-primary"
    : muted
    ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className={`flex items-baseline justify-between gap-4 ${indent2 ? "pl-6" : indent ? "pl-3" : ""}`}>
      <div className="min-w-0">
        <span className={strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
        {sub && <span className="ml-2 text-[11px] text-muted-foreground/70">{sub}</span>}
      </div>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${valueColor}`}>{value}</span>
    </div>
  );
}
