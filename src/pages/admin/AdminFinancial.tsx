import { useState, useMemo } from "react";
import { useAllSettlements } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { FinancialKPIs } from "@/components/admin/financial/FinancialKPIs";
import { FinancialCharts } from "@/components/admin/financial/FinancialCharts";
import { SettlementDetailRow } from "@/components/admin/financial/SettlementDetailRow";
import { ChevronDown, ChevronRight, CheckCircle, CreditCard } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createTransfer } from "@/services/stripe";
import { toast } from "sonner";

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodLabel = (year: number, quarter: number) => `Q${quarter} ${year}`;

export default function AdminFinancial() {
  const { data: settlements, isLoading } = useAllSettlements();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const perPage = 20;

  const uniquePeriods = useMemo(() => {
    if (!settlements?.length) return [];
    const periods = new Set<string>();
    settlements.forEach((s: any) => {
      if (s.year && s.quarter) periods.add(`${s.year}-${s.quarter}`);
    });
    return Array.from(periods).sort().reverse();
  }, [settlements]);

  const filtered = useMemo(() => {
    let result = settlements || [];
    if (statusFilter !== "all") result = result.filter((s: any) => s.status === statusFilter);
    if (periodFilter !== "all") {
      const [y, q] = periodFilter.split("-").map(Number);
      result = result.filter((s: any) => s.year === y && s.quarter === q);
    }
    if (search) result = result.filter((s: any) => s.clients?.company_name?.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [settlements, statusFilter, periodFilter, search]);

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const chartData = useMemo(() => {
    if (!settlements?.length) return [];
    const byPeriod: Record<string, { period: string; gross: number; net: number; echarging: number; client: number; kwh: number; count: number; sortKey: string }> = {};
    settlements.forEach((s: any) => {
      if (!s.year || !s.quarter) return;
      const key = `${s.year}-${s.quarter}`;
      if (!byPeriod[key]) {
        byPeriod[key] = {
          period: `Q${s.quarter} '${String(s.year).slice(2)}`,
          gross: 0, net: 0, echarging: 0, client: 0, kwh: 0, count: 0,
          sortKey: key,
        };
      }
      byPeriod[key].gross += Number(s.gross_revenue || 0);
      byPeriod[key].net += Number(s.net_margin || 0);
      byPeriod[key].echarging += Number(s.echarging_revenue || 0);
      byPeriod[key].client += Number(s.client_payout || 0);
      byPeriod[key].kwh += Number(s.total_kwh || 0);
      byPeriod[key].count += 1;
    });
    return Object.values(byPeriod)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-8)
      .map(({ sortKey, ...rest }) => rest);
  }, [settlements]);

  const totals = useMemo(() => {
    const all = settlements || [];
    return {
      gross: all.reduce((s, r: any) => s + Number(r.gross_revenue || 0), 0),
      echarging: all.reduce((s, r: any) => s + Number(r.echarging_revenue || 0), 0),
      clientPayout: all.reduce((s, r: any) => s + Number(r.client_payout || 0), 0),
      kwh: all.reduce((s, r: any) => s + Number(r.total_kwh || 0), 0),
    };
  }, [settlements]);

  const selectedItems = useMemo(() => (settlements || []).filter((s: any) => selected.has(s.id)), [settlements, selected]);
  const canApprove = selectedItems.filter((s: any) => s.status === "calculated");
  const canMarkPaid = selectedItems.filter((s: any) => s.status === "approved");

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((s: any) => s.id)));
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("quarterly_settlements")
        .update({ status: "approved" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${ids.length} afrekening(en) goedgekeurd`);
    },
    onError: () => toast.error("Goedkeuren mislukt"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const ids = items.map((s: any) => s.id);
      const { error } = await supabase
        .from("quarterly_settlements")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      for (const item of items) {
        await createTransfer({
          amount: Number(item.client_payout || 0),
          destinationAccountId: item.clients?.stripe_connected_account_id || "unknown",
          description: `Payout ${item.clients?.company_name} - ${periodLabel(item.year, item.quarter)}`,
        });
      }
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${items.length} afrekening(en) als betaald gemarkeerd`);
    },
    onError: () => toast.error("Markeren als betaald mislukt"),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Financieel overzicht</h1>

      <FinancialKPIs isLoading={isLoading} totals={totals} />
      <FinancialCharts chartData={chartData} />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">Kwartaalafrekeningen</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Zoek klant..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="w-48"
                />
                <Select value={periodFilter} onValueChange={v => { setPeriodFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle kwartalen</SelectItem>
                    {uniquePeriods.map(p => {
                      const [y, q] = p.split("-").map(Number);
                      return <SelectItem key={p} value={p}>{periodLabel(y, q)}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="calculated">Berekend</SelectItem>
                    <SelectItem value="approved">Goedgekeurd</SelectItem>
                    <SelectItem value="paid">Betaald</SelectItem>
                    <SelectItem value="overdue">Achterstallig</SelectItem>
                    <SelectItem value="charged_back">Geïncasseerd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2">
                <span className="text-sm font-medium">{selected.size} geselecteerd</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canApprove.length === 0 || approveMutation.isPending}
                  onClick={() => approveMutation.mutate(canApprove.map((s: any) => s.id))}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Goedkeuren ({canApprove.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canMarkPaid.length === 0 || markPaidMutation.isPending}
                  onClick={() => markPaidMutation.mutate(canMarkPaid)}
                >
                  <CreditCard className="w-4 h-4 mr-1" />
                  Betaald markeren ({canMarkPaid.length})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={paginated.length > 0 && selected.size === paginated.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="w-8 p-3" />
                  <th className="text-left p-3 font-medium text-muted-foreground">Kwartaal</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">kWh</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Bruto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">E-Charging</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Klant uitbet.</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(9)].map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Geen afrekeningen gevonden</td></tr>
                ) : (
                  paginated.map((s: any) => (
                    <>
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      >
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleSelect(s.id)}
                          />
                        </td>
                        <td className="p-3">
                          {expandedId === s.id
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </td>
                        <td className="p-3">{periodLabel(s.year, s.quarter)}</td>
                        <td className="p-3 font-medium">{s.clients?.company_name || "-"}</td>
                        <td className="p-3 text-right">{Number(s.total_kwh || 0).toLocaleString("nl-NL")}</td>
                        <td className="p-3 text-right">{fmt(Number(s.gross_revenue))}</td>
                        <td className="p-3 text-right font-medium text-primary">{fmt(Number(s.echarging_revenue))}</td>
                        <td className="p-3 text-right">{fmt(Number(s.client_payout))}</td>
                        <td className="p-3"><StatusBadge status={s.status || "calculated"} /></td>
                      </tr>
                      {expandedId === s.id && <SettlementDetailRow key={`detail-${s.id}`} settlement={s} />}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
