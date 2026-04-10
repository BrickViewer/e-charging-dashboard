import { useAllChargePoints } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMemo, useState } from "react";
import { Plug, Search, Zap, WifiOff, Activity, Save } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEuro, formatNumber } from "@/services/calculations";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  online: "Online",
  in_use: "In gebruik",
  offline: "Offline",
  error: "Storing",
  installation_pending: "Installatie gepland",
};

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    online: "bg-primary/10 text-primary",
    in_use: "bg-primary/10 text-primary",
    offline: "bg-destructive/10 text-destructive",
    error: "bg-destructive/10 text-destructive",
    installation_pending: "bg-muted text-muted-foreground",
  };
  return styles[status] || "bg-muted text-muted-foreground";
};

const PAGE_SIZE = 20;

function useChargePointSessions(cpId: string | null) {
  return useQuery({
    queryKey: ["admin-cp-sessions", cpId],
    enabled: !!cpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*")
        .eq("charge_point_id", cpId!)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

export default function AdminChargePoints() {
  const { data: chargePoints, isLoading } = useAllChargePoints();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Detail sheet state
  const [selectedCP, setSelectedCP] = useState<any>(null);
  const [editEvseIds, setEditEvseIds] = useState({ controller: "", evse: "" });
  const [savingEvse, setSavingEvse] = useState(false);
  const { data: cpSessions } = useChargePointSessions(selectedCP?.id || null);

  const openDetail = (cp: any) => {
    setSelectedCP(cp);
    setEditEvseIds({
      controller: cp.eflux_evse_controller_id || "",
      evse: cp.eflux_evse_id || "",
    });
  };

  const handleSaveEvseIds = async () => {
    if (!selectedCP) return;
    setSavingEvse(true);
    try {
      const { error } = await supabase.from("charge_points").update({
        eflux_evse_controller_id: editEvseIds.controller || null,
        eflux_evse_id: editEvseIds.evse || null,
      }).eq("id", selectedCP.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-chargepoints"] });
      toast.success("e-Flux IDs opgeslagen");
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSavingEvse(false);
    }
  };

  // Unique clients & locations for filter dropdowns
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    chargePoints?.forEach((cp: any) => {
      const name = cp.locations?.clients?.company_name;
      const id = cp.locations?.client_id;
      if (name && id) map.set(id, name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [chargePoints]);

  const locations = useMemo(() => {
    const map = new Map<string, string>();
    chargePoints?.forEach((cp: any) => {
      const name = cp.locations?.name || cp.locations?.address;
      const id = cp.location_id;
      if (name && id && (clientFilter === "all" || cp.locations?.client_id === clientFilter)) {
        map.set(id, name);
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [chargePoints, clientFilter]);

  // Filter
  const filtered = useMemo(() => {
    return (chargePoints || []).filter((cp: any) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q ||
        (cp.name || "").toLowerCase().includes(q) ||
        (cp.locations?.clients?.company_name || "").toLowerCase().includes(q) ||
        (cp.brand || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || cp.status === statusFilter;
      const matchClient = clientFilter === "all" || cp.locations?.client_id === clientFilter;
      const matchLocation = locationFilter === "all" || cp.location_id === locationFilter;
      return matchSearch && matchStatus && matchClient && matchLocation;
    });
  }, [chargePoints, debouncedSearch, statusFilter, clientFilter, locationFilter]);

  // KPIs
  const total = chargePoints?.length || 0;
  const online = chargePoints?.filter((cp: any) => cp.status === "online").length || 0;
  const offlineError = chargePoints?.filter((cp: any) => cp.status === "offline" || cp.status === "error").length || 0;
  const inUse = chargePoints?.filter((cp: any) => cp.status === "in_use").length || 0;

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useMemo(() => setPage(0), [debouncedSearch, statusFilter, clientFilter, locationFilter]);

  const relativeTime = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Zojuist";
    if (mins < 60) return `${mins} min geleden`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} uur geleden`;
    return `${Math.floor(hours / 24)} dagen geleden`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Laadpunt Monitoring</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Totaal" value={String(total)} icon={<Plug className="w-5 h-5" />} />
        <KPICard label="Online" value={String(online)} icon={<Zap className="w-5 h-5" />} />
        <KPICard label="Offline / Storing" value={String(offlineError)} icon={<WifiOff className="w-5 h-5" />} />
        <KPICard label="In gebruik" value={String(inUse)} icon={<Activity className="w-5 h-5" />} />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Zoek op naam, klant, merk..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="in_use">In gebruik</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="error">Storing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={v => { setClientFilter(v); setLocationFilter("all"); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Klant" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle klanten</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Locatie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle locaties</SelectItem>
            {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Laadpunt</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Locatie</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Merk / Model</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Connectiviteit</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                      <Plug className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Geen laadpunten gevonden</p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((cp: any) => (
                    <tr key={cp.id} className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer" onClick={() => openDetail(cp)}>
                      <td className="p-3 font-medium flex items-center gap-2">
                        <Plug className="w-4 h-4 text-muted-foreground shrink-0" />
                        {cp.name || "-"}
                      </td>
                      <td className="p-3 text-muted-foreground">{cp.locations?.name || cp.locations?.address || "-"}</td>
                      <td className="p-3">{cp.locations?.clients?.company_name || "-"}</td>
                      <td className="p-3 text-muted-foreground uppercase text-xs">{cp.type?.replace("_", " ") || "-"}</td>
                      <td className="p-3 text-muted-foreground">{[cp.brand, cp.model].filter(Boolean).join(" ") || "-"}</td>
                      <td className="p-3">
                        <ConnectivityIndicator state={cp.connectivity_state || "unknown"} />
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(cp.status)}`}>
                          {statusLabels[cp.status] || cp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {filtered.length} resultaten — pagina {page + 1} van {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Vorige</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Volgende</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!selectedCP} onOpenChange={open => { if (!open) setSelectedCP(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedCP?.name || "Laadpunt"}</SheetTitle>
          </SheetHeader>
          {selectedCP && (
            <div className="space-y-6 mt-4">
              {/* Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Locatie</span><span>{selectedCP.locations?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Klant</span><span>{selectedCP.locations?.clients?.company_name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="uppercase">{selectedCP.type?.replace("_", " ") || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Merk / Model</span><span>{[selectedCP.brand, selectedCP.model].filter(Boolean).join(" ") || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Serienummer</span><span className="font-mono text-xs">{selectedCP.serial_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MID-meter</span><span>{selectedCP.has_mid_meter ? "Ja" : "Nee"}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Connectiviteit</span><ConnectivityIndicator state={selectedCP.connectivity_state || "unknown"} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Laatste heartbeat</span><span>{relativeTime(selectedCP.last_heartbeat_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max vermogen</span><span>{selectedCP.max_power ? `${selectedCP.max_power} kW` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Connectors</span><span>{selectedCP.num_connectors || "—"}</span></div>
              </div>

              {/* Recent sessions */}
              <div>
                <h3 className="font-medium text-sm mb-2">Recente sessies</h3>
                {(!cpSessions || cpSessions.length === 0) ? (
                  <p className="text-sm text-muted-foreground">Geen sessies gevonden</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Datum</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">kWh</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Duur</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Opbrengst</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cpSessions.map((s: any) => (
                          <tr key={s.id} className="border-b border-border last:border-0">
                            <td className="p-2">{new Date(s.started_at).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" })}</td>
                            <td className="p-2 text-right">{formatNumber(Number(s.kwh_delivered || 0), 1)}</td>
                            <td className="p-2 text-right">{s.duration_minutes ? `${s.duration_minutes} min` : "—"}</td>
                            <td className="p-2 text-right">{formatEuro(Number(s.gross_revenue || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* e-Flux IDs */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm">e-Flux IDs</h3>
                <div>
                  <Label className="text-xs">EVSE Controller ID</Label>
                  <Input value={editEvseIds.controller} onChange={e => setEditEvseIds(p => ({ ...p, controller: e.target.value }))} className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">EVSE ID</Label>
                  <Input value={editEvseIds.evse} onChange={e => setEditEvseIds(p => ({ ...p, evse: e.target.value }))} className="font-mono text-xs" />
                </div>
                <Button size="sm" onClick={handleSaveEvseIds} disabled={savingEvse}>
                  <Save className="w-3 h-3 mr-1" />{savingEvse ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
