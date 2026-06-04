import { useClientProfile, useClientSettlements, usePortalInvoiceContext, MONTH_LABELS_NL } from "@/hooks/useClientData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CheckCircle, Clock, Euro, Calendar, Download } from "lucide-react";
import { useState, useMemo } from "react";
import type { PortalSettlement } from "@/types/db";
import { generateSelfBillingInvoicePdf } from "@/services/invoicePdf";
import { getPortalSessions, getAmsterdamMonthBounds } from "@/services/sessions";

// Statusbuckets — de klant denkt in "uitbetaald" vs "in behandeling",
// niet in de interne factuur-mechaniek.
const PAID_STATUSES = new Set(["paid", "invoice_paid", "charged_back"]);
const PENDING_STATUSES = new Set(["approved", "invoice_sent"]);
const VISIBLE_STATUSES = new Set([...PAID_STATUSES, ...PENDING_STATUSES]);

export default function ClientFinancial() {
  const { data: client } = useClientProfile();
  const { data: settlements, isLoading } = useClientSettlements(client?.id);
  const { data: invoiceContext } = usePortalInvoiceContext(client?.id);
  const [statusFilter, setStatusFilter] = useState("all");

  // Download de complete vergoedingsstructuur (PDF) — netto sessielijnen komen
  // server-side uit get_portal_sessions, dus bruto/fee bereiken de browser niet.
  const handleDownloadInvoice = async (s: PortalSettlement) => {
    if (!client) return;
    // Maandgrenzen op NL-tijd (zelfde bron als de settlement-aggregatie), zodat de
    // sessie-specificatie exact de afrekening van deze maand dekt.
    const { start, end } = await getAmsterdamMonthBounds(s.year, s.month);
    const sessionLines = await getPortalSessions({ from: start, to: end, limit: 5000 });
    await generateSelfBillingInvoicePdf(s, client, invoiceContext?.org, invoiceContext?.paymentDetails, sessionLines);
  };

  // Klant ziet alleen formele afrekeningen (goedgekeurd door E-Charging).
  const visibleSettlements = useMemo(
    () => (settlements ?? []).filter((s) => VISIBLE_STATUSES.has(s.status)),
    [settlements],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return visibleSettlements;
    const bucket = statusFilter === "paid" ? PAID_STATUSES : PENDING_STATUSES;
    return visibleSettlements.filter((s) => bucket.has(s.status));
  }, [visibleSettlements, statusFilter]);

  // KPI's — uitsluitend netto (geen bruto/fee).
  const kpis = useMemo(() => {
    const paid = visibleSettlements.filter((s) => PAID_STATUSES.has(s.status));
    const totalPaidOut = paid.reduce((sum, s) => sum + Number(s.client_payout || 0), 0);
    // settlements komen al binnen op year desc, month desc → eerste = meest recent
    const latest = paid.find((s) => s.paid_at) ?? paid[0] ?? null;
    return {
      totalPaidOut,
      lastPayout: latest ? Number(latest.client_payout || 0) : 0,
      lastPayoutDate: latest?.paid_at ?? null,
    };
  }, [visibleSettlements]);

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const periodLabel = (year: number, month: number) => `${MONTH_LABELS_NL[month - 1]} ${year}`;

  const isPaidLike = (status: string) => PAID_STATUSES.has(status);
  const statusIcon = (status: string) =>
    isPaidLike(status) ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />;
  const statusChipClass = (status: string) =>
    isPaidLike(status)
      ? "border-primary/30 bg-primary/10 text-primary text-xs font-medium gap-1"
      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs font-medium gap-1";
  const statusText = (s: PortalSettlement) => {
    const d = (iso: string | null) => (iso ? ` op ${format(new Date(iso), "d MMM yyyy", { locale: nl })}` : "");
    switch (s.status) {
      case "paid": return `Uitbetaald${d(s.paid_at)}`;
      case "invoice_paid": return `Voldaan${d(s.paid_at)}`;
      case "charged_back": return "Verrekend";
      case "invoice_sent": return "In behandeling";
      case "approved": return "Goedgekeurd · uitbetaling volgt";
      default: return s.status;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI-strip — uitsluitend netto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Euro className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="cockpit-section-label">Totaal uitbetaald</p>
                <p className="text-base font-semibold text-primary tabular-nums mt-0.5">{fmt(kpis.totalPaidOut)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="cockpit-section-label">Laatste uitbetaling</p>
                <p className="text-base font-semibold tabular-nums mt-0.5">{fmt(kpis.lastPayout)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {kpis.lastPayoutDate
                    ? format(new Date(kpis.lastPayoutDate), "d MMM yyyy", { locale: nl })
                    : "Nog niet uitbetaald"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sectiekop + filter */}
      {visibleSettlements.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="cockpit-section-label tracking-[0.28em] text-foreground/90">Afrekeningen</h2>
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v)}
            className="rounded-lg border border-border bg-card/60 p-0.5 gap-0.5"
          >
            <ToggleGroupItem value="all" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Alle</ToggleGroupItem>
            <ToggleGroupItem value="paid" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Uitbetaald</ToggleGroupItem>
            <ToggleGroupItem value="pending" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary">In behandeling</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* Afrekeningen — netto-only */}
      <div className="space-y-4">
        {filtered.map((s) => (
          <Card key={s.id} className="portal-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="cockpit-section-label tracking-[0.28em] text-foreground/90">
                  {periodLabel(s.year, s.month)}
                </h3>
                <Badge variant="outline" className={statusChipClass(s.status)}>
                  {statusIcon(s.status)}
                  <span>{statusText(s)}</span>
                </Badge>
              </div>

              <div className="py-1">
                <p className="cockpit-section-label">Vergoeding voor laden · {periodLabel(s.year, s.month)}</p>
                <p className="text-3xl font-bold text-primary tabular-nums mt-1.5">{fmt(Number(s.client_payout || 0))}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Dit is uw vergoeding voor het laden in deze periode, uitgekeerd via E-Charging.
                  De volledige onderbouwing per laadsessie staat in de vergoedingsstructuur.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 portal-card"
                  onClick={() => { void handleDownloadInvoice(s); }}
                  title="Download de complete vergoedingsstructuur (PDF)"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Vergoedingsstructuur
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && !isLoading && visibleSettlements.length > 0 && (
          <Card className="portal-card">
            <CardContent className="p-10 text-center text-muted-foreground">
              <p className="text-sm">Geen afrekeningen in deze categorie.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStatusFilter("all")}>
                Toon alle
              </Button>
            </CardContent>
          </Card>
        )}

        {visibleSettlements.length === 0 && !isLoading && (
          <Card className="portal-card">
            <CardContent className="p-12 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Euro className="w-5 h-5 text-primary" />
              </div>
              <p className="font-medium text-foreground mb-1">Nog geen afrekeningen</p>
              <p className="text-sm">Zodra E-Charging uw maandvergoeding heeft goedgekeurd, verschijnt deze hier.</p>
              <p className="text-xs mt-3 text-muted-foreground/80">De actuele stand voor de lopende maand ziet u op uw dashboard.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
