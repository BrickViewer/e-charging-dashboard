import { useClientProfile, useClientLocations } from "@/hooks/useClientData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subMonths } from "date-fns";
import { nl } from "date-fns/locale";
import { Download, ChevronLeft, ChevronRight, Zap, Euro, BatteryCharging } from "lucide-react";
import { useState, useMemo } from "react";

const PAGE_SIZE = 20;

const DATE_RANGES = [
  { label: "Laatste 7 dagen", value: "7d" },
  { label: "Laatste 30 dagen", value: "30d" },
  { label: "Laatste 3 maanden", value: "3m" },
  { label: "Alles", value: "all" },
] as const;

function getDateFrom(range: string): string | null {
  const now = new Date();
  switch (range) {
    case "7d": return subDays(now, 7).toISOString();
    case "30d": return subDays(now, 30).toISOString();
    case "3m": return subMonths(now, 3).toISOString();
    default: return null;
  }
}

export default function ClientSessions() {
  const { data: client } = useClientProfile();
  const { data: locations } = useClientLocations(client?.id);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [chargePointFilter, setChargePointFilter] = useState("all");
  const [page, setPage] = useState(0);

  const allChargePoints = useMemo(() => {
    if (!locations) return [];
    return locations.flatMap((l: any) => (l.charge_points || []).map((cp: any) => ({
      id: cp.id,
      name: cp.name || cp.serial_number || "Laadpunt",
    })));
  }, [locations]);

  const dateFrom = getDateFrom(dateRange);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["client-sessions-filtered", client?.id, dateFrom, chargePointFilter],
    queryFn: async () => {
      let query = supabase
        .from("charging_sessions")
        .select("*, charge_points(name)")
        .eq("client_id", client!.id)
        .order("started_at", { ascending: false });
      if (dateFrom) query = query.gte("started_at", dateFrom);
      if (chargePointFilter !== "all") query = query.eq("charge_point_id", chargePointFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id,
  });

  const filtered = useMemo(() => {
    const result = sessions?.filter((s: any) =>
      (s.charge_points?.name || "").toLowerCase().includes(search.toLowerCase())
    ) || [];
    return result;
  }, [sessions, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totals = useMemo(() => ({
    sessions: filtered.length,
    kwh: filtered.reduce((s, r: any) => s + Number(r.kwh_delivered || 0), 0),
    gross: filtered.reduce((s, r: any) => s + Number(r.gross_revenue || 0), 0),
    share: filtered.reduce((s, r: any) => s + Number(r.client_share || 0), 0),
  }), [filtered]);

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = "Datum,Laadpunt,Duur (min),kWh,Bruto,Uw opbrengst\n";
    const rows = filtered.map((s: any) =>
      `${s.started_at},${s.charge_points?.name || ""},${s.duration_minutes},${s.kwh_delivered},€${Number(s.gross_revenue).toFixed(2)},€${Number(s.client_share).toFixed(2)}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "laadsessies.csv";
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Snapshot KPI's voor het huidige filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BatteryCharging className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Sessies</p>
                <p className="text-base font-semibold tabular-nums mt-0.5">{totals.sessions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">kWh geleverd</p>
                <p className="text-base font-semibold tabular-nums mt-0.5">{totals.kwh.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
                <Euro className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Bruto omzet</p>
                <p className="text-base font-semibold tabular-nums mt-0.5">€{totals.gross.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Euro className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Uw opbrengst</p>
                <p className="text-base font-semibold text-primary tabular-nums mt-0.5">€{totals.share.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + export — cockpit control row */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Input
          placeholder="Zoek op laadpunt..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="w-full sm:w-[220px] portal-card"
        />
        <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] portal-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={chargePointFilter} onValueChange={(v) => { setChargePointFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px] portal-card">
            <SelectValue placeholder="Alle laadpunten" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle laadpunten</SelectItem>
            {allChargePoints.map((cp: any) => (
              <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="portal-card">
          <Download className="w-4 h-4 mr-2" />
          CSV Export
        </Button>
      </div>

      {/* Sessietabel */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 cockpit-section-label">Datum</th>
                  <th className="text-left p-3 cockpit-section-label">Laadpunt</th>
                  <th className="text-right p-3 cockpit-section-label">Duur</th>
                  <th className="text-right p-3 cockpit-section-label">kWh</th>
                  <th className="text-right p-3 cockpit-section-label">Bruto</th>
                  <th className="text-right p-3 cockpit-section-label">Uw opbrengst</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s: any) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="p-3">{s.started_at ? format(new Date(s.started_at), "d MMM yyyy HH:mm", { locale: nl }) : "-"}</td>
                    <td className="p-3">{s.charge_points?.name || "-"}</td>
                    <td className="p-3 text-right tabular-nums">{s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}u ${s.duration_minutes % 60}m` : "-"}</td>
                    <td className="p-3 text-right tabular-nums">{Number(s.kwh_delivered || 0).toFixed(1)}</td>
                    <td className="p-3 text-right tabular-nums">€{Number(s.gross_revenue || 0).toFixed(2)}</td>
                    <td className="p-3 text-right text-primary font-medium tabular-nums">€{Number(s.client_share || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Geen sessies gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Paginering */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page + 1} van {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="portal-card">
              <ChevronLeft className="w-4 h-4 mr-1" /> Vorige
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="portal-card">
              Volgende <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
