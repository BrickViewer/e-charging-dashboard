import { useClientProfile, useClientSettlements, usePortalInvoiceContext, MONTH_LABELS_NL } from "@/hooks/useClientData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CheckCircle, Clock, Euro, Calendar, Download, Truck } from "lucide-react";
import { useState, useMemo, Fragment, type ReactNode } from "react";
import type { PortalSettlement } from "@/types/db";
import { generateSelfBillingInvoicePdf, InvoiceValidationError } from "@/services/invoicePdf";
import { getPortalSessions, getAmsterdamMonthBounds } from "@/services/sessions";
import { getDemoMonthBounds, getDemoSessions } from "@/lib/demoData";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { toast } from "sonner";

// Statusbuckets — de klant denkt in "vergoed" (geld binnen) vs "onderweg"
// (goedgekeurd / factuur ontvangen, geld komt nog), niet in de interne mechaniek.
const PAID_STATUSES = new Set(["paid", "invoice_paid", "charged_back"]);
const PENDING_STATUSES = new Set(["approved", "invoice_sent"]);
const VISIBLE_STATUSES = new Set([...PAID_STATUSES, ...PENDING_STATUSES]);

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodLabel = (year: number, month: number) => `${MONTH_LABELS_NL[month - 1]} ${year}`;

type Tone = "vergoed" | "onderweg" | "verrekend";

// Eén klant-vriendelijke status: vergoed (binnen) / onderweg (komt eraan) / verrekend.
function statusVisual(s: PortalSettlement): { label: string; sub: string | null; tone: Tone } {
  const d = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy", { locale: nl }) : null);
  switch (s.status) {
    case "paid": return { label: "Vergoed", sub: s.paid_at ? `op ${d(s.paid_at)}` : null, tone: "vergoed" };
    case "invoice_paid": return { label: "Vergoed", sub: s.paid_at ? `op ${d(s.paid_at)}` : null, tone: "vergoed" };
    case "charged_back": return { label: "Verrekend", sub: null, tone: "verrekend" };
    case "approved": return { label: "Onderweg", sub: "goedgekeurd", tone: "onderweg" };
    case "invoice_sent": return { label: "Onderweg", sub: "factuur ontvangen", tone: "onderweg" };
    default: return { label: s.status, sub: null, tone: "onderweg" };
  }
}

const pillClass = (tone: Tone) =>
  tone === "vergoed"
    ? "border-primary/30 bg-primary/10 text-primary"
    : tone === "onderweg"
    ? "border-[hsl(var(--status-amber)/0.3)] bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] text-[hsl(var(--status-amber))]"
    : "border-border bg-muted/40 text-muted-foreground";

const pillIcon = (tone: Tone) =>
  tone === "vergoed"
    ? <CheckCircle className="w-3 h-3" />
    : tone === "onderweg"
    ? <Truck className="w-3 h-3" />
    : <Clock className="w-3 h-3" />;

