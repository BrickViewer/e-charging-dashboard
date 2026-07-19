import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, ExternalLink,
  CheckCircle2, Clock,
} from "lucide-react";
import { ReconStatusIndicator } from "./ReconStatusIndicator";
import { useMonthlyFinancialOverview, useAllSettlements } from "@/hooks/useAdminData";
import { formatEuro } from "@/services/calculations";
import { buildMonthlyFinancials, sumFinancials, type MonthFinancials, type FinancialsTotals } from "@/services/financialModel";
import type { AdminSettlement } from "@/types/db";
import { getCurrentMonth, monthFullLabel } from "@/lib/period";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { Link } from "react-router-dom";

// Tab 1 — CFO-cockpit, compacte variant. Slanke kop-strook (jaar) + de maandtabel als hero:
// per rij vertellen twee mini-balken "is het toegewezen?" en "is het uitbetaald?". Klik een
// maand voor de volledige waterfall; het pijltje opent de afrekeningen van die maand.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Maandoverzicht & reconciliatie</h2>
          <p className="text-sm text-muted-foreground">
            Wat eFlux betaalt, verdeeld over klanten + brutomarge — en wat nog niet is toegewezen of uitbetaald.
          </p>
        </div>
        <PeriodStepper label={`Heel ${year}`} index={idx} count={years.length} onIndexChange={setYearIdx} />
      </div>

      {/* Slanke kop-strook: 3 kerncijfers (jaar) */}
      <HeadlineStrip tot={tot} />

      {/* Eén regel: is alles uitbetaald? (jaar) */}
      <YearPayoutLine tot={tot} />

      {/* De maandtabel is de hero */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-left font-medium">Maand</th>
                  <th className="p-3 text-right font-medium">Ontvangen</th>
                  <th className="p-3 text-left font-medium">Toewijzing</th>
                  <th className="p-3 text-left font-medium">Uitbetaling</th>
                  <th className="p-3 text-left font-medium">Reconciliatie</th>
                  <th className="p-3 text-right font-medium">Marge</th>
                  <th className="p-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
                  return (
                    <MonthRow
                      key={ym}
                      m={m}
                      ym={ym}
                      isOpen={expanded === ym}
                      onToggle={() => setExpanded(expanded === ym ? null : ym)}
                      onOpenMonth={onOpenMonth}
                    />
                  );
                })}
                {months.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">Geen data voor {year}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Sluit:</span> ontvangen van eFlux (excl. BTW) = toegewezen
        aan klanten (uit te keren + brutomarge) + nog niet toegewezen. Reconciliatie vergelijkt de eFlux-creditfactuur
        met onze sessie-omzet × 1,21. Bedragen incl. BTW bij eFlux/uitbetalingen, excl. BTW bij omzet/marge.
      </p>
    </div>
  );
}

// --- Kop-strook -------------------------------------------------------------

function HeadlineStrip({ tot }: { tot: FinancialsTotals }) {
  const verwacht = tot.ontvangenVerwacht > 0.005 ? `+${formatEuro(tot.ontvangenVerwacht)} verwacht` : "incl. BTW";
  return (
    <Card className="portal-card">
      <CardContent className="grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StripStat label="Ontvangen van eFlux" value={formatEuro(tot.ontvangenActueel)} sub={verwacht} />
        <StripStat
          label="Nog niet toegewezen"
          value={formatEuro(tot.unassignedExcl)}
          amber={tot.unassignedExcl > 0.005}
          action={tot.unassignedExcl > 0.005
            ? <Link to="/beheer/locaties" className="inline-flex items-center gap-0.5 font-medium text-[hsl(var(--status-amber))] hover:underline">koppel locaties <ChevronRight className="h-3.5 w-3.5" /></Link>
            : undefined}
        />
        <StripStat
          label="Onze marge"
          value={formatEuro(tot.margeExcl)}
          red={tot.margeExcl < 0}
          sub="brutomarge − eFlux-kosten"
        />
      </CardContent>
    </Card>
  );
}

