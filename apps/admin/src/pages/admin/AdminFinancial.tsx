import { useState, useMemo, useEffect, Fragment } from "react";
import { useAllSettlements } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { FinancialCharts } from "@/components/admin/financial/FinancialCharts";
import { SettlementDetailRow } from "@/components/admin/financial/SettlementDetailRow";
import {
  ChevronDown, ChevronRight, CheckCircle, RefreshCw, Loader2, RotateCcw,
  Search, Wallet, Hourglass, Banknote, AlertCircle, ArrowRight, Landmark, FileText, Download,
} from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { settlementVat } from "@/services/calculations";
import { approveSettlement, unapproveSettlement, markSettlementEfluxReimbursed, markSettlementPaid, markSettlementInvoiceSent, markSettlementInvoicePaid } from "@/services/settlements";
import type { AdminSettlement } from "@/types/db";
import { getCurrentMonth, monthFullLabel, monthShortLabel } from "@/lib/period";
import { PeriodStepper } from "@/components/portal/PeriodStepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CashKpi } from "@/components/admin/financial/CashKpi";
import { ReconciliationOverview } from "@/components/admin/financial/ReconciliationOverview";
import { EfluxInvoicesTab } from "@/components/admin/financial/EfluxInvoicesTab";

type RecomputeBody = { year?: number; month?: number };
type RecomputeResult = { computed?: number; skipped?: number; errors?: number };
type PaymentPipelineSummary = {
  calculated: { count: number; amount: number };
  bankReady: { count: number; amount: number };
  invoiceToSend: { count: number; amount: number };
  invoiceOpen: { count: number; amount: number };
  processed: { count: number; amount: number; echarging: number };
  processedThisMonth: { count: number; amount: number };
};

