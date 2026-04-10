import { useClientProfile, useClientKPIs, useClientLocations, useClientSessions } from "@/hooks/useClientData";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MapPin, Zap, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function ClientDashboard() {
  const { data: client, isLoading } = useClientProfile();
  const kpis = useClientKPIs(client?.id);
  const { data: locations } = useClientLocations(client?.id);
  const { data: recentSessions } = useClientSessions(client?.id, 10);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  // Build chart data from settlements
  const chartData = kpis.settlements
    .slice(0, 12)
    .reverse()
    .map(s => ({
      month: s.month ? format(new Date(s.month), "MMM", { locale: nl }) : "",
      marge: Number(s.client_payout || 0),
      ere: Number(s.ere_estimate || 0),
    }));

  const formatCurrency = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatKwh = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">
        Welkom{client?.contact_name ? `, ${client.contact_name}` : ""}
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Totaal verdiend"
          value={formatCurrency(kpis.totalEarned)}
          subtitle="deze maand"
          change={kpis.earningsChange}
          icon={<Zap className="w-5 h-5" />}
        />
        <KPICard
          label="kWh geladen"
          value={formatKwh(kpis.kwhLoaded)}
          subtitle="deze maand"
          change={kpis.kwhChange}
          icon={<Activity className="w-5 h-5" />}
        />
        <KPICard
          label="Laadpunten"
          value={`${kpis.chargePointsOnline} / ${kpis.chargePointsTotal}`}
          subtitle="online"
          icon={<MapPin className="w-5 h-5" />}
          alert={kpis.offlineCount > 0 ? `${kpis.offlineCount} offline` : undefined}
        />
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="section-heading">Opbrengst per maand</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                  }}
                  formatter={(value: number, name: string) => [
                    `€${value.toFixed(2)}`,
                    name === "marge" ? "Laadmarge" : "ERE-schatting",
                  ]}
                />
                <Area type="monotone" dataKey="marge" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                <Area type="monotone" dataKey="ere" stackId="1" stroke="hsl(var(--primary-kpi))" fill="hsl(var(--primary-kpi))" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Locations */}
      {locations && locations.length > 0 && (
        <div className="space-y-3">
          <h2 className="section-heading">Locaties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {locations.map((loc: any) => {
              const cps = loc.charge_points || [];
              const online = cps.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
              return (
                <Link key={loc.id} to={`/portal/locatie/${loc.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin className="w-4 h-4 text-primary" />
                            <span className="font-medium text-foreground">{loc.name || loc.address}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{loc.address}, {loc.city}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${online === cps.length ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                          {online}/{cps.length} online
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recentSessions && recentSessions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-heading">Recente sessies</h2>
            <Link to="/portal/sessies" className="text-sm text-primary hover:underline">Bekijk alle sessies →</Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-muted-foreground font-medium">Datum</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Laadpunt</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Duur</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">kWh</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Opbrengst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((s: any) => (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="p-3">{s.started_at ? format(new Date(s.started_at), "d MMM HH:mm", { locale: nl }) : "-"}</td>
                        <td className="p-3">{s.charge_points?.name || "-"}</td>
                        <td className="p-3 text-right">{s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}u ${s.duration_minutes % 60}m` : "-"}</td>
                        <td className="p-3 text-right">{Number(s.kwh_delivered || 0).toFixed(1)}</td>
                        <td className="p-3 text-right text-primary font-medium">€{Number(s.client_share || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {(!recentSessions || recentSessions.length === 0) && !isLoading && (
        <Card>
          <CardContent className="p-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Nog geen laaddata</h3>
            <p className="text-muted-foreground">Zodra uw laadpunten actief zijn, verschijnen hier uw opbrengsten.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
