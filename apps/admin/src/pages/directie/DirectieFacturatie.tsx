import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Receipt, CheckCircle2, Clock, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatEuro } from "@/services/calculations";
import { KpiTile } from "@/components/admin/KpiTile";
import { summarizeWefactInvoices } from "@/services/wefactBilling";
import { WefactInvoiceList, WefactStatusBadge, type WefactInvoiceRowData } from "@/components/admin/financial/WefactInvoiceList";
import { WefactRevenueChart } from "@/components/admin/financial/WefactRevenueChart";
import { useWefactMonthlyOverview } from "@/hooks/useAdminData";

const CURRENT_YEAR = new Date().getFullYear();

interface SettlementRow {
  id: string;
  invoice_number: string | null;
  year: number;
  month: number;
  client_payout: number | null;
  wefact_creditinvoice_code: string | null;
  wefact_status: string | null;
  wefact_paid_at: string | null;
  wefact_sync_error: string | null;
}

interface PurchaseRow {
  id: string;
  creditinvoice_code: string | null;
  invoice_code: string | null;
  creditor_name: string | null;
  status: string | null;
  amount_excl: number | null;
  amount_incl: number | null;
  invoice_date: string | null;
}

const STATUS_OPTIONS = ["alle", "verzonden", "betaald", "deels_betaald", "vervallen", "concept", "credit"];

