import { useAdminKPIs, useAllClients } from "@/hooks/useAdminData";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Users, Plug, TrendingUp, Zap, BarChart3, AlertTriangle } from "lucide-react";

export default function AdminDashboard() {
  const kpis = useAdminKPIs();
  const { data: clients } = useAllClients();

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0 })}`;

  const activeClients = clients?.filter(c => c.status === "actief") || [];
  const allCPs = clients?.flatMap(c => (c as any).locations?.flatMap((l: any) => l.charge_points || []) || []) || [];
  const offlineCPs = allCPs.filter((cp: any) => cp.status === "offline" || cp.status === "error");

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Actieve klanten" value={String(kpis.activeClients)} icon={<Users className="w-5 h-5" />} />
        <KPICard label="Laadpunten" value={String(kpis.totalChargePoints)} icon={<Plug className="w-5 h-5" />} />
        <KPICard label="MRR E-Charging" value={fmt(kpis.mrr)} icon={<TrendingUp className="w-5 h-5" />} />
        <KPICard label="kWh deze maand" value={kpis.totalKwh.toLocaleString("nl-NL")} icon={<Zap className="w-5 h-5" />} />
        <KPICard label="Gem. marge/klant" value={fmt(kpis.avgMargin)} icon={<BarChart3 className="w-5 h-5" />} />
      </div>

      {/* Alerts */}
      {offlineCPs.length > 0 && (
        <Card className="border-warning/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <span className="text-sm">{offlineCPs.length} laadpunt(en) met storing</span>
            <Link to="/admin/laadpunten" className="text-sm text-primary hover:underline ml-auto">Bekijk →</Link>
          </CardContent>
        </Card>
      )}

      {/* Client table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Klanten</CardTitle>
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
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="p-3 font-medium">{c.company_name}</td>
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