function KpiTile({
  icon, label, value, sub, accent = "primary", exclBtw = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string | null;
  accent?: "primary" | "amber";
  exclBtw?: boolean;
}) {
  const badgeCls = accent === "amber"
    ? "bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] text-[hsl(var(--status-amber))]"
    : "bg-primary/10 border-primary/20 text-primary";
  const numCls = accent === "amber" ? "text-[hsl(var(--status-amber))]" : "text-primary";
  return (
    <Card className="portal-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${badgeCls}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="cockpit-section-label">{label}</p>
            <p className={`text-base font-semibold tabular-nums mt-0.5 ${numCls}`}>
              {value}
              {exclBtw && <span className="text-[11px] font-normal text-muted-foreground ml-1">excl. btw</span>}
            </p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientFinancial() {
  const demo = useDemoMode();
  const { data: client } = useClientProfile();
  const { data: settlements, isLoading } = useClientSettlements(client?.id);
  const { data: invoiceContext } = usePortalInvoiceContext(client?.id);
  const [statusFilter, setStatusFilter] = useState("all");

  // Download de complete vergoedingsstructuur (PDF) — netto sessielijnen komen
  // server-side uit get_portal_sessions, dus bruto/fee bereiken de browser niet.
  const handleDownloadInvoice = async (s: PortalSettlement) => {
    if (!client) return;
    try {
      // Maandgrenzen op NL-tijd (zelfde bron als de settlement-aggregatie), zodat de
      // sessie-specificatie exact de vergoeding van deze maand dekt. In de demo
      // komen grenzen en regels uit de fixtures (geen Supabase-calls).
      const { start, end } = demo ? getDemoMonthBounds(s.year, s.month) : await getAmsterdamMonthBounds(s.year, s.month);
      const sessionLines = demo
        ? getDemoSessions({ from: start, to: end, limit: 5000 })
        : await getPortalSessions({ from: start, to: end, limit: 5000 });
      await generateSelfBillingInvoicePdf(s, client, invoiceContext?.org, invoiceContext?.paymentDetails, sessionLines);
    } catch (err) {
      if (err instanceof InvoiceValidationError) {
        toast.error(`De factuur kan nog niet worden gemaakt — ontbrekend: ${err.issues.map((i) => i.label).join(", ")}. Vul uw gegevens aan via Mijn gegevens of neem contact op.`, { duration: 12000 });
      } else {
        toast.error((err as Error).message || "Factuur downloaden mislukt");
      }
    }
  };

  // Klant ziet alleen formele vergoedingen (goedgekeurd door E-Charging).
  const visibleSettlements = useMemo(
    () => (settlements ?? []).filter((s) => VISIBLE_STATUSES.has(s.status)),
    [settlements],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return visibleSettlements;
    const bucket = statusFilter === "paid" ? PAID_STATUSES : PENDING_STATUSES;
    return visibleSettlements.filter((s) => bucket.has(s.status));
  }, [visibleSettlements, statusFilter]);

  // KPI's — uitsluitend netto (excl. btw). "Vergoed" = binnen, "Onderweg" = komt nog.
  const kpis = useMemo(() => {
    const paid = visibleSettlements.filter((s) => PAID_STATUSES.has(s.status));
    const pending = visibleSettlements.filter((s) => PENDING_STATUSES.has(s.status));
    const totalReimbursed = paid.reduce((sum, s) => sum + Number(s.client_payout || 0), 0);
    const inTransit = pending.reduce((sum, s) => sum + Number(s.client_payout || 0), 0);
    // settlements komen al binnen op year desc, month desc → eerste = meest recent
    const latest = paid.find((s) => s.paid_at) ?? paid[0] ?? null;
    return {
      totalReimbursed,
      inTransit,
      lastReimbursement: latest ? Number(latest.client_payout || 0) : 0,
      lastReimbursementDate: latest?.paid_at ?? null,
      hasLast: !!latest,
    };
  }, [visibleSettlements]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI-strip — uitsluitend netto (excl. btw) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile
          icon={<Euro className="w-4 h-4" />}
          label="Totaal vergoed"
          value={fmt(kpis.totalReimbursed)}
          accent="primary"
        />
        <KpiTile
          icon={<Truck className="w-4 h-4" />}
          label="Onderweg"
          value={fmt(kpis.inTransit)}
          sub="goedgekeurd · komt eraan"
          accent="amber"
        />
        <KpiTile
          icon={<Calendar className="w-4 h-4" />}
          label="Laatste vergoeding"
          value={kpis.hasLast ? fmt(kpis.lastReimbursement) : "—"}
          exclBtw={kpis.hasLast}
          sub={kpis.hasLast && kpis.lastReimbursementDate
            ? format(new Date(kpis.lastReimbursementDate), "d MMM yyyy", { locale: nl })
            : null}
          accent="primary"
        />
      </div>

      {/* Vergoedingen — strakke, schaalbare lijst (1 rij per maand) */}
      {visibleSettlements.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="cockpit-section-label tracking-[0.28em] text-foreground/90">Vergoedingen</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Bedragen zijn excl. btw — download per maand de volledige specificatie.
              </p>
            </div>
            <ToggleGroup
              type="single"
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v)}
              className="rounded-lg border border-border bg-card/60 p-0.5 gap-0.5"
            >
              <ToggleGroupItem value="all" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Alle</ToggleGroupItem>
              <ToggleGroupItem value="paid" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Vergoed</ToggleGroupItem>
              <ToggleGroupItem value="pending" className="h-7 px-3 text-xs rounded-md text-muted-foreground data-[state=on]:bg-[hsl(var(--status-amber)/0.15)] data-[state=on]:text-[hsl(var(--status-amber))]">Onderweg</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Card className="portal-card overflow-hidden">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.map((s, i) => {
                  const showYear = i === 0 || filtered[i - 1].year !== s.year;
                  const v = statusVisual(s);
                  return (
                    <Fragment key={s.id}>
                      {showYear && (
                        <div className="px-4 pt-3 pb-1.5 bg-muted/20">
                          <span className="cockpit-section-label text-muted-foreground/70">{s.year}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-card/60">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground capitalize leading-tight">
                            {periodLabel(s.year, s.month)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${pillClass(v.tone)}`}>
                              {pillIcon(v.tone)}
                              {v.label}
                            </span>
                            {v.sub && <span className="text-[11px] text-muted-foreground">{v.sub}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-base font-semibold text-primary tabular-nums leading-tight">
                              {fmt(Number(s.client_payout || 0))}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">excl. btw</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary flex-shrink-0"
                            onClick={() => { void handleDownloadInvoice(s); }}
                            title="Download je vergoeding (PDF)"
                            aria-label={`Download vergoeding ${periodLabel(s.year, s.month)} (PDF)`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}

                {filtered.length === 0 && !isLoading && (
                  <div className="p-10 text-center text-muted-foreground">
                    <p className="text-sm">Geen vergoedingen in deze categorie.</p>
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStatusFilter("all")}>
                      Toon alle
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lege staat — nog geen vergoedingen */}
      {visibleSettlements.length === 0 && !isLoading && (
        <Card className="portal-card">
          <CardContent className="p-12 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Euro className="w-5 h-5 text-primary" />
            </div>
            <p className="font-medium text-foreground mb-1">Nog geen vergoedingen</p>
            <p className="text-sm">Zodra E-Charging je maandvergoeding heeft goedgekeurd, verschijnt deze hier.</p>
            <p className="text-xs mt-3 text-muted-foreground/80">De actuele stand voor de lopende maand zie je op je dashboard.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
