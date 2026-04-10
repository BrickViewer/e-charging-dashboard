import { useClientProfile, useClientKPIs, useClientLocations, useClientSessions } from "@/hooks/useClientData";
import { GaugeChart } from "@/components/portal/GaugeChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MapPin, Zap, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function ClientDashboard() {
  const { data: client, isLoading } = useClientProfile();
  const kpis = useClientKPIs(client?.id);
  const { data: locations } = useClientLocations(client?.id);
  const { data: recentSessions } = useClientSessions(client?.id, 5);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  const chartData = kpis.settlements
    .slice(0, 12)
    .reverse()
    .map(s => ({
      month: s.month ? format(new Date(s.month), "MMM", { locale: nl }) : "",
      marge: Number(s.client_payout || 0),
      ere: Number(s.ere_estimate || 0),
    }));

  // Sample fallback: als er geen echte data is, toon demo-waarden
  const kwhValue = kpis.kwhLoaded || 3500;
  const earningsValue = kpis.totalEarned || 1380;
  const avgKwh = kpis.avgKwh;
  const avgEarnings = kpis.avgEarnings;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welkom{client?.contact_name ? `, ${client.contact_name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Uw laadinfrastructuur in één oogopslag
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
            kpis.offlineCount === 0
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive"
          }`}>
            <span className={`w-2 h-2 rounded-full ${kpis.offlineCount === 0 ? "bg-primary" : "bg-destructive"} animate-pulse`} />
            {kpis.offlineCount === 0 ? "Alle systemen actief" : `${kpis.offlineCount} punt(en) offline`}
          </span>
        </div>
      </div>

      {/* Gauges — cockpit layout */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 py-4">
      {/* Left gauge — kWh */}
        <div className="order-2 md:order-1 flex items-center">
          <GaugeChart
            value={kwhValue}
            max={avgKwh * 2}
            average={avgKwh}
            averageLabel={`Gem: ${avgKwh.toLocaleString("nl-NL")} kWh`}
            label="Energie geladen"
            unit="kWh"
            size="sm"
            color="hsl(var(--primary))"
            formatValue={(v) => v.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}
          />
        </div>

        {/* Center gauge — Opbrengst (xl digital) */}
        <div className="order-1 md:order-2">
          <GaugeChart
            value={earningsValue}
            max={avgEarnings * 2}
            average={avgEarnings}
            averageLabel={`Gem: €${avgEarnings.toLocaleString("nl-NL")}`}
            label="Opbrengst deze maand"
            unit="EUR"
            size="xl"
            color="hsl(var(--primary))"
            formatValue={(v) => `€${v.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`}
          />
        </div>

        {/* Right gauge — Laadpunten online */}
        <div className="order-3 flex items-center">
          <GaugeChart
            value={kpis.chargePointsOnline}
            max={Math.max(kpis.chargePointsTotal, 1)}
            label="Laadpunten online"
            size="sm"
            color={kpis.offlineCount > 0 ? "hsl(var(--warning))" : "hsl(var(--primary))"}
            formatValue={(v) => `${v} / ${kpis.chargePointsTotal}`}
          />
        </div>
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card className="portal-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Opbrengst per maand</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradMarge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${v}`} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                  formatter={(value: number, name: string) => [
                    `€${value.toFixed(2)}`,
                    name === "marge" ? "Laadmarge" : "ERE-schatting",
                  ]}
                />
                <Area type="monotone" dataKey="marge" stackId="1" stroke="hsl(var(--primary))" fill="url(#gradMarge)" strokeWidth={2} />
                <Area type="monotone" dataKey="ere" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Locations */}
      {locations && locations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Locaties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {locations.map((loc: any) => {
              const cps = loc.charge_points || [];
              const online = cps.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
              return (
                <Link key={loc.id} to={`/portal/locatie/${loc.id}`}>
                  <Card className="portal-card hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <span className="font-medium text-foreground text-sm">{loc.name || loc.address}</span>
                            <p className="text-xs text-muted-foreground">{loc.address}, {loc.city}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {cps.map((cp: any, i: number) => (
                              <span
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  cp.status === "online" || cp.status === "in_use"
                                    ? "bg-primary"
                                    : "bg-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
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
            <h2 className="text-base font-semibold text-foreground">Recente sessies</h2>
            <Link to="/portal/sessies" className="text-xs text-primary font-medium hover:underline">
              Alle sessies →
            </Link>
          </div>
          <Card className="portal-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {recentSessions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {s.charge_points?.name || "Laadpunt"}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {s.started_at ? format(new Date(s.started_at), "d MMM, HH:mm", { locale: nl }) : "-"}
                          {s.duration_minutes ? ` · ${Math.floor(s.duration_minutes / 60)}u ${s.duration_minutes % 60}m` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-primary">
                        €{Number(s.client_share || 0).toFixed(2)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {Number(s.kwh_delivered || 0).toFixed(1)} kWh
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {(!recentSessions || recentSessions.length === 0) && !isLoading && (
        <Card className="portal-card">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Nog geen laaddata</h3>
            <p className="text-muted-foreground text-sm">Zodra uw laadpunten actief zijn, verschijnen hier uw opbrengsten.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
