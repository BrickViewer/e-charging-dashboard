import { useAllChargePoints } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { Plug, Search, Zap, WifiOff, Activity } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

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

export default function AdminChargePoints() {
  const { data: chargePoints, isLoading } = useAllChargePoints();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

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

  // Reset page when filters change
  useMemo(() => setPage(0), [debouncedSearch, statusFilter, clientFilter, locationFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Laadpunt Monitoring</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Totaal" value={String(total)} icon={<Plug className="w-5 h-5" />} />
        <KPICard label="Online" value={String(online)} icon={<Zap className="w-5 h-5" />} />
        <KPICard label="Offline / Storing" value={String(offlineError)} icon={<WifiOff className="w-5 h-5" />} />
        <KPICard label="In gebruik" value={String(inUse)} icon={<Activity className="w-5 h-5" />} />
      </div>

      {/* Filters */}
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

      {/* Table */}
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
                    <tr key={cp.id} className="border-b border-border last:border-0 hover:bg-accent/50">
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

          {/* Pagination */}
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
    </div>
  );
}