const fmt = (v: number) =>
  `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodLabel = monthFullLabel;
// Klant-cashflow = netto uitbetaling aan klant (excl. BTW). Energie loopt niet meer via ons.
const customerCashflow = (settlement: AdminSettlement) => Number(settlement.client_payout || 0);
// BTW-snapshot per afrekening → netto / BTW / incl. Incl = het bedrag dat E-Charging
// daadwerkelijk overboekt (BTW-plichtige klant) of de klant betaalt (negatieve factuur).
const vatInfo = (s: AdminSettlement) =>
  settlementVat({ clientPayout: Number(s.client_payout || 0), vatRate: Number(s.vat_rate ?? 0.21) });
const inclAmount = (s: AdminSettlement) => vatInfo(s).inclVat;          // incl. BTW (getekend)
const inclAbs = (s: AdminSettlement) => Math.abs(inclAmount(s));

function SettlementsTab({ initialPeriod = "all" }: { initialPeriod?: string }) {
  const { data: settlements, isLoading } = useAllSettlements();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>(initialPeriod);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [payTarget, setPayTarget] = useState<AdminSettlement[] | null>(null);
  const [unapproveTarget, setUnapproveTarget] = useState<AdminSettlement | null>(null);
  const [trendYear, setTrendYear] = useState<number | undefined>(undefined);
  const selectedTrendYear = trendYear ?? getCurrentMonth().year;
  const perPage = 20;

  // Maandfilter vanuit het Maandoverzicht (deeplink ?maand=YYYY-MM).
  useEffect(() => { setPeriodFilter(initialPeriod); setPage(0); }, [initialPeriod]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      let body: RecomputeBody = {};
      if (periodFilter !== "all") {
        const [y, mo] = periodFilter.split("-").map(Number);
        body = { year: y, month: mo };
      }
      const { data, error } = await supabase.functions.invoke("aggregate-settlements", { body });
      if (error) throw error;
      const results = (data?.results ?? []) as RecomputeResult[];
      const totals = results.reduce(
        (acc, r) => ({
          computed: acc.computed + (r.computed || 0),
          skipped: acc.skipped + (r.skipped || 0),
          errors: acc.errors + (r.errors || 0),
        }),
        { computed: 0, skipped: 0, errors: 0 },
      );
      if (totals.errors > 0) {
        toast.warning(
          `${totals.computed} herberekend, ${totals.skipped} overgeslagen, ${totals.errors} fouten`,
        );
      } else {
        toast.success(
          `${totals.computed} afrekening(en) herberekend, ${totals.skipped} overgeslagen (al goedgekeurd/betaald)`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error("Herberekenen mislukt: " + (err.message || "Onbekende fout"));
    } finally {
      setRecomputing(false);
    }
  };

  // CSV-export voor de boekhouding: factuurnr, klant, KVK/BTW, netto/BTW/incl, status, IBAN.
  const exportCSV = async () => {
    if (filtered.length === 0) { toast.info("Geen afrekeningen om te exporteren"); return; }
    const clientIds = Array.from(new Set(filtered.map((s) => s.client_id).filter(Boolean))) as string[];
    const ibanByClient = new Map<string, { iban: string | null; holder: string | null }>();
    if (clientIds.length > 0) {
      const { data: pd } = await supabase
        .from("client_payment_details")
        .select("client_id, payout_iban, payout_account_holder_name")
        .in("client_id", clientIds);
      for (const d of (pd ?? []) as Array<{ client_id: string; payout_iban: string | null; payout_account_holder_name: string | null }>) {
        ibanByClient.set(d.client_id, { iban: d.payout_iban, holder: d.payout_account_holder_name });
      }
    }
    const esc = (v: string | number | null | undefined) => {
      const str = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const num = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
    const headers = ["Factuurnummer", "Periode", "Klantnr", "Klant", "KVK", "BTW-nummer", "kWh", "Netto (excl BTW)", "BTW%", "BTW-bedrag", "Incl BTW", "Status", "Uitbetaald op", "IBAN", "Rekeninghouder"];
    const tot = { net: 0, vat: 0, incl: 0, kwh: 0 };
    const rows = filtered.map((s) => {
      const v = vatInfo(s);
      const pd = s.client_id ? ibanByClient.get(s.client_id) : undefined;
      tot.net += v.net; tot.vat += v.vatAmount; tot.incl += v.inclVat; tot.kwh += Number(s.total_kwh || 0);
      return [
        // Opgeslagen doorlopend nummer (toegekend bij goedkeuring); leeg = nog niet uitgereikt
        s.invoice_number ?? "",
        periodLabel(s.year, s.month),
        s.clients?.client_number ?? "",
        s.clients?.company_name ?? "",
        s.clients?.kvk ?? "",
        s.clients?.btw_number ?? "",
        num(Number(s.total_kwh || 0), 3),
        num(v.net),
        `${(v.vatRate * 100).toFixed(0)}%`,
        num(v.vatAmount),
        num(v.inclVat),
        s.status,
        s.paid_at ? new Date(s.paid_at).toLocaleDateString("nl-NL") : "",
        pd?.iban ?? "",
        pd?.holder ?? "",
      ].map(esc).join(";");
    });
    const totalRow = ["", "", "", `TOTAAL (${filtered.length})`, "", "", num(tot.kwh, 3), num(tot.net), "", num(tot.vat), num(tot.incl), "", "", "", ""].map(esc).join(";");
    const csv = [headers.map(esc).join(";"), ...rows, totalRow].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echarging-afrekeningen-${periodFilter === "all" ? "alle-maanden" : periodFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniquePeriods = useMemo(() => {
    if (!settlements?.length) return [];
    const periods = new Set<string>();
    settlements.forEach((s) => {
      if (s.year && s.month) periods.add(`${s.year}-${String(s.month).padStart(2, "0")}`);
    });
    return Array.from(periods).sort().reverse();
  }, [settlements]);

  const filtered = useMemo(() => {
    let result = (settlements || []) as AdminSettlement[];
    if (statusFilter !== "all") result = result.filter((s) => s.status === statusFilter);
    if (periodFilter !== "all") {
      const [y, mo] = periodFilter.split("-").map(Number);
      result = result.filter((s) => s.year === y && s.month === mo);
    }
    if (search)
      result = result.filter((s) =>
        s.clients?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        `#${s.clients?.client_number ?? ""}`.includes(search.toLowerCase()) ||
        String(s.clients?.client_number ?? "").includes(search.toLowerCase()),
      );
    return result;
  }, [settlements, statusFilter, periodFilter, search]);

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // Totalen over de hele (gefilterde) selectie — netto / BTW / incl voor de boekhouding.
  const filteredTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, s) => {
          const v = vatInfo(s);
          return { net: acc.net + v.net, vat: acc.vat + v.vatAmount, incl: acc.incl + v.inclVat };
        },
        { net: 0, vat: 0, incl: 0 },
      ),
    [filtered],
  );

  // Jaren met data (∪ huidig jaar) voor de trend-navigatie.
  const trendYears = useMemo(() => {
    const ys = new Set<number>(((settlements ?? []) as AdminSettlement[]).map((s) => s.year).filter(Boolean));
    ys.add(getCurrentMonth().year);
    return Array.from(ys).sort((a, b) => a - b);
  }, [settlements]);

  // Trend van het GEKOZEN jaar (jan -> dec). Geen vaste 8-maanden-cap meer, zodat
  // historische jaren volledig opvraagbaar blijven (future-proof, schaalt mee).
  const chartData = useMemo(() => {
    if (!settlements?.length) return [];
    const rows = (settlements as AdminSettlement[]).filter((s) => s.year === selectedTrendYear);
    const out: { period: string; gross: number; net: number; echarging: number; client: number; kwh: number; count: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const ms = rows.filter((s) => s.month === m);
      out.push({
        period: monthShortLabel(selectedTrendYear, m),
        gross: ms.reduce((a, s) => a + Number(s.gross_revenue || 0), 0),
        net: ms.reduce((a, s) => a + Number(s.client_payout || 0), 0),
        echarging: ms.reduce((a, s) => a + Number(s.echarging_revenue || 0), 0),
        client: ms.reduce((a, s) => a + customerCashflow(s), 0),
        kwh: ms.reduce((a, s) => a + Number(s.total_kwh || 0), 0),
        count: ms.length,
      });
    }
    return out;
  }, [settlements, selectedTrendYear]);

  // Pipeline KPIs — gericht op bankbetaling en factuurflow
  const pipeline = useMemo(() => {
    const all = (settlements || []) as AdminSettlement[];
    const cur = getCurrentMonth();
    const monthStart = new Date(Date.UTC(cur.year, cur.month - 1, 1));

    const calculated = all.filter((s) => s.status === "calculated");
    const bankReady = all.filter((s) => s.status === "approved" && customerCashflow(s) >= 0);
    const invoiceToSend = all.filter((s) => s.status === "approved" && customerCashflow(s) < 0);
    const invoiceOpen = all.filter((s) => s.status === "invoice_sent");
    const processed = all.filter((s) => s.status === "paid" || s.status === "invoice_paid");

    // Bedragen in incl-BTW: dit is wat er daadwerkelijk wordt overgeboekt/gefactureerd.
    const sumIncl = (xs: AdminSettlement[]) => xs.reduce((a, s) => a + inclAmount(s), 0);
    const sumInclAbs = (xs: AdminSettlement[]) => xs.reduce((a, s) => a + inclAbs(s), 0);

    const processedThisMonth = processed.filter(
      (s) => s.paid_at && new Date(s.paid_at) >= monthStart,
    );

    return {
      calculated: { count: calculated.length, amount: sumIncl(calculated) },
      bankReady: { count: bankReady.length, amount: sumIncl(bankReady) },
      invoiceToSend: { count: invoiceToSend.length, amount: sumInclAbs(invoiceToSend) },
      invoiceOpen: { count: invoiceOpen.length, amount: sumInclAbs(invoiceOpen) },
      processed: {
        count: processed.length,
        amount: sumInclAbs(processed),
        echarging: processed.reduce((a, s) => a + Number(s.echarging_revenue || 0), 0),
      },
      processedThisMonth: { count: processedThisMonth.length, amount: sumInclAbs(processedThisMonth) },
    };
  }, [settlements]);

  const selectedItems = useMemo(
    () => ((settlements || []) as AdminSettlement[]).filter((s) => selected.has(s.id)),
    [settlements, selected],
  );
  const canApprove = selectedItems.filter((s) => s.status === "calculated");
  // Klant uitbetalen mag zodra goedgekeurd; de e-Flux-ontvangst wordt bij het betalen
  // in één keer vastgelegd (attestatie in de bevestiging), niet per klant.
  const canBankPay = selectedItems.filter((s) => s.status === "approved" && customerCashflow(s) >= 0);
  const canSendInvoice = selectedItems.filter((s) => s.status === "approved" && customerCashflow(s) < 0);
  const canMarkInvoicePaid = selectedItems.filter((s) => s.status === "invoice_sent");
  const payTotalIncl = (payTarget ?? []).reduce((a, s) => a + inclAbs(s), 0);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((s) => s.id)));
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await approveSettlement(ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${ids.length} afrekening(en) goedgekeurd`);
    },
    // De RPC blokkeert met een NL-melding die exact opsomt welke factuurgegevens
    // ontbreken (Wet OB-validatie) — die melding moet de admin bereiken.
    onError: (err: Error) => toast.error(err.message || "Goedkeuren mislukt", { duration: 12000 }),
  });

  // Goedkeuring terugdraaien (approved → calculated). Kan zolang er geen
  // geldstroom is gestart — de RPC dwingt dat server-side af.
  const unapproveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await unapproveSettlement(id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements"] });
      toast.success("Goedkeuring teruggedraaid — afrekening staat weer op 'berekend'");
    },
    onError: (err: Error) => toast.error(err.message || "Terugdraaien mislukt"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (items: AdminSettlement[]) => {
      const ids = items.map((s) => s.id);
      // e-Flux betaalt 1×/maand; we leggen de ontvangst vast op het moment van uitbetalen
      // (attestatie in de bevestiging), zodat dit niet per klant hoeft. mark_settlements_paid
      // vereist eflux_reimbursed_at, dus zet die eerst voor wie 'm nog mist.
      const needEflux = items.filter((s) => !s.eflux_reimbursed_at).map((s) => s.id);
      if (needEflux.length > 0) {
        const { error: efErr } = await markSettlementEfluxReimbursed(needEflux);
        if (efErr) throw efErr;
      }
      const { error } = await markSettlementPaid(ids);
      if (error) throw error;
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${items.length} afrekening(en) gemarkeerd als betaald`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Betaling markeren mislukt"),
  });

  const markInvoiceSentMutation = useMutation({
    mutationFn: async (items: AdminSettlement[]) => {
      const ids = items.map((s) => s.id);
      const { error } = await markSettlementInvoiceSent(ids);
      if (error) throw error;
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${items.length} factuurstatus(sen) gemarkeerd als verzonden`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Factuurstatus bijwerken mislukt"),
  });

  const markInvoicePaidMutation = useMutation({
    mutationFn: async (items: AdminSettlement[]) => {
      const ids = items.map((s) => s.id);
      const { error } = await markSettlementInvoicePaid(ids);
      if (error) throw error;
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      setSelected(new Set());
      toast.success(`${items.length} factuurstatus(sen) gemarkeerd als voldaan`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Factuurstatus bijwerken mislukt"),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Financieel - cashflow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Maandafrekeningen, factuurflow en uitbetalingen
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void exportCSV(); }}
          className="portal-card"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRecompute}
          disabled={recomputing}
          className="text-muted-foreground hover:text-foreground"
          title="Her-aggregeert de maandcijfers uit de laadsessies. Gebeurt normaal automatisch via de sync; gebruik dit alleen om een (historische) maand geforceerd bij te werken."
        >
          {recomputing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {periodFilter === "all"
            ? "Herbereken"
            : (() => {
                const [y, mo] = periodFilter.split("-").map(Number);
                return `Herbereken ${periodLabel(y, mo)}`;
              })()}
        </Button>
        </div>
      </div>

      {/* Hero KPI strip — cash flow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CashKpi
          label="Te betalen via bank"
          value={fmt(pipeline.bankReady.amount)}
          subtitle={
            pipeline.bankReady.count > 0
              ? `${pipeline.bankReady.count} goedgekeurd, klaar voor bankbetaling`
              : "Geen openstaande betalingen"
          }
          icon={<Wallet className="w-4 h-4" />}
          accent={pipeline.bankReady.count > 0 ? "primary" : "muted"}
        />
        <CashKpi
          label="Factuur te sturen"
          value={fmt(pipeline.invoiceToSend.amount)}
          subtitle={
            pipeline.invoiceToSend.count > 0
              ? `${pipeline.invoiceToSend.count} negatieve afrekening(en)`
              : "Geen facturen te sturen"
          }
          icon={<FileText className="w-4 h-4" />}
          accent={pipeline.invoiceToSend.count > 0 ? "amber" : "muted"}
        />
        <CashKpi
          label="Factuur open"
          value={fmt(pipeline.invoiceOpen.amount)}
          subtitle={`${pipeline.invoiceOpen.count} factuur/facturen open`}
          icon={<Hourglass className="w-4 h-4" />}
          accent={pipeline.invoiceOpen.count > 0 ? "amber" : "muted"}
        />
        <CashKpi
          label="Verwerkt deze maand"
          value={fmt(pipeline.processedThisMonth.amount)}
          subtitle={`${pipeline.processedThisMonth.count} betalingen/facturen`}
          icon={<Banknote className="w-4 h-4" />}
        />
      </div>

      {/* Betalingsverwerking — volle breedte */}
      <PaymentPipeline pipeline={pipeline} />

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="cockpit-section-label">Trend · {selectedTrendYear}</h2>
            <PeriodStepper
              label={String(selectedTrendYear)}
              index={Math.max(0, trendYears.indexOf(selectedTrendYear))}
              count={trendYears.length}
              onIndexChange={(i) => setTrendYear(trendYears[i])}
            />
          </div>
          <FinancialCharts chartData={chartData} />
        </div>
      )}

      {/* Settlement table */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 p-4 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Maandafrekeningen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filtered.length} resultaten, sorteer en filter om bulk-acties uit te voeren
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoek klant…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    className="w-48 pl-9 portal-card"
                  />
                </div>
                <Select value={periodFilter} onValueChange={v => { setPeriodFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-40 portal-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle maanden</SelectItem>
                    {uniquePeriods.map(p => {
                      const [y, mo] = p.split("-").map(Number);
                      return <SelectItem key={p} value={p}>{periodLabel(y, mo)}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-40 portal-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="calculated">Berekend</SelectItem>
                    <SelectItem value="approved">Goedgekeurd</SelectItem>
                    <SelectItem value="paid">Betaald</SelectItem>
                    <SelectItem value="invoice_sent">Factuur open</SelectItem>
                    <SelectItem value="invoice_paid">Factuur voldaan</SelectItem>
                    <SelectItem value="charged_back">Legacy incasso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
                <span className="text-sm font-medium">{selected.size} geselecteerd</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canApprove.length === 0 || approveMutation.isPending}
                  onClick={() => approveMutation.mutate(canApprove.map((s) => s.id))}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Goedkeuren ({canApprove.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canBankPay.length === 0 || markPaidMutation.isPending}
                  onClick={() => setPayTarget(canBankPay)}
                >
                  <Landmark className="w-4 h-4 mr-1" />
                  Markeer betaald ({canBankPay.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canSendInvoice.length === 0 || markInvoiceSentMutation.isPending}
                  onClick={() => markInvoiceSentMutation.mutate(canSendInvoice)}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Factuur verstuurd ({canSendInvoice.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={canMarkInvoicePaid.length === 0 || markInvoicePaidMutation.isPending}
                  onClick={() => markInvoicePaidMutation.mutate(canMarkInvoicePaid)}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Factuur voldaan ({canMarkInvoicePaid.length})
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={paginated.length > 0 && selected.size === paginated.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="w-8 p-3" />
                  <th className="text-left p-3 cockpit-section-label">Maand</th>
                  <th className="text-left p-3 cockpit-section-label">Klant</th>
                  <th className="text-right p-3 cockpit-section-label">kWh</th>
                  <th className="text-right p-3 cockpit-section-label">Netto</th>
                  <th className="text-right p-3 cockpit-section-label">BTW</th>
                  <th className="text-right p-3 cockpit-section-label">Incl. (overboeken)</th>
                  <th className="text-left p-3 cockpit-section-label">Status</th>
                  <th className="text-right p-3 cockpit-section-label">Actie</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(9)].map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-muted-foreground">
                      <Wallet className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-medium text-foreground mb-1">Geen afrekeningen</p>
                      <p className="text-sm">
                        {settlements && settlements.length === 0
                          ? "De sync genereert de maandafrekeningen automatisch; gebruik anders \"Herbereken\""
                          : "Geen resultaten voor deze filters"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((s) => (
                    <Fragment key={s.id}>
                      <tr
                        className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      >
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleSelect(s.id)}
                          />
                        </td>
                        <td className="p-3">
                          {expandedId === s.id ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-3 tabular-nums">{periodLabel(s.year, s.month)}</td>
                        <td className="p-3 font-medium">
                          {s.clients?.company_name ? (
                            <>
                              {s.clients.client_number && (
                                <span className="mr-2 text-xs font-semibold tabular-nums text-primary">
                                  #{s.clients.client_number}
                                </span>
                              )}
                              {s.clients.company_name}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {Number(s.total_kwh || 0).toLocaleString("nl-NL")}
                        </td>
                        <td className="p-3 text-right tabular-nums">{fmt(vatInfo(s).net)}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{fmt(vatInfo(s).vatAmount)}</td>
                        <td className="p-3 text-right tabular-nums font-semibold">{fmt(inclAmount(s))}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5">
                            <SettlementStatusBadge settlement={s} />
                            {s.fee_waived && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25"
                                title="Service-fee voor deze maand kwijtgescholden"
                              >
                                fee 0
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <RowAction
                            settlement={s}
                            pending={
                              approveMutation.isPending || markPaidMutation.isPending ||
                              markInvoiceSentMutation.isPending || markInvoicePaidMutation.isPending ||
                              unapproveMutation.isPending
                            }
                            onApprove={() => approveMutation.mutate([s.id])}
                            onPay={() => setPayTarget([s])}
                            onSendInvoice={() => markInvoiceSentMutation.mutate([s])}
                            onInvoicePaid={() => markInvoicePaidMutation.mutate([s])}
                            onUnapprove={() => setUnapproveTarget(s)}
                          />
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <SettlementDetailRow settlement={s} />
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td colSpan={5} className="p-3 text-right text-muted-foreground">
                      Totaal ({filtered.length})
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmt(filteredTotals.net)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{fmt(filteredTotals.vat)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(filteredTotals.incl)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Pagina {page + 1} van {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  Vorige
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Volgende
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bevestiging vóór een bulk-bankbetaling (veel geld → bewust afvinken). */}
      <AlertDialog open={payTarget !== null} onOpenChange={(o) => { if (!o) setPayTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Markeren als betaald?</AlertDialogTitle>
            <AlertDialogDescription>
              Je betaalt <strong>{payTarget?.length ?? 0} afrekening(en)</strong> uit, totaal{" "}
              <strong>{fmt(payTotalIncl)}</strong> (incl. BTW). Bevestig dat <strong>e-Flux ons voor
              deze periode heeft betaald</strong> en dat je de bedragen naar de klanten hebt overgeboekt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markPaidMutation.isPending}>Annuleren</AlertDialogCancel>
            <Button
              disabled={markPaidMutation.isPending}
              onClick={() => { if (payTarget) markPaidMutation.mutate(payTarget); setPayTarget(null); }}
            >
              {markPaidMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Bevestig betaling
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bevestiging: goedkeuring terugdraaien */}
      <AlertDialog open={unapproveTarget !== null} onOpenChange={(o) => { if (!o) setUnapproveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Goedkeuring terugdraaien?</AlertDialogTitle>
            <AlertDialogDescription>
              De afrekening{" "}
              <strong>
                {unapproveTarget ? periodLabel(unapproveTarget.year, unapproveTarget.month) : ""}
                {unapproveTarget?.clients?.company_name ? ` van ${unapproveTarget.clients.company_name}` : ""}
              </strong>{" "}
              gaat terug naar status <strong>berekend</strong>. Daarna kun je bijvoorbeeld de service-fee
              kwijtschelden of de cijfers laten herberekenen, en opnieuw goedkeuren. De afrekening is in de
              tussentijd niet zichtbaar voor de klant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unapproveMutation.isPending}>Annuleren</AlertDialogCancel>
            <Button
              disabled={unapproveMutation.isPending}
              onClick={() => { if (unapproveTarget) unapproveMutation.mutate(unapproveTarget.id); setUnapproveTarget(null); }}
            >
              {unapproveMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Terugdraaien
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Financieel-module: tabbladen. Maandoverzicht (reconciliatie) + eFlux-facturen zijn admin-only;
// niet-admins (manager/viewer) zien alleen de Afrekeningen die ze al konden zien.
export default function AdminFinancial() {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "superadmin";
  const [params, setParams] = useSearchParams();
  const maand = params.get("maand") ?? "all";
  const tab = params.get("tab") ?? (isAdmin ? "overzicht" : "afrekeningen");

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    if (v !== "afrekeningen") next.delete("maand");
    setParams(next, { replace: true });
  };
  const openMonth = (ym: string) => setParams({ tab: "afrekeningen", maand: ym });

  if (!isAdmin) {
    return (
      <div className="space-y-5 animate-fade-in">
        <SettlementsTab initialPeriod="all" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overzicht">Maandoverzicht</TabsTrigger>
          <TabsTrigger value="afrekeningen">Afrekeningen</TabsTrigger>
          <TabsTrigger value="facturen">eFlux-facturen</TabsTrigger>
        </TabsList>
        <TabsContent value="overzicht" className="mt-5">
          <ReconciliationOverview onOpenMonth={openMonth} />
        </TabsContent>
        <TabsContent value="afrekeningen" className="mt-5">
          <SettlementsTab initialPeriod={maand} />
        </TabsContent>
        <TabsContent value="facturen" className="mt-5">
          <EfluxInvoicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ──────────────────────────────────────────── helpers ─── */
// CashKpi staat nu in components/admin/financial/CashKpi.tsx (gedeeld met het maandoverzicht).

function PaymentPipeline({ pipeline }: { pipeline: PaymentPipelineSummary }) {
  const totalCount =
    pipeline.calculated.count + pipeline.bankReady.count + pipeline.invoiceOpen.count + pipeline.processed.count;

  const stages = [
    {
      key: "calculated",
      label: "Berekend",
      count: pipeline.calculated.count,
      amount: pipeline.calculated.amount,
      color: "bg-muted-foreground",
      tone: "text-foreground/80",
    },
    {
      key: "bankReady",
      label: "Bank klaar",
      count: pipeline.bankReady.count,
      amount: pipeline.bankReady.amount,
      color: "bg-[hsl(var(--status-amber))]",
      tone: "text-[hsl(var(--status-amber))]",
    },
    {
      key: "invoiceOpen",
      label: "Factuur open",
      count: pipeline.invoiceOpen.count,
      amount: pipeline.invoiceOpen.amount,
      color: "bg-[hsl(var(--status-blue))]",
      tone: "text-[hsl(var(--status-blue))]",
    },
    {
      key: "processed",
      label: "Verwerkt",
      count: pipeline.processed.count,
      amount: pipeline.processed.amount,
      color: "bg-primary",
      tone: "text-primary",
    },
  ];

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] flex items-center justify-center">
              <Hourglass className="w-4 h-4 text-[hsl(var(--status-amber))]" />
            </div>
            <div>
              <p className="cockpit-section-label">Betalingsverwerking</p>
              <p className="text-base font-semibold mt-0.5 leading-none">
                {totalCount} afrekeningen totaal
              </p>
            </div>
          </div>
          {pipeline.invoiceToSend.count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-red)/0.15)] text-[hsl(var(--status-red))] border border-[hsl(var(--status-red)/0.25)]">
              <AlertCircle className="w-3 h-3" />
              {pipeline.invoiceToSend.count} factuur te sturen
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {stages.map((stage, i) => {
            const pct = totalCount > 0 ? (stage.count / totalCount) * 100 : 0;
            return (
              <div key={stage.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-foreground ${stage.tone}`}>{stage.label}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="text-muted-foreground tabular-nums">{stage.count}</span>
                  </div>
                  <span className="tabular-nums text-foreground">{fmt(stage.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={`h-full ${stage.color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {i < stages.length - 1 && (
                  <div className="flex justify-center mt-1.5">
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
          <span className="text-muted-foreground">Te betalen via bank</span>
          <span className="text-primary tabular-nums font-medium">
            {fmt(pipeline.bankReady.amount)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SettlementStatusBadge({ settlement }: { settlement: AdminSettlement }) {
  if (settlement.status === "approved" && customerCashflow(settlement) < 0) {
    return <span className="badge-offerte">Factuur te sturen</span>;
  }

  return <StatusBadge status={settlement.status || "calculated"} />;
}

// Per-rij "volgende stap" — zo kan finance een afrekening ook los afhandelen,
// naast de bulk-acties. Toont één duidelijke knop per status.
function RowAction({
  settlement,
  pending,
  onApprove,
  onPay,
  onSendInvoice,
  onInvoicePaid,
  onUnapprove,
}: {
  settlement: AdminSettlement;
  pending: boolean;
  onApprove: () => void;
  onPay: () => void;
  onSendInvoice: () => void;
  onInvoicePaid: () => void;
  onUnapprove: () => void;
}) {
  const payout = customerCashflow(settlement);
  let action: { label: string; onClick: () => void } | null = null;
  if (settlement.status === "calculated") action = { label: "Goedkeuren", onClick: onApprove };
  else if (settlement.status === "approved" && payout >= 0) action = { label: "Markeer betaald", onClick: onPay };
  else if (settlement.status === "approved" && payout < 0) action = { label: "Factuur verstuurd", onClick: onSendInvoice };
  else if (settlement.status === "invoice_sent") action = { label: "Factuur voldaan", onClick: onInvoicePaid };

  if (!action) {
    const done = ["paid", "invoice_paid", "charged_back"].includes(settlement.status ?? "");
    return done
      ? <CheckCircle className="w-4 h-4 text-primary/40 inline-block" aria-label="Afgerond" />
      : <span className="text-xs text-muted-foreground/50">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap" disabled={pending} onClick={action.onClick}>
        {action.label}
      </Button>
      {settlement.status === "approved" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          disabled={pending}
          onClick={onUnapprove}
          title="Goedkeuring terugdraaien (terug naar 'berekend')"
          aria-label="Goedkeuring terugdraaien"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      )}
    </span>
  );
}
