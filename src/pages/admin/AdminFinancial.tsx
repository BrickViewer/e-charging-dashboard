import { useState, useMemo } from "react";
import { useAllSettlements } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp, Euro, Zap, Users } from "lucide-react";

export default function AdminFinancial() {
  const { data: settlements, isLoading } = useAllSettlements();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 20;

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Filter settlements
  const filtered = useMemo(() => {
    let result = settlements || [];
    if (statusFilter !== "all") result = result.filter((s: any) => s.status === statusFilter);
    if (search) result = result.filter((s: any) => s.clients?.company_name?.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [settlements, statusFilter, search]);

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // Aggregate monthly data for charts (last 12 months)
  const chartData = useMemo(() => {
    if (!settlements?.length) return [];
    const byMonth: Record<string, { month: string; gross: number; net: number; echarging: number; client: number; kwh: number; count: number }> = {};
    
    settlements.forEach((s: any) => {
      const key = s.month?.slice(0, 7);
      if (!key) return;
      if (!byMonth[key]) {
        const d = new Date(s.month);
        byMonth[key] = {
          month: d.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" }),
          gross: 0, net: 0, echarging: 0, client: 0, kwh: 0, count: 0,
        };
      }
      byMonth[key].gross += Number(s.gross_revenue || 0);
      byMonth[key].net += Number(s.net_margin || 0);
      byMonth[key].echarging += Number(s.echarging_revenue || 0);
      byMonth[key].client += Number(s.client_payout || 0);
      byMonth[key].kwh += Number(s.total_kwh || 0);
      byMonth[key].count += 1;
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v);
  }, [settlements]);

  // Totals
  const totals = useMemo(() => {
    const all = settlements || [];
    return {
      gross: all.reduce((s, r: any) => s + Number(r.gross_revenue || 0), 0),
      echarging: all.reduce((s, r: any) => s + Number(r.echarging_revenue || 0), 0),
      clientPayout: all.reduce((s, r: any) => s + Number(r.client_payout || 0), 0),
      kwh: all.reduce((s, r: any) => s + Number(r.total_kwh || 0), 0),
    };
  }, [settlements]);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Financieel overzicht</h1>

      {/* Summary KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Euro className="w-4 h-4" />Totale omzet</div>
              <p className="text-xl font-bold">{fmt(totals.gross)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><TrendingUp className="w-4 h-4" />E-Charging omzet</div>
              <p className="text-xl font-bold text-primary">{fmt(totals.echarging)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Users className="w-4 h-4" />Uitbetalingen klant</div>
              <p className="text-xl font-bold">{fmt(totals.clientPayout)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Zap className="w-4 h-4" />Totaal kWh</div>
              <p className="text-xl font-bold">{totals.kwh.toLocaleString("nl-NL")} kWh</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Omzet per maand</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `€${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => [fmt(v)]} />
                    <Legend />
                    <Bar dataKey="echarging" name="E-Charging" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="client" name="Klant" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">kWh verloop</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => [`${Number(v).toLocaleString("nl-NL")} kWh`]} />
                    <Line type="monotone" dataKey="kwh" name="kWh" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settlements table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Afrekeningen</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Zoek klant..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-48"
              />
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="calculated">Berekend</SelectItem>
                  <SelectItem value="approved">Goedgekeurd</SelectItem>
                  <SelectItem value="paid">Betaald</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Maand</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">kWh</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Bruto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">E-Charging</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Klant uitbet.</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(8)].map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Geen afrekeningen gevonden</td></tr>
                ) : (
                  paginated.map((s: any) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="p-3">{s.month ? format(new Date(s.month), "MMM yyyy", { locale: nl }) : "-"}</td>
                      <td className="p-3 font-medium">{s.clients?.company_name || "-"}</td>
                      <td className="p-3 text-right">{Number(s.total_kwh || 0).toLocaleString("nl-NL")}</td>
                      <td className="p-3 text-right">{fmt(Number(s.gross_revenue))}</td>
                      <td className="p-3 text-right">{fmt(Number(s.net_margin))}</td>
                      <td className="p-3 text-right font-medium text-primary">{fmt(Number(s.echarging_revenue))}</td>
                      <td className="p-3 text-right">{fmt(Number(s.client_payout))}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          s.status === "paid" ? "bg-primary/10 text-primary" :
                          s.status === "approved" ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>{s.status === "paid" ? "Betaald" : s.status === "approved" ? "Goedgekeurd" : "Berekend"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">{filtered.length} resultaten</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1 text-sm rounded-md hover:bg-accent disabled:opacity-50">Vorige</button>
                <span className="px-3 py-1 text-sm">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 text-sm rounded-md hover:bg-accent disabled:opacity-50">Volgende</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
