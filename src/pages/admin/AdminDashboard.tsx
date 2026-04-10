import { useAdminKPIs, useAllClients, useAllChargePoints, useRecentActivity } from "@/hooks/useAdminData";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Users, Plug, TrendingUp, Zap, AlertTriangle, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

export default function AdminDashboard() {
  const kpis = useAdminKPIs();
  const { data: clients, isLoading: loadingClients } = useAllClients();
  const { data: chargePoints } = useAllChargePoints();
  const { data: activity } = useRecentActivity(8);

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const offlineCPs = chargePoints?.filter((cp: any) => cp.status === "offline" || cp.status === "error") || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* KPI Cards */}
      {loadingClients ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Actieve klanten"
            value={String(kpis.activeClients)}
            icon={<Users className="w-5 h-5" />}
          />
          <KPICard
            label="Laadpunten"
            value={`${kpis.onlineChargePoints}/${kpis.totalChargePoints}`}
            subtitle="online / totaal"
            icon={<Plug className="w-5 h-5" />}
            alert={kpis.offlineChargePoints > 0 ? `${kpis.offlineChargePoints} offline` : undefined}
          />
          <KPICard
            label="MRR E-Charging"
            value={fmt(kpis.mrr)}
            icon={<TrendingUp className="w-5 h-5" />}
            change={kpis.mrrChange}
          />
          <KPICard
            label="kWh deze maand"
            value={kpis.totalKwh.toLocaleString("nl-NL")}
            icon={<Zap className="w-5 h-5" />}
            change={kpis.kwhChange}
          />
        </div>
      )}

      {/* Alerts */}
      {offlineCPs.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
            <span className="text-sm font-medium">{offlineCPs.length} laadpunt(en) met storing</span>
            <Link to="/admin/laadpunten" className="text-sm text-primary hover:underline ml-auto">Bekijk →</Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Omzet laatste 6 maanden</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.monthlyData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `€${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(value: number) => [`€${value.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`, "Omzet"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recente activiteit
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity && activity.length > 0 ? (
              <div className="divide-y divide-border">
                {activity.map((a: any) => (
                  <div key={a.id} className="px-4 py-3">
                    <p className="text-sm font-medium">{a.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.clients?.company_name && `${a.clients.company_name} · `}
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: nl })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4">Geen recente activiteit</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Client table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Klanten</CardTitle>
            <Link to="/admin/klanten" className="text-sm text-primary hover:underline">Alle klanten →</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Locaties</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Laadpunten</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {clients?.slice(0, 10).map((c: any) => {
                  const locs = c.locations || [];
                  const cps = locs.flatMap((l: any) => l.charge_points || []);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer">
                      <td className="p-3">
                        <Link to={`/admin/klanten/${c.id}`} className="font-medium hover:text-primary">{c.company_name}</Link>
                      </td>
                      <td className="p-3 text-right">{locs.length}</td>
                      <td className="p-3 text-right">{cps.length}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          c.status === "actief" ? "bg-primary/10 text-primary" :
                          c.status === "offerte" ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>{c.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
