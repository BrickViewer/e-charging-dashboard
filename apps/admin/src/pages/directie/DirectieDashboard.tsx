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
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, Euro, ListChecks, MapPin, PlugZap, Target, Users, Crosshair } from "lucide-react";
import { KpiTile } from "@/components/admin/KpiTile";
import { OnboardingOverview } from "@/components/directie/OnboardingOverview";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { useLeadStats } from "@/hooks/useLeads";
import { useAllChargePoints, useAllClients } from "@/hooks/useAdminData";
import { useDirectieActuals, useKpiTargets } from "@/hooks/useKpiTargets";
import { useAgendaEvents } from "@/hooks/useAgenda";
import { useAllTasks, useToggleTask } from "@/hooks/useTasks";
import {
  KPI_METRICS, cumulativeActual, formatKpiValue, monthTarget, progressPct, rawPct, yearTarget,
} from "@/services/kpiTargets";

const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function GoalBar({ label, actual, target, unit }: { label: string; actual: number; target: number | null; unit: "eur" | "kwh" | "count" }) {
  const barPct = progressPct(actual, target);
  const labelPct = rawPct(actual, target);
  if (barPct === null || labelPct === null || target === null) return null;
  const tone = labelPct >= 100 ? "text-[hsl(var(--status-green,152_60%_40%))]" : labelPct >= 70 ? "text-[hsl(var(--status-amber))]" : "text-destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{formatKpiValue(actual, unit)}</span>
          <span className="text-muted-foreground"> / {formatKpiValue(target, unit)}</span>
          <span className={`ml-2 font-semibold ${tone}`}>{labelPct}%</span>
        </span>
      </div>
      <Progress value={barPct} className="h-1.5" />
    </div>
  );
}

export default function DirectieDashboard() {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1-12
  const [year, setYear] = useState(curYear);

  const { months, kpis, isLoading, isError } = useDirectieActuals(year);
  const targetsQ = useKpiTargets(year);
  const leadStats = useLeadStats();

  // KPI-strip hangt op meerdere queries; laat een skeleton/foutbanner zien i.p.v.
  // een flits van nullen (patroon van AdminDashboard).
  const { isLoading: cpLoading, isError: cpError } = useAllChargePoints();
  const { isLoading: clLoading, isError: clError } = useAllClients();
  const kpiLoading = isLoading || cpLoading || clLoading;
  const kpiError = isError || cpError || clError;

  // Vandaag-blok: je eigen Outlook-afspraken + open taken t/m vandaag, afvinkbaar.
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayAgenda = useAgendaEvents(`${todayKey}T00:00:00`, `${todayKey}T23:59:59`);
  const tasksQ = useAllTasks("all");
  const toggleTask = useToggleTask();
  const todayEvents = todayAgenda.events;
  const todayTasks = (tasksQ.data ?? [])
    .filter((t) => !t.done && t.due_date && t.due_date <= todayKey)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

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
      {kpiError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-muted-foreground">De bedrijfscijfers konden niet volledig worden geladen. Ververs de pagina om het opnieuw te proberen.</CardContent>
        </Card>
      )}
      {kpiLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] w-full rounded-xl" />)}
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Omzet deze maand" value={formatKpiValue(kpis.monthRevenue ?? 0, "eur")}
          subtitle={kpis.revenueChange != null ? `${kpis.revenueChange >= 0 ? "+" : ""}${kpis.revenueChange}% t.o.v. vorige maand` : null}
          icon={<Euro className="h-5 w-5" />} accent="primary" />
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
      )}

      {/* Vandaag: afspraken + taken op één plek */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Vandaag in de agenda</p>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to="/admin/agenda">Naar agenda</Link></Button>
            </div>
            {todayAgenda.isLoading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : todayAgenda.status === "not_connected" ? (
              <p className="text-sm text-muted-foreground">Je Microsoft-agenda is nog niet gekoppeld — koppel 'm in <Link to="/admin/agenda" className="text-primary hover:underline">Agenda</Link>.</p>
            ) : todayAgenda.status === "error" ? (
              <p className="text-sm text-muted-foreground">Je afspraken konden niet worden geladen. Zie <Link to="/admin/agenda" className="text-primary hover:underline">Agenda</Link>.</p>
            ) : todayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen afspraken vandaag.</p>
            ) : (
              <div className="space-y-1.5">
                {todayEvents.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="w-[88px] shrink-0 tabular-nums text-xs text-muted-foreground">
                      {e.isAllDay ? "Hele dag" : `${e.start.slice(11, 16)} – ${e.end.slice(11, 16)}`}
                    </span>
                    <span className="flex-1 truncate">{e.subject}</span>
                    {e.location && <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex"><MapPin className="h-3 w-3" />{e.location}</span>}
                  </div>
                ))}
                {todayEvents.length > 4 && (
                  <Link to="/admin/agenda" className="block px-1 text-xs text-muted-foreground hover:text-foreground">+{todayEvents.length - 4} meer…</Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"><ListChecks className="h-3.5 w-3.5" /> Taken voor vandaag</p>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to="/admin/taken">Naar taken</Link></Button>
            </div>
            {tasksQ.isLoading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niets open voor vandaag — alles bij.</p>
            ) : (
              <div className="space-y-1.5">
                {todayTasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: t.lead_id })} />
                    <Link to={`/admin/taken?task=${t.id}`} className="flex-1 truncate hover:underline">{t.title}</Link>
                    {t.due_date && t.due_date < todayKey && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">te laat</span>
                    )}
                  </div>
                ))}
                {todayTasks.length > 5 && (
                  <Link to="/admin/taken" className="block px-1 text-xs text-muted-foreground hover:text-foreground">+{todayTasks.length - 5} meer…</Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding-statusoverzicht: pijplijn + wat aandacht vraagt */}
      <OnboardingOverview />

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