export default function DirectieFacturatie() {
  const qc = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [search, setSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");

  const invoices = useQuery({
    queryKey: ["wefact-billing-invoices", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wefact_invoices")
        .select("id, wefact_invoice_id, invoice_code, debtor_name, kind, status, amount_incl, amount_paid, amount_outstanding, invoice_date, pay_before, client_id, payment_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((r) => {
        const d = r.invoice_date ?? r.created_at;
        return d ? new Date(d).getFullYear() === year : false;
      });
    },
  });

  const selfBilling = useQuery({
    queryKey: ["wefact-billing-selfbilling", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlements")
        .select("id, invoice_number, year, month, client_payout, wefact_creditinvoice_code, wefact_status, wefact_paid_at, wefact_sync_error")
        .eq("year", year)
        .not("wefact_creditinvoice_id", "is", null)
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SettlementRow[];
    },
  });

  // Gewone inkoopfacturen/bonnetjes uit WeFact (self-billing heeft zijn eigen tab).
  const purchases = useQuery({
    queryKey: ["wefact-billing-purchases", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wefact_purchase_invoices")
        .select("id, creditinvoice_code, invoice_code, creditor_name, status, amount_excl, amount_incl, invoice_date, created_at")
        .eq("is_self_billing", false)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as (PurchaseRow & { created_at: string })[]).filter((r) => {
        const d = r.invoice_date ?? r.created_at;
        return d ? new Date(d).getFullYear() === year : false;
      });
    },
  });

  const monthly = useWefactMonthlyOverview(year);

  const allRows = (invoices.data ?? []) as (WefactInvoiceRowData & { created_at: string })[];
  const summary = useMemo(() => summarizeWefactInvoices(allRows), [allRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (term && !`${r.invoice_code ?? ""} ${r.debtor_name ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allRows, statusFilter, search]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-status-sync");
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") toast.info("WeFact is nog niet geconfigureerd.");
      else toast.success("Bijgewerkt vanuit WeFact");
      qc.invalidateQueries({ queryKey: ["wefact-billing-invoices"] });
      qc.invalidateQueries({ queryKey: ["wefact-billing-selfbilling"] });
      qc.invalidateQueries({ queryKey: ["wefact-billing-purchases"] });
      qc.invalidateQueries({ queryKey: ["wefact-monthly-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verversen mislukt");
    } finally {
      setRefreshing(false);
    }
  };

  const markSelfBillingPaid = async (settlementId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action: "creditinvoice_markpaid", settlementId },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok") throw new Error(data?.message ?? "Mislukt");
      toast.success("Gemarkeerd als betaald in WeFact");
      qc.invalidateQueries({ queryKey: ["wefact-billing-selfbilling"] });
      qc.invalidateQueries({ queryKey: ["wefact-monthly-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Facturatie</h1>
          <p className="text-sm text-muted-foreground">Omzet, kosten en openstaande facturen via WeFact</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[3rem] text-center text-sm font-medium tabular-nums">{year}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => Math.min(CURRENT_YEAR, y + 1))} disabled={year >= CURRENT_YEAR}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Ververs vanuit WeFact
          </Button>
        </div>
      </div>

      {/* Facturatie-KPI's (incl. btw) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiTile label="Gefactureerd" value={formatEuro(summary.invoicedIncl)} subtitle={`${summary.count} facturen`} icon={<Receipt className="h-5 w-5" />} accent="blue" />
        <KpiTile label="Betaald" value={formatEuro(summary.paidIncl)} icon={<CheckCircle2 className="h-5 w-5" />} accent="green" />
        <KpiTile label="Openstaand" value={formatEuro(summary.outstandingIncl)} icon={<Clock className="h-5 w-5" />} accent="amber" />
        <KpiTile label="Vervallen" value={formatEuro(summary.overdueIncl)} icon={<AlertTriangle className="h-5 w-5" />} accent="red" />
      </div>

      {/* Omzet & kosten — strak jaaroverzicht met netto-trendlijn */}
      <WefactRevenueChart rows={monthly.data ?? []} year={year} />

      <Tabs defaultValue="verkoop">
        <TabsList>
          <TabsTrigger value="verkoop">Verkoopfacturen</TabsTrigger>
          <TabsTrigger value="inkoop">Inkoopfacturen</TabsTrigger>
          <TabsTrigger value="selfbilling">Self-billing</TabsTrigger>
        </TabsList>

        <TabsContent value="verkoop" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "alle" ? "Alle statussen" : s.replace("_", " ")}</option>)}
            </select>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek op nummer of debiteur" className="h-9 max-w-xs" />
          </div>
          <Card><CardContent className="p-3">
            {invoices.isLoading
              ? <p className="p-3 text-center text-sm text-muted-foreground">Laden…</p>
              : <WefactInvoiceList rows={filtered} showDebtor onChanged={() => qc.invalidateQueries({ queryKey: ["wefact-billing-invoices"] })} />}
          </CardContent></Card>
        </TabsContent>

        {/* Gewone WeFact-inkoop (leveranciers/bonnetjes) — read-only, beheer gebeurt in WeFact. */}
        <TabsContent value="inkoop" className="mt-4 space-y-3">
          <Input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} placeholder="Zoek op leverancier of kenmerk" className="h-9 max-w-xs" />
          <Card><CardContent className="p-0">
            {purchases.isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Laden…</p>
            ) : (() => {
              const term = purchaseSearch.trim().toLowerCase();
              const rows = (purchases.data ?? []).filter((r) =>
                !term || `${r.creditinvoice_code ?? ""} ${r.invoice_code ?? ""} ${r.creditor_name ?? ""}`.toLowerCase().includes(term));
              if (rows.length === 0) {
                return <p className="p-6 text-center text-sm text-muted-foreground">Geen inkoopfacturen in {year}. Facturen en bonnetjes die je in WeFact boekt verschijnen hier na de dagelijkse sync (of via "Ververs vanuit WeFact").</p>;
              }
              return (
                <div className="divide-y">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{r.creditor_name || "—"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{r.creditinvoice_code || r.invoice_code || "—"}</span>
                      <span className="text-[11px] text-muted-foreground">{r.invoice_date ? new Date(r.invoice_date).toLocaleDateString("nl-NL") : "—"}</span>
                      <span className="tabular-nums">{formatEuro(Number(r.amount_excl ?? 0))} <span className="text-[11px] text-muted-foreground">excl.</span></span>
                      <WefactStatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="selfbilling" className="mt-4">
          <Card><CardContent className="p-0">
            {selfBilling.isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Laden…</p>
            ) : (selfBilling.data ?? []).length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nog geen self-billing-inkoopfacturen in {year}.</p>
            ) : (
              <div className="divide-y">
                {(selfBilling.data ?? []).map((s) => {
                  const paid = s.wefact_status === "betaald";
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="font-mono text-[11px] text-muted-foreground">{s.invoice_number || s.wefact_creditinvoice_code || "—"}</span>
                      <span>{String(s.month).padStart(2, "0")}-{s.year}</span>
                      <span className="flex-1" />
                      <span className="tabular-nums">{formatEuro(Number(s.client_payout ?? 0))}</span>
                      {s.wefact_sync_error === "pdf_pending"
                        ? <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">PDF nog aanhangen</Badge>
                        : <WefactStatusBadge status={s.wefact_status === "open" ? "verzonden" : s.wefact_status} />}
                      {!paid && (
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => markSelfBillingPaid(s.id)}>Betaald</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