function StripStat({
  label, value, sub, action, amber, red,
}: {
  label: string; value: string; sub?: string; action?: React.ReactNode; amber?: boolean; red?: boolean;
}) {
  const valueColor = red ? "text-[hsl(var(--status-red))]" : amber ? "text-[hsl(var(--status-amber))]" : "text-foreground";
  return (
    <div className="p-5">
      <p className="cockpit-section-label flex items-center gap-1.5">
        {amber && <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-amber))]" />}
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums leading-none ${valueColor}`}>{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{action ?? sub}</p>
    </div>
  );
}

// --- Uitbetaal-regel (jaar) -------------------------------------------------

function YearPayoutLine({ tot }: { tot: FinancialsTotals }) {
  const paid = tot.uitbetaaldIncl;
  const open = tot.openstaandIncl;
  const pending = tot.nogNietGoedgekeurdIncl;
  const total = paid + open + pending;

  if (total < 0.005) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Uitbetaald aan klanten:</span> nog geen afrekeningen aan klanten in {""}
        dit jaar.
      </p>
    );
  }

  // Zonder betaal-/open-activiteit geen lege balk (die was juist de eyesore): alleen de tekst.
  const showBar = paid + open > 0.005;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-sm">
      <span className="font-medium text-foreground">Uitbetaald aan klanten:</span>
      {showBar && (
        <div className="flex h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div className="bg-primary" style={{ width: `${(paid / total) * 100}%` }} title={`Uitbetaald ${formatEuro(paid)}`} />
          <div className="bg-[hsl(var(--status-amber))]" style={{ width: `${(open / total) * 100}%` }} title={`Openstaand ${formatEuro(open)}`} />
          <div className="bg-muted-foreground/30" style={{ width: `${(pending / total) * 100}%` }} title={`Nog niet goedgekeurd ${formatEuro(pending)}`} />
        </div>
      )}
      <span className="text-muted-foreground">
        <span className="text-primary">{formatEuro(paid)}</span> uitbetaald ·{" "}
        <span className="text-[hsl(var(--status-amber))]">{formatEuro(open)}</span> open ·{" "}
        {formatEuro(pending)} nog niet goedgekeurd
      </span>
    </div>
  );
}

// --- Micro-balk -------------------------------------------------------------

type Segment = { value: number; className: string; title: string };

function MicroSplitBar({ segments, className = "h-1.5" }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total < 0.005) return <span className="text-muted-foreground">—</span>;
  return (
    <div className={`flex ${className} w-full overflow-hidden rounded-full bg-muted`}>
      {segments.map((s, i) =>
        s.value > 0.005 ? (
          <div key={i} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} title={s.title} />
        ) : null,
      )}
    </div>
  );
}

// --- Maandrij ---------------------------------------------------------------

function MonthRow({
  m, ym, isOpen, onToggle, onOpenMonth,
}: {
  m: MonthFinancials; ym: string; isOpen: boolean; onToggle: () => void; onOpenMonth: (ym: string) => void;
}) {
  const assignSegments: Segment[] = [
    { value: m.assignedExcl, className: "bg-primary", title: `Toegewezen ${formatEuro(m.assignedExcl)}` },
    { value: m.unassignedExcl, className: "bg-[hsl(var(--status-amber))]", title: `Nog niet toegewezen ${formatEuro(m.unassignedExcl)}` },
  ];
  const payoutSegments: Segment[] = [
    { value: m.uitbetaaldIncl, className: "bg-primary", title: `Uitbetaald ${formatEuro(m.uitbetaaldIncl)}` },
    { value: m.openstaandIncl, className: "bg-[hsl(var(--status-amber))]", title: `Openstaand ${formatEuro(m.openstaandIncl)}` },
    { value: m.nogNietGoedgekeurdIncl, className: "bg-muted-foreground/30", title: `Nog niet goedgekeurd ${formatEuro(m.nogNietGoedgekeurdIncl)}` },
  ];
  const payoutTotal = m.uitbetaaldIncl + m.openstaandIncl + m.nogNietGoedgekeurdIncl;

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
        {/* Toewijzing: is de vergoeding aan klanten toegewezen? */}
        <td className="p-3">
          <div className="flex min-w-[9rem] items-center gap-2">
            <MicroSplitBar segments={assignSegments} />
            {m.unassignedExcl > 0.005 ? (
              <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-xs font-medium text-[hsl(var(--status-amber))]">
                <AlertTriangle className="h-3 w-3" /> {formatEuro(m.unassignedExcl)}
              </span>
            ) : m.assignedExcl > 0.005 ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
            ) : (
              <span className="flex-shrink-0 text-xs text-muted-foreground">—</span>
            )}
          </div>
        </td>
        {/* Uitbetaling: is het aan klanten uitbetaald? */}
        <td className="p-3">
          <div className="flex min-w-[7rem] items-center gap-2">
            <MicroSplitBar segments={payoutSegments} />
            <PayoutGlyph paid={m.uitbetaaldIncl} open={m.openstaandIncl} pending={m.nogNietGoedgekeurdIncl} total={payoutTotal} />
          </div>
        </td>
        <td className="p-3"><ReconStatusIndicator status={m.reconStatus} diff={m.reconDiffIncl} /></td>
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
          <td colSpan={7} className="p-0">
            <MonthRowDetail m={m} ym={ym} onOpenMonth={onOpenMonth} />
          </td>
        </tr>
      )}
    </>
  );
}

function PayoutGlyph({ paid, open, pending, total }: { paid: number; open: number; pending: number; total: number }) {
  if (total < 0.005) return <span className="flex-shrink-0 text-xs text-muted-foreground">—</span>;
  if (open < 0.005 && pending < 0.005 && paid > 0.005)
    return <span className="flex-shrink-0" title="Volledig uitbetaald"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /></span>;
  return <span className="flex-shrink-0" title="Nog niet volledig uitbetaald"><Clock className="h-3.5 w-3.5 text-muted-foreground" /></span>;
}

// --- Lean uitklap -----------------------------------------------------------

function MonthRowDetail({ m, ym, onOpenMonth }: { m: MonthFinancials; ym: string; onOpenMonth: (ym: string) => void }) {
  const payoutSegments: Segment[] = [
    { value: m.uitbetaaldIncl, className: "bg-primary", title: `Uitbetaald ${formatEuro(m.uitbetaaldIncl)}` },
    { value: m.openstaandIncl, className: "bg-[hsl(var(--status-amber))]", title: `Openstaand ${formatEuro(m.openstaandIncl)} — te betalen ${formatEuro(m.teBetalenBankIncl)}, te factureren ${formatEuro(m.factuurTeSturenIncl)}, factuur open ${formatEuro(m.factuurOpenIncl)}` },
    { value: m.nogNietGoedgekeurdIncl, className: "bg-muted-foreground/30", title: `Nog niet goedgekeurd ${formatEuro(m.nogNietGoedgekeurdIncl)}` },
  ];
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-2">
      {/* Geldstroom */}
      <div className="space-y-1.5 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Geldstroom</p>
        <Row label="Ontvangen van eFlux" sub="incl. BTW" value={formatEuro(m.creditIncl)} strong />
        {m.factuurOntbreekt && <Row label="Verwacht (factuur nog niet binnen)" value={formatEuro(m.ontvangenVerwacht)} muted />}
        <Row label="→ Toegewezen aan klanten" sub="excl. BTW" value={formatEuro(m.assignedExcl)} indent />
        <p className="pl-6 text-[11px] text-muted-foreground/80">
          uit te keren {formatEuro(m.payoutTotal)} · brutomarge {formatEuro(m.feeTotal)}
        </p>
        <Row label="→ Nog niet toegewezen" value={formatEuro(m.unassignedExcl)} indent amber={m.unassignedExcl > 0.005} />
        <div className="my-1 border-t border-dashed border-border" />
        <Row label="Onze marge" sub="fee − eFlux-kosten" value={formatEuro(m.margeExcl)} strong red={m.margeExcl < 0} />
      </div>

      {/* Uitbetaling */}
      <div className="space-y-2 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uitbetaling · incl. BTW</p>
        <MicroSplitBar segments={payoutSegments} className="h-2.5" />
        <p className="text-muted-foreground">
          <span className="text-primary">{formatEuro(m.uitbetaaldIncl)}</span> uitbetaald ·{" "}
          <span className="text-[hsl(var(--status-amber))]">{formatEuro(m.openstaandIncl)}</span> open ·{" "}
          {formatEuro(m.nogNietGoedgekeurdIncl)} nog niet goedgekeurd
        </p>
        <p className="text-xs text-muted-foreground">
          {m.settlementsFinal}/{m.settlementsTotal} afrekening(en) goedgekeurd of verder in deze maand.
        </p>
        <Button variant="outline" size="sm" onClick={() => onOpenMonth(ym)}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Open afrekeningen van {monthFullLabel(m.year, m.month)}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label, sub, value, strong, muted, indent, amber, red,
}: {
  label: string; sub?: string; value: string; strong?: boolean; muted?: boolean; indent?: boolean; amber?: boolean; red?: boolean;
}) {
  const valueColor = red ? "text-[hsl(var(--status-red))]" : amber ? "text-[hsl(var(--status-amber))]" : muted ? "text-muted-foreground" : "text-foreground";
  return (
    <div className={`flex items-baseline justify-between gap-4 ${indent ? "pl-3" : ""}`}>
      <div className="min-w-0">
        <span className={strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
        {sub && <span className="ml-2 text-[11px] text-muted-foreground/70">{sub}</span>}
      </div>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${valueColor}`}>{value}</span>
    </div>
  );
}
