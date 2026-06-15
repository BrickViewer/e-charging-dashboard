import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PORTAL_LOCATION_FIELDS } from "@/hooks/useClientData";
import { getPortalSessions } from "@/services/sessions";
import { DEMO_LOCATIONS, getDemoSessions } from "@/lib/demoData";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sun, Zap } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { PortalLocation } from "@/types/db";

export default function ClientLocationDetail() {
  const { id } = useParams<{ id: string }>();
  const demo = useDemoMode();

  const { data: location, isLoading } = useQuery({
    queryKey: demo ? ["demo", "client-location-detail", id] : ["client-location-detail", id],
    queryFn: async () => {
      if (demo) return DEMO_LOCATIONS.find((loc) => loc.id === id) ?? null;
      const { data, error } = await supabase
        .from("locations")
        .select(PORTAL_LOCATION_FIELDS)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as PortalLocation;
    },
    enabled: !!id,
  });

  const { data: sessions } = useQuery({
    queryKey: demo ? ["demo", "client-location-sessions", id] : ["client-location-sessions", id],
    // Netto-only via RPC; bruto/fee bereiken de browser niet.
    queryFn: async () => (demo ? getDemoSessions({ locationId: id, limit: 20 }) : getPortalSessions({ locationId: id, limit: 20 })),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground">Laden...</div>;
  }

  if (!location) {
    return <div className="text-center py-16 text-muted-foreground">Locatie niet gevonden</div>;
  }

  const chargePoints = location.charge_points || [];
  const online = chargePoints.filter((cp) => cp.status === "online" || cp.status === "in_use").length;

  const statusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-primary text-primary-foreground";
      case "in_use": return "bg-blue-500 text-white";
      case "offline": return "bg-destructive text-destructive-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "online": return "Online";
      case "in_use": return "In gebruik";
      case "offline": return "Offline";
      default: return status || "Onbekend";
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header met terug-knop en locatie-naam */}
      <div className="flex items-center gap-3">
        <Link to={demo ? "/demo" : "/portal"}>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-accent/40">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{location.name || location.address}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {location.address}, {location.postal_code} {location.city}
          </p>
        </div>
      </div>

      {/* Locatie-info — cockpit tegels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="cockpit-section-label">Type</p>
            <p className="font-semibold text-sm capitalize mt-1">{location.property_type || "-"}</p>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="cockpit-section-label">Laadpunten</p>
            <p className="font-semibold text-sm mt-1 tabular-nums">{online} / {chargePoints.length} online</p>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="cockpit-section-label">Zonnepanelen</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              {location.has_solar ? <Sun className="w-3.5 h-3.5 text-yellow-500" /> : null}
              <p className="font-semibold text-sm">{location.has_solar ? `${location.solar_capacity_kwp || "?"} kWp` : "Nee"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="cockpit-section-label">Parkeerplaatsen</p>
            <p className="font-semibold text-sm mt-1 tabular-nums">{location.parking_spots || "-"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Laadpunten */}
      <div className="space-y-3">
        <h3 className="cockpit-section-label tracking-[0.28em] text-foreground/90 px-1">Laadpunten</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {chargePoints.map((cp) => (
            <Card key={cp.id} className="portal-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{cp.name || "Laadpunt"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cp.brand} {cp.model} · {cp.type?.toUpperCase()} · {cp.max_power || "?"}kW
                      </p>
                    </div>
                  </div>
                  <Badge className={`${statusColor(cp.status)} flex-shrink-0`}>{statusLabel(cp.status)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recente sessies */}
      <div className="space-y-3">
        <h3 className="cockpit-section-label tracking-[0.28em] text-foreground/90 px-1">Recente sessies</h3>
        <Card className="portal-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 cockpit-section-label">Datum</th>
                    <th className="text-left p-3 cockpit-section-label">Laadpunt</th>
                    <th className="text-right p-3 cockpit-section-label">kWh</th>
                    <th className="text-right p-3 cockpit-section-label">Vergoeding (excl. BTW)</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions?.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="p-3">{s.started_at ? format(new Date(s.started_at), "d MMM yyyy HH:mm", { locale: nl }) : "-"}</td>
                      <td className="p-3">{s.charge_point_name || "-"}</td>
                      <td className="p-3 text-right tabular-nums">{s.kwh_delivered ?? "-"}</td>
                      <td className="p-3 text-right tabular-nums">€{Number(s.vergoeding || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {(!sessions || sessions.length === 0) && (
                    <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Geen sessies gevonden</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
