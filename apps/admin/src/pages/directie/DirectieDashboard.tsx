// CEO-cockpit: bedrijfsbrede KPI's + doelenvoortgang. Index van het
// directie-werkblad (label "Admin", /admin). Realisatie komt uit bestaande
// bronnen (admin_settlement_kpis, monthly_financial_overview, leads/clients);
// doelen uit kpi_targets (beheerd op /admin/doelen).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Euro, TrendingUp, Zap, Users, PlugZap, Target, Crosshair } from "lucide-react";
import { KpiTile } from "@/components/admin/KpiTile";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { useLeadStats } from "@/hooks/useLeads";
import { useDirectieActuals, useKpiTargets } from "@/hooks/useKpiTargets";
import {
  KPI_METRICS, cumulativeActual, formatKpiValue, monthTarget, progressPct, yearTarget,
} from "@/services/kpiTargets";

const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function GoalBar({ label, actual, target, unit }: { label: string; actual: number; target: number | null; unit: "eur" | "kwh" | "count" }) {
  const pct = progressPct(actual, target);
  if (pct === null || target === null) return null;
  const tone = pct >= 100 ? "text-[hsl(var(--status-green,152_60%_40%))]" : pct >= 70 ? "text-[hsl(var(--status-amber))]" : "text-destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{formatKpiValue(actual, unit)}</span>
          <span className="text-muted-foreground"> / {formatKpiValue(target, unit)}</span>
          <span className={`ml-2 font-semibold ${tone}`}>{pct}%</span>
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export default function DirectieDashboard() {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1-12
  const [year, setYear] = useState(curYear);

  const { months, kpis, isLoading } = useDirectieActuals(year);
  const targetsQ = useKpiTargets(year);
  const leadStats = useLeadStats();

  const targets = useMemo(() => targetsQ.data ?? [], [targetsQ.data]);
  const isCurrentYear = year === curYear;
  const monthIdx = curMonth - 1;

  // Metrics waarvoor een doel is gezet — die tonen we in het doelenblok.
  const goalMetrics = KPI_METRICS.filter((m) => targets.some((t) => t.metric === m.key));

  const chartData = months.omzet.map((v, i) => ({ maand: MONTH_LABELS[i], omzet: Math.round(v) }));
  const omzetMaanddoel = monthTarget(targets, "omzet", isCurrentYear ? curMonth : 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bedrijfsoverzicht — KPI's en doelen</p>
        </div>
        <PeriodStepper
          label={`Kalenderjaar ${year}`}
          index={Math.max(0, (kpis.availableYears ?? [curYear]).indexOf(year))}
          count={(kpis.availableYears ?? [curYear]).length}
          onIndexChange={(i) => setYear((kpis.availableYears ?? [curYear])[i] ?? curYear)}
        />
      </div>

      {/* KPI-strip: deze maand + stand van het bedrijf */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Omzet deze maand" value={formatKpiValue(kpis.monthRevenue ?? 0, "eur")}
          subtitle={kpis.revenueChange != null ? `${kpis.revenueChange >= 0 ? "+" : ""}${kpis.revenueChange}% t.o.v. vorige maand` : null}
          icon={<Euro className="h-5 w-5" />} accent="primary" />
        <KpiTile label="Marge deze maand" value={formatKpiValue(isCurrentYear ? months.marge[monthIdx] ?? 0 : cumulativeActual(months.marge, 12), "eur")}
          subtitle={isCurrentYear ? null : `heel ${year}`}
          icon={<TrendingUp className="h-5 w-5" />} accent="green" />
        <KpiTile label="kWh deze maand" value={formatKpiValue(isCurrentYear ? months.kwh[monthIdx] ?? 0 : cumulativeActual(months.kwh, 12), "kwh")}
          subtitle={isCurrentYear ? null : `heel ${year}`}
          icon={<Zap className="h-5 w-5" />} accent="blue" />
        <KpiTile label="Gewonnen leads" value={String(leadStats.data?.wonThisMonth ?? 0)}
          subtitle={leadStats.data?.winRate != null ? `winrate ${leadStats.data.winRate}%` : null}
          icon={<Target className="h-5 w-5" />} accent="amber" />
        <KpiTile label="Actieve klanten" value={String(kpis.activeClients ?? 0)}
          subtitle={`van ${kpis.totalClients ?? 0} totaal`}
          icon={<Users className="h-5 w-5" />} accent="muted" />
        <KpiTile label="Palen online" value={String(kpis.onlineChargePoints ?? 0)}
          subtitle={kpis.offlineChargePoints ? `${kpis.offlineChargePoints} offline` : "alles online"}
          icon={<PlugZap className="h-5 w-5" />} accent={kpis.offlineChargePoints ? "red" : "green"} />
      </div>

      {/* Doelenvoortgang */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Doelen {year}</p>
            <Button asChild variant="outline" size="sm"><Link to="/admin/doelen"><Crosshair className="mr-1.5 h-3.5 w-3.5" /> Doelen beheren</Link></Button>
          </div>
          {targetsQ.isLoading || isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
          ) : goalMetrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen doelen gezet voor {year}. Stel doelen in via <Link className="text-primary hover:underline" to="/admin/doelen">Doelen</Link> — dan zie je hier per KPI hoe je ervoor staat.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {goalMetrics.map((m) => {
                const series = months[m.key];
                const jaarDoel = yearTarget(targets, m.key);
                const cumUpto = isCurrentYear ? curMonth : 12;
                return (
                  <div key={m.key} className="rounded-lg border bg-card p-4 space-y-3">
                    <p className="text-sm font-semibold">{m.label}</p>
                    {isCurrentYear && (
                      <GoalBar label={`Deze maand (${MONTH_LABELS[monthIdx]})`} actual={series[monthIdx] ?? 0}
                        target={monthTarget(targets, m.key, curMonth)} unit={m.unit} />
                    )}
                    <GoalBar label={`Jaar (t/m ${MONTH_LABELS[cumUpto - 1]})`} actual={cumulativeActual(series, cumUpto)}
                      target={jaarDoel} unit={m.unit} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Omzet per maand + doellijn */}
      <Card>
        <CardContent className="p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">E-Charging omzet per maand</p>
          <div className="h-[300px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="maand" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(v: number) => [formatKpiValue(v, "eur"), "Omzet"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  {omzetMaanddoel !== null && (
                    <ReferenceLine y={omzetMaanddoel} stroke="hsl(var(--status-amber))" strokeDasharray="6 4"
                      label={{ value: "doel", position: "right", fill: "hsl(var(--status-amber))", fontSize: 11 }} />
                  )}
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
