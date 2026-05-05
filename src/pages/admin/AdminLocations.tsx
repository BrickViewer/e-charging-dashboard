import { useAllLocations, useLatestEfluxSync } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, Plug, Wifi, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { triggerEfluxSync } from "@/services/locations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

type LinkFilter = "all" | "linked" | "unlinked";

export default function AdminLocations() {
  const { data: locations, isLoading } = useAllLocations();
  const { data: syncLogs } = useLatestEfluxSync();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    if (!locations) return [];
    return locations.filter((loc: any) => {
      if (linkFilter === "linked" && !loc.client_id) return false;
      if (linkFilter === "unlinked" && loc.client_id) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const haystack = [
          loc.name, loc.address, loc.city, loc.postal_code,
          loc.eflux_location_id, loc.clients?.company_name,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [locations, linkFilter, debouncedSearch]);

  const kpis = useMemo(() => {
    if (!locations) return { total: 0, linked: 0, unlinked: 0, totalCps: 0, online: 0 };
    const total = locations.length;
    const unlinked = locations.filter((l: any) => !l.client_id).length;
    const allCps = locations.flatMap((l: any) => l.charge_points || []);
    const online = allCps.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
    return {
      total,
      linked: total - unlinked,
      unlinked,
      totalCps: allCps.length,
      online,
    };
  }, [locations]);

  const lastSuccess = useMemo(() => {
    return syncLogs?.find((l: any) => l.status === "success" && l.entity_type === "cpo_sessions");
  }, [syncLogs]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await triggerEfluxSync();
      if (res?.status === "ok") {
        toast.success(
          `Sync klaar — ${res.locations?.upserted ?? 0} locaties, ${res.chargePoints?.upserted ?? 0} laadpunten, ${res.sessions?.upserted ?? 0} sessies`,
        );
        queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
        queryClient.invalidateQueries({ queryKey: ["admin-latest-sync"] });
      } else if (res?.status === "not_configured") {
        toast.warning("e-Flux nog niet geconfigureerd. Vul API-key in via instellingen.");
      } else {
        toast.error(res?.message || "Sync mislukt");
      }
    } catch (err: any) {
      toast.error(err.message || "Sync mislukt");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Locaties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Locaties uit e-Flux gesyncd. Klik op een locatie om deze aan een klant te koppelen.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSuccess && (
            <span className="text-xs text-muted-foreground">
              Laatste sync {formatDistanceToNow(new Date(lastSuccess.last_synced_at), { addSuffix: true, locale: nl })}
            </span>
          )}
          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sync nu
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Totaal locaties"
          value={String(kpis.total)}
          icon={<MapPin className="w-4 h-4" />}
        />
        <KPICard
          label="Ongekoppeld"
          value={String(kpis.unlinked)}
          subtitle={kpis.unlinked > 0 ? "Wachten op klant-toewijzing" : "Alles gekoppeld"}
          icon={<AlertCircle className="w-4 h-4" />}
          alert={kpis.unlinked > 0 ? `${kpis.unlinked} locatie(s) wachten op koppeling` : undefined}
        />
        <KPICard
          label="Laadpunten"
          value={String(kpis.totalCps)}
          icon={<Plug className="w-4 h-4" />}
        />
        <KPICard
          label="Online"
          value={`${kpis.online} / ${kpis.totalCps}`}
          subtitle={kpis.totalCps > 0 ? `${Math.round((kpis.online / kpis.totalCps) * 100)}% beschikbaar` : "Geen data"}
          icon={<Wifi className="w-4 h-4" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={linkFilter} onValueChange={(v) => setLinkFilter(v as LinkFilter)}>
          <TabsList>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="unlinked">
              Ongekoppeld {kpis.unlinked > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning-foreground">{kpis.unlinked}</span>}
            </TabsTrigger>
            <TabsTrigger value="linked">Gekoppeld</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op naam, adres, klant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Locatie</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Adres</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Laadpunten</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">e-Flux ID</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((loc: any) => {
                    const cps = loc.charge_points || [];
                    const onlineCount = cps.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
                    return (
                      <tr
                        key={loc.id}
                        className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/locaties/${loc.id}`)}
                      >
                        <td className="p-3 font-medium">{loc.name || loc.address || "—"}</td>
                        <td className="p-3 text-muted-foreground">
                          {loc.address ? `${loc.address}${loc.city ? `, ${loc.city}` : ""}` : "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {cps.length > 0 ? (
                            <span>
                              <span className={onlineCount === cps.length ? "text-primary" : "text-foreground"}>
                                {onlineCount}
                              </span>
                              <span className="text-muted-foreground"> / {cps.length}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {loc.clients ? (
                            <span className="text-foreground">{loc.clients.company_name}</span>
                          ) : (
                            <span className="badge-offerte">Ongekoppeld</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground font-mono">
                          {loc.eflux_location_id ? loc.eflux_location_id.slice(0, 12) + "…" : "—"}
                        </td>
                        <td className="p-3">
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground">
                        {locations && locations.length === 0
                          ? "Nog geen locaties — klik 'Sync nu' om uit e-Flux te halen."
                          : "Geen locaties gevonden voor deze filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
