import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, CheckCircle2, Timer, Search, Zap, RotateCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiTile } from "@/components/admin/KpiTile";
import { useFaults, useSuspectedChargePoints, type FaultRow } from "@/hooks/useFaults";
import { FAULT_STATUS_LABELS, FAULT_REASON_LABELS, isOpenStatus, type FaultStatus } from "@/services/faults";

function statusBadge(status: FaultStatus) {
  const open = isOpenStatus(status);
  const cls = status === "opgelost" || status === "automatisch_hersteld"
    ? "bg-green-600 hover:bg-green-600/90"
    : status === "vals_alarm"
      ? "bg-muted text-muted-foreground"
      : open
        ? "bg-destructive/15 text-destructive border border-destructive/30"
        : "bg-muted";
  return <Badge className={cls}>{FAULT_STATUS_LABELS[status]}</Badge>;
}

const rel = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: nl });

export default function AdminStoringen() {
  const faults = useFaults();
  const suspected = useSuspectedChargePoints();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const rows = useMemo(() => faults.data ?? [], [faults.data]);

  const kpis = useMemo(() => {
    const open = rows.filter((r) => isOpenStatus(r.status));
    const since = Date.now() - 30 * 86400_000;
    const resolved30 = rows.filter((r) => (r.status === "opgelost" || r.status === "automatisch_hersteld") && r.resolved_at && new Date(r.resolved_at).getTime() >= since);
    const durations = resolved30.filter((r) => r.resolved_at).map((r) => new Date(r.resolved_at!).getTime() - new Date(r.detected_at).getTime());
    const avgH = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 3600_000) : null;
    return { open: open.length, suspected: suspected.data?.length ?? 0, resolved30: resolved30.length, avgH };
  }, [rows, suspected.data]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter === "open") r = r.filter((x) => isOpenStatus(x.status));
    else if (statusFilter === "closed") r = r.filter((x) => !isOpenStatus(x.status));
    else if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        (x.clients?.company_name ?? "").toLowerCase().includes(q) ||
        (x.locations?.name ?? "").toLowerCase().includes(q) ||
        (x.charge_points?.name ?? "").toLowerCase().includes(q));
    }
    // Open eerst, dan op detectie aflopend.
    return [...r].sort((a, b) => {
      const ao = isOpenStatus(a.status) ? 0 : 1, bo = isOpenStatus(b.status) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Storingen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Proactieve detectie van laadpunten met een storing. We zien het voordat de klant het merkt.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Actieve storingen" value={String(kpis.open)} icon={<AlertTriangle className="w-5 h-5" />} accent={kpis.open > 0 ? "red" : "primary"} subtitle={kpis.open > 0 ? "vragen om actie" : "alles operationeel"} />
        <KpiTile label="Verdacht" value={String(kpis.suspected)} icon={<Clock className="w-5 h-5" />} accent={kpis.suspected > 0 ? "amber" : "muted"} subtitle="lang geen hartslag" />
        <KpiTile label="Opgelost (30d)" value={String(kpis.resolved30)} icon={<CheckCircle2 className="w-5 h-5" />} accent="blue" />
        <KpiTile label="Gem. oplostijd" value={kpis.avgH !== null ? `${kpis.avgH} u` : "—"} icon={<Timer className="w-5 h-5" />} accent="muted" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek klant, locatie of paal" aria-label="Zoek storingen op klant, locatie of paal" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]" aria-label="Filter storingen op status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Actieve storingen</SelectItem>
            <SelectItem value="closed">Afgehandeld</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
            {(Object.keys(FAULT_STATUS_LABELS) as FaultStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{FAULT_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {faults.isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : faults.isError || suspected.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm font-medium">Storingen konden niet worden geladen</p>
              <p className="mt-1 text-sm text-muted-foreground">{(faults.error ?? suspected.error)?.message ?? "Onbekende fout"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { faults.refetch(); suspected.refetch(); }}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Opnieuw proberen
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        statusFilter === "open" && !search.trim() ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <p className="mt-3 text-sm text-muted-foreground">Geen actieve storingen. Alle laadpunten doen het.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Geen storingen in deze weergave.</p>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Klant</th>
                <th className="px-4 py-2.5 font-medium">Locatie</th>
                <th className="px-4 py-2.5 font-medium">Laadpunt</th>
                <th className="px-4 py-2.5 font-medium">Reden</th>
                <th className="px-4 py-2.5 font-medium">Gedetecteerd</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f: FaultRow) => {
                const goToDetail = () => navigate(`/admin/storingen/${f.id}`);
                return (
                <tr
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  className="border-b last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none cursor-pointer"
                  onClick={goToDetail}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToDetail(); } }}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-foreground">{f.clients?.company_name || "—"}</span>
                    {f.clients?.client_number && <span className="ml-1.5 text-[11px] text-muted-foreground">#{f.clients.client_number}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {f.locations?.name || "—"}
                    {f.locations?.city && <span className="block text-[11px]">{f.locations.city}</span>}
                  </td>
                  <td className="px-4 py-2.5">{f.charge_points?.name || "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-destructive border-destructive/30">{FAULT_REASON_LABELS[f.fault_reason as keyof typeof FAULT_REASON_LABELS] ?? f.fault_reason}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rel(f.detected_at)}</td>
                  <td className="px-4 py-2.5">{statusBadge(f.status)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(suspected.data?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mt-2"><Clock className="w-4 h-4 text-[hsl(var(--status-amber))]" /> Verdacht (lang geen hartslag)</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Deze palen melden zich nog als verbonden maar stuurden lange tijd geen hartslag. Geen harde storing, wel het in de gaten houden waard.</p>
          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Klant</th>
                  <th className="px-4 py-2.5 font-medium">Locatie</th>
                  <th className="px-4 py-2.5 font-medium">Laadpunt</th>
                  <th className="px-4 py-2.5 font-medium">Laatste hartslag</th>
                </tr>
              </thead>
              <tbody>
                {(suspected.data ?? []).map((cp) => (
                  <tr key={cp.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground">{cp.locations?.clients?.company_name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cp.locations?.name || "—"}</td>
                    <td className="px-4 py-2.5 flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-[hsl(var(--status-amber))]" />{cp.name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cp.last_heartbeat_at ? rel(cp.last_heartbeat_at) : "onbekend"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
