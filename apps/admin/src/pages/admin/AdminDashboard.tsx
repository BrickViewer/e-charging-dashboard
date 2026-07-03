import { useState } from "react";
import { useAdminKPIs, useAllChargePoints, useAllClients } from "@/hooks/useAdminData";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { Card, CardContent } from "@/components/ui/card";
import { KpiTile } from "@/components/admin/KpiTile";
import { Users, Plug, PlugZap, AlertTriangle } from "lucide-react";
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

export default function AdminDashboard() {
  const [chartYear, setChartYear] = useState<number | undefined>(undefined);
  const kpis = useAdminKPIs(chartYear);
  const { isLoading: loadingCps, isError: cpsError } = useAllChargePoints();
  const { data: clients, isLoading: loadingClients, isError: clientsError } =
    useAllClients();

  // De KPI-strip hangt op twee losse queries: laadpunten (useAllChargePoints) én klanten
  // (useAllClients). Faalt er één, dan tonen we een expliciete foutbanner i.p.v. stille
  // nullen; het laadskelet gate't op béide, zodat "Actieve klanten" niet kort 0 flitst.
  const hasError = cpsError || clientsError;
  const loading = loadingCps || loadingClients;

  // "Actieve klant" = klant met statuskolom 'actief' (lege/ontbrekende status telt óók als
  // 'actief'), identiek aan de Klanten-pagina, zodat beide schermen hetzelfde getal tonen
  // voor dezelfde metric. Totaal = alle niet-verwijderde klanten.
  const visibleClients = (clients ?? []).filter((c) => c.status !== "verwijderd");
  const activeClients = visibleClients.filter(
    (c) => (c.status || "actief") === "actief",
  ).length;
  const totalClients = visibleClients.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live status van het platform
        </p>
      </div>

      {/* KPI-strip — actieve klanten, laadpunten online, laadpunten offline */}
      {hasError ? (
        <Card className="border-destructive/25 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Platformgegevens konden niet worden geladen</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  De laadpunt- of klantgegevens zijn niet opgehaald. Vernieuw de pagina om
                  het opnieuw te proberen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <Card key={i} className="bg-card">
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
                value={String(activeClients)}
                subtitle={`van ${totalClients} totaal`}
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
      )}

      {/* E-Charging omzet per maand — 12 maanden */}
      <Card className="bg-card">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              E-Charging omzet
            </p>
            <PeriodStepper
              label={`Kalenderjaar ${kpis.selectedChartYear}`}
              index={Math.max(0, kpis.availableYears.indexOf(kpis.selectedChartYear))}
              count={kpis.availableYears.length}
              onIndexChange={(i) => setChartYear(kpis.availableYears[i])}
            />
          </div>
          <div className="h-[300px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
