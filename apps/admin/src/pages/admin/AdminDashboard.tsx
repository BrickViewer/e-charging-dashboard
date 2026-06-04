import { useState } from "react";
import { useAdminKPIs, useAllChargePoints } from "@/hooks/useAdminData";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Plug, PlugZap } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

function KpiTile({
  label,
  value,
  subtitle,
  icon,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "primary" | "amber" | "blue" | "red" | "muted";
}) {
  const accentBg = {
    primary: "bg-primary/10 border-primary/20 text-primary",
    amber: "bg-amber-400/10 border-amber-400/20 text-amber-400",
    blue: "bg-blue-400/10 border-blue-400/20 text-blue-400",
    red: "bg-destructive/10 border-destructive/20 text-destructive",
    muted: "bg-muted/30 border-border text-muted-foreground",
  }[accent ?? "muted"];

  return (
    <Card className="portal-card relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${accentBg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="cockpit-section-label">{label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1.5 leading-none">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [chartYear, setChartYear] = useState<number | undefined>(undefined);
  const kpis = useAdminKPIs(chartYear);
  const { isLoading: loadingCps } = useAllChargePoints();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live status van het platform
        </p>
      </div>

      {/* KPI-strip — actieve klanten, laadpunten online, laadpunten offline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {loadingCps ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="portal-card">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiTile
              label="Actieve klanten"
              value={String(kpis.activeClients)}
              subtitle={`van ${kpis.totalClients} totaal`}
              icon={<Users className="w-4 h-4" />}
              accent="primary"
            />
            <KpiTile
              label="Laadpunten online"
              value={String(kpis.onlineChargePoints)}
              subtitle={`van ${kpis.linkedChargePoints} op klant-locaties`}
              icon={<PlugZap className="w-4 h-4" />}
              accent="primary"
            />
            <KpiTile
              label="Laadpunten offline"
              value={String(kpis.offlineChargePoints)}
              subtitle={kpis.offlineChargePoints > 0 ? "Vereist aandacht" : "Alles online"}
              icon={<Plug className="w-4 h-4" />}
              accent={kpis.offlineChargePoints > 0 ? "red" : "muted"}
            />
          </>
        )}
      </div>

      {/* E-Charging omzet per maand — 12 maanden */}
      <Card className="portal-card">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="cockpit-section-label">E-Charging omzet</p>
            <PeriodStepper
              label={`Kalenderjaar ${kpis.selectedChartYear}`}
              index={Math.max(0, kpis.availableYears.indexOf(kpis.selectedChartYear))}
              count={kpis.availableYears.length}
              onIndexChange={(i) => setChartYear(kpis.availableYears[i])}
            />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.monthlyData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                  width={72}
                  tickFormatter={(v) =>
                    `€${Number(v).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent) / 0.5)" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [
                    `€${value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    "Omzet",
                  ]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
