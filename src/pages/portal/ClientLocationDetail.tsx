import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Sun, Zap } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function ClientLocationDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: location, isLoading } = useQuery({
    queryKey: ["client-location-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*, charge_points(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: sessions } = useQuery({
    queryKey: ["client-location-sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*, charge_points(name)")
        .eq("location_id", id!)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  if (!location) {
    return <div className="text-center py-12 text-muted-foreground">Locatie niet gevonden</div>;
  }

  const chargePoints = (location as any).charge_points || [];
  const online = chargePoints.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;

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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/portal">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{location.name || location.address}</h1>
          <p className="text-sm text-muted-foreground">{location.address}, {location.postal_code} {location.city}</p>
        </div>
      </div>

      {/* Location info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="font-medium text-sm capitalize">{location.property_type || "-"}</p>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Laadpunten</p>
            <p className="font-medium text-sm">{online} / {chargePoints.length} online</p>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Zonnepanelen</p>
            <div className="flex items-center justify-center gap-1">
              {location.has_solar ? <Sun className="w-3.5 h-3.5 text-yellow-500" /> : null}
              <p className="font-medium text-sm">{location.has_solar ? `${location.solar_capacity_kwp || "?"} kWp` : "Nee"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Parkeerplaatsen</p>
            <p className="font-medium text-sm">{location.parking_spots || "-"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charge points */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Laadpunten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {chargePoints.map((cp: any) => (
            <Card key={cp.id} className="portal-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{cp.name || cp.serial_number || "Laadpunt"}</p>
                      <p className="text-xs text-muted-foreground">
                        {cp.brand} {cp.model} · {cp.type?.toUpperCase()} · {cp.max_power || "?"}kW
                      </p>
                    </div>
                  </div>
                  <Badge className={statusColor(cp.status)}>{statusLabel(cp.status)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Recente sessies</h2>
        <Card className="portal-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-muted-foreground font-medium">Datum</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Laadpunt</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">kWh</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Opbrengst</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions?.map((s: any) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="p-3">{s.started_at ? format(new Date(s.started_at), "d MMM yyyy HH:mm", { locale: nl }) : "-"}</td>
                      <td className="p-3">{s.charge_points?.name || "-"}</td>
                      <td className="p-3 text-right">{Number(s.kwh_delivered || 0).toFixed(1)}</td>
                      <td className="p-3 text-right text-primary font-medium">€{Number(s.client_share || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(!sessions || sessions.length === 0) && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Geen sessies gevonden</td></tr>
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
