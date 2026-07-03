import { useAllLocations, useLatestEfluxSync } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, Plug, Wifi, RefreshCw, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { triggerEfluxSync } from "@/services/locations";
import { isActiveChargePoint } from "@/services/chargePoints";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { KpiTile } from "@/components/admin/KpiTile";
import { LocationDetailSheet } from "@/components/admin/location/LocationDetailSheet";
import type { AdminLocation, EfluxSyncLog } from "@/types/db";

// Een locatie telt als "gekoppeld" zolang de gekoppelde klant niet zacht verwijderd is.
// Soft-deleted klanten (status='verwijderd') negeren we in de KPI's en filters.
const isLinkedLocation = (loc: AdminLocation): boolean =>
  !!loc.client_id && loc.clients?.status !== "verwijderd";

type LinkFilter = "all" | "linked" | "unlinked";

export default function AdminLocations() {
  const { data: locations, isLoading, isError, refetch } = useAllLocations();
  const { data: syncLogs } = useLatestEfluxSync();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const [selLocationId, setSelLocationId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Deep-link vanuit klantdetail e.d.: ?location=<id> opent de slide-over.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const lid = searchParams.get("location");
    if (!lid) return;
    setSelLocationId(lid);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    if (!locations) return [];
    return ((locations ?? []) as AdminLocation[]).filter((loc) => {
      if (linkFilter === "linked" && !isLinkedLocation(loc)) return false;
      if (linkFilter === "unlinked" && isLinkedLocation(loc)) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const haystack = [
          loc.name, loc.address, loc.city, loc.postal_code,
          loc.eflux_location_id, loc.clients?.company_name,
          loc.clients?.client_number ? `#${loc.clients.client_number}` : null,
          loc.clients?.client_number ? String(loc.clients.client_number) : null,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [locations, linkFilter, debouncedSearch]);

  const kpis = useMemo(() => {
    if (!locations) return { total: 0, linked: 0, unlinked: 0, totalCps: 0, online: 0 };
    const total = locations.length;
    const typedLocations = locations as AdminLocation[];
    const unlinked = typedLocations.filter((l) => !isLinkedLocation(l)).length;
    const allCps = typedLocations.flatMap((l) => l.charge_points || []).filter(isActiveChargePoint);
    const online = allCps.filter((cp) => cp.status === "online" || cp.status === "in_use").length;
    return {
      total,
      linked: total - unlinked,
      unlinked,
      totalCps: allCps.length,
      online,
    };
  }, [locations]);

  const lastSuccess = useMemo(() => {
    return syncLogs?.find((l: EfluxSyncLog) => l.status === "success" && l.entity_type === "cpo_sessions");
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
        // Een sync raakt ook laadpunten, klant-koppelingen en de ongekoppelde-lijst.
        queryClient.invalidateQueries({ queryKey: ["admin-chargepoints"] });
        queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
        queryClient.invalidateQueries({ queryKey: ["unlinked-locations"] });
      } else if (res?.status === "not_configured") {
        toast.warning("e-Flux nog niet geconfigureerd. Vul API-key in via instellingen.");
      } else {
        toast.error(res?.message || "Sync mislukt");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync mislukt");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Locaties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live data uit e-Flux — koppel locaties aan klanten zodat ze in hun portaal verschijnen
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSuccess && (
            <span className="text-xs text-muted-foreground tracking-wide">
              Sync{" "}
              {formatDistanceToNow(new Date(lastSuccess.last_synced_at), {
                addSuffix: true,
                locale: nl,
              })}
            </span>
          )}
          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="portal-card">
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync nu
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Totaal locaties"
          value={String(kpis.total)}
          icon={<MapPin className="w-4 h-4" />}
        />
        <KpiTile
          label="Ongekoppeld"
          value={String(kpis.unlinked)}
          subtitle={
            kpis.unlinked > 0 ? "Wachten op klant-toewijzing" : "Alles gekoppeld"
          }
          icon={<AlertCircle className="w-4 h-4" />}
          accent={kpis.unlinked > 0 ? "amber" : "muted"}
        />
        <KpiTile
          label="Laadpunten"
          value={String(kpis.totalCps)}
          icon={<Plug className="w-4 h-4" />}
        />
        <KpiTile
          label="Online"
          value={`${kpis.online} / ${kpis.totalCps}`}
          subtitle={
            kpis.totalCps > 0
              ? `${Math.round((kpis.online / kpis.totalCps) * 100)}% beschikbaar`
              : "Geen data"
          }
          icon={<Wifi className="w-4 h-4" />}
          accent="primary"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={linkFilter} onValueChange={(v) => setLinkFilter(v as LinkFilter)}>
          <TabsList>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="unlinked">
              Ongekoppeld
              {kpis.unlinked > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 tabular-nums">
                  {kpis.unlinked}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="linked">Gekoppeld</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            aria-label="Zoek locaties op naam, adres of klant"
            placeholder="Zoek op naam, adres, klant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 portal-card"
          />
        </div>
      </div>

      {/* Tabel */}
      <Card className="portal-card">
        <CardContent className="p-0">
          {isError ? (
            <div
              role="alert"
              className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
            >
              <AlertCircle className="w-8 h-8 mx-auto mb-3 text-destructive" />
              <p className="font-medium text-foreground mb-1">
                Locaties konden niet worden geladen
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Er ging iets mis bij het ophalen. Probeer het opnieuw.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Opnieuw proberen
              </Button>
            </div>
          ) : isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 cockpit-section-label">Locatie</th>
                    <th className="text-left p-3 cockpit-section-label">Adres</th>
                    <th className="text-right p-3 cockpit-section-label">Laadpunten</th>
                    <th className="text-left p-3 cockpit-section-label">Klant</th>
                    <th className="text-left p-3 cockpit-section-label">e-Flux ID</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((loc) => {
                    const cps = (loc.charge_points || []).filter(isActiveChargePoint);
                    const onlineCount = cps.filter(
                      (cp) =>
                        cp.status === "online" || cp.status === "in_use",
                    ).length;
                    return (
                      <tr
                        key={loc.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open locatie ${loc.name || loc.address || ""}`}
                        className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                        onClick={() => setSelLocationId(loc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelLocationId(loc.id);
                          }
                        }}
                      >
                        <td className="p-3 font-medium">
                          {loc.name || loc.address || "—"}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {loc.address
                            ? `${loc.address}${loc.city ? `, ${loc.city}` : ""}`
                            : "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {cps.length > 0 ? (
                            <span>
                              <span
                                className={
                                  onlineCount === cps.length
                                    ? "text-primary"
                                    : onlineCount === 0
                                    ? "text-muted-foreground"
                                    : "text-foreground"
                                }
                              >
                                {onlineCount}
                              </span>
                              <span className="text-muted-foreground/60">
                                {" "}/ {cps.length}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isLinkedLocation(loc) && loc.clients ? (
                            <span className="text-foreground text-sm">
                              {loc.clients.client_number && (
                                <span className="mr-2 text-xs font-semibold tabular-nums text-primary">
                                  #{loc.clients.client_number}
                                </span>
                              )}
                              {loc.clients.company_name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-amber-400/15 text-amber-400 border border-amber-400/25">
                              Ongekoppeld
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-muted-foreground/80 font-mono">
                          {loc.eflux_location_id
                            ? loc.eflux_location_id.slice(0, 12) + "…"
                            : "—"}
                        </td>
                        <td className="p-3">
                          <ExternalLink className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-12 text-center text-muted-foreground"
                      >
                        {locations && locations.length === 0 ? (
                          <>
                            <MapPin className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                            <p className="font-medium text-foreground mb-1">
                              Nog geen locaties
                            </p>
                            <p className="text-sm">
                              Klik "Sync nu" om uit e-Flux te halen
                            </p>
                          </>
                        ) : (
                          "Geen locaties gevonden voor deze filters"
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LocationDetailSheet
        locationId={selLocationId}
        open={!!selLocationId}
        onOpenChange={(v) => !v && setSelLocationId(null)}
      />
    </div>
  );
}
