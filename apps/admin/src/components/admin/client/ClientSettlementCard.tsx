import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { formatEuro, formatNumber, settlementVat, settlementNetToTransfer } from "@/services/calculations";
import { generateSelfBillingInvoicePdf, InvoiceValidationError } from "@/services/invoicePdf";
import { FeeWaiverControl } from "@/components/admin/financial/FeeWaiverControl";
import { toast } from "sonner";
import type { ClientPaymentDetails, ClientWithRelations, Organization, QuarterlySettlement } from "@/types/db";
import { settlementPeriodLabel } from "./clientDetailUtils";
import { SettlementAdminStatusBadge } from "./SettlementAdminStatusBadge";

export function ClientSettlementCard({
  settlement: s,
  client,
  org,
  paymentDetails,
  approvingId,
  approveSettlement,
  unapproveSettlement,
  executeMoneyFlow,
  markEfluxReimbursed,
}: {
  settlement: QuarterlySettlement;
  client: ClientWithRelations;
  org: Organization | null | undefined;
  paymentDetails?: ClientPaymentDetails | null;
  approvingId: string | null;
  approveSettlement: (id: string) => void;
  unapproveSettlement: (id: string) => void;
  executeMoneyFlow: (settlement: QuarterlySettlement) => void;
  markEfluxReimbursed: (id: string) => void;
}) {
  const grossRevenue = Number(s.gross_revenue || 0);
  const totalKwh = Number(s.total_kwh || 0);
  const feePerKwh = Number(s.echarging_fee_per_kwh || 0);
  const echargingRevenue = Number(s.echarging_revenue || 0);
  const clientPayout = Number(s.client_payout || 0);
  const vat = settlementVat({ clientPayout, vatRate: Number(s.vat_rate ?? 0.21) });
  // Verrekende activatiekosten (altijd 21% output-BTW) + netto over te boeken — gedeelde bron.
  const activationCost = Number(s.activation_cost || 0);
  const activation = settlementVat({ clientPayout: activationCost, vatRate: 0.21 });
  const hasActivation = activation.net > 0;
  const netToTransfer = settlementNetToTransfer({ clientPayout, activationCost, vatRate: Number(s.vat_rate ?? 0.21) });
  const isLive = s.status === "live";
  const isCalculated = s.status === "calculated";
  const efluxReimbursed = Boolean(s.eflux_reimbursed_at);
  const needsEfluxReimbursed = s.status === "approved" && clientPayout >= 0 && !efluxReimbursed;
  const canMarkBankPaid = s.status === "approved" && clientPayout >= 0 && efluxReimbursed;
  const canMarkInvoiceSent = s.status === "approved" && clientPayout < 0;
  const canMarkInvoicePaid = s.status === "invoice_sent";

  return (
    <Card key={s.id}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{settlementPeriodLabel(s)}</h3>
            <SettlementAdminStatusBadge settlement={s} />
            {isLive && (
              <span className="text-xs text-muted-foreground">Cijfers updaten met elke sync, definitief na afloop maand</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCalculated && (
              <Button size="sm" onClick={() => approveSettlement(s.id)} disabled={approvingId === s.id}>
                {approvingId === s.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Goedkeuren
              </Button>
            )}
            {needsEfluxReimbursed && (
              <Button size="sm" variant="outline" onClick={() => markEfluxReimbursed(s.id)} disabled={approvingId === s.id}>
                e-Flux heeft ons betaald
              </Button>
            )}
            {(canMarkBankPaid || canMarkInvoiceSent || canMarkInvoicePaid) && (
              <Button size="sm" variant="outline" onClick={() => executeMoneyFlow(s)} disabled={approvingId === s.id}>
                {canMarkInvoicePaid
                  ? "Factuur voldaan"
                  : canMarkInvoiceSent
                  ? "Factuur verstuurd"
                  : "Bankbetaling markeren"}
              </Button>
            )}
            {s.status === "approved" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unapproveSettlement(s.id)}
                disabled={approvingId === s.id}
                title="Terug naar 'berekend' — daarna kun je bv. de fee kwijtschelden"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Terugdraaien
              </Button>
            )}
            {!isLive && !isCalculated && clientPayout >= 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await generateSelfBillingInvoicePdf(s, client, org, paymentDetails);
                  } catch (err) {
                    if (err instanceof InvoiceValidationError) {
                      toast.error(`Factuur geblokkeerd — ontbrekend: ${err.issues.map((i) => i.label).join(", ")}`);
                    } else {
                      toast.error((err as Error).message || "Factuur genereren mislukt");
                    }
                  }
                }}
                title="Self-billing afrekening als PDF"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Factuur
              </Button>
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {s.total_sessions} sessies · {formatNumber(totalKwh, 3)} kWh
        </div>

        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Laadopbrengst (bruto, excl. BTW)</span>
            <span className="tabular-nums">{formatEuro(grossRevenue)}</span>
          </div>
          <details className="group">
            <summary className="flex justify-between cursor-pointer hover:text-foreground list-none">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <span className="text-[10px] opacity-60 group-open:rotate-90 transition-transform inline-block">▶</span>
                - E-Charging service-fee
              </span>
              <span className="tabular-nums">-{formatEuro(echargingRevenue)}</span>
            </summary>

            {/* Factuur-regel: kWh x tarief = fee. Geen minimum, geen abonnement, geen opstartkosten. */}
            <div className="ml-4 mt-2 mb-1 pl-3 border-l border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground/70 border-b border-border/60">
                    <th className="text-left font-medium py-1.5 pr-2">Omschrijving</th>
                    <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">kWh</th>
                    <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Tarief / kWh</th>
                    <th className="text-right font-medium py-1.5 pl-2">Totaal</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground/85">
                  <tr>
                    <td className="py-1.5 pr-2">Service-fee over geladen energie</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatNumber(totalKwh, 3)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatEuro(feePerKwh)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{formatEuro(echargingRevenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
          {/* Kwijtschelding: badge + toggle (alleen actief bij live/calculated) */}
          <div className="flex justify-end">
            <FeeWaiverControl settlement={s} />
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
            <span>Uitbetaling klant</span>
            <span className="text-primary tabular-nums">{formatEuro(clientPayout)}</span>
          </div>
        </div>

        {/* Cashflow-samenvatting per partij — klant + E-Charging tellen samen op tot bruto. */}
        <div className="border-t border-border pt-2 mt-2 text-xs text-muted-foreground bg-muted/30 -mx-5 -mb-5 px-5 py-3 rounded-b-md space-y-1.5">
          <div className="flex justify-between gap-3">
            <span>Netto naar klant <span className="text-muted-foreground/70">(excl. BTW)</span></span>
            <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(vat.net)}</span>
          </div>
          {vat.vatRate > 0 && (
            <div className="flex justify-between gap-3">
              <span>BTW ({(vat.vatRate * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%)</span>
              <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(vat.vatAmount)}</span>
            </div>
          )}
          {hasActivation && (
            <div className="flex justify-between gap-3">
              <span>Activatiekosten <span className="text-muted-foreground/70">(verrekend, incl. BTW)</span></span>
              <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">- {formatEuro(activation.inclVat)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-border/40 pt-1.5 text-foreground font-semibold">
            <span>{hasActivation ? "Netto over te boeken" : "Over te boeken"} <span className="text-muted-foreground/70 font-normal">(incl. BTW)</span></span>
            <span className="text-primary tabular-nums whitespace-nowrap">{formatEuro(netToTransfer)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Naar E-Charging <span className="text-muted-foreground/70">(service-fee)</span></span>
            <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(echargingRevenue)}</span>
          </div>
          {s.eflux_reimbursed_at && (
            <div className="text-muted-foreground/80 pt-1 border-t border-border/40">
              e-Flux heeft uitbetaald op {format(new Date(s.eflux_reimbursed_at), "d MMM yyyy", { locale: nl })}
            </div>
          )}
          {s.paid_at && (
            <div className="text-muted-foreground/80">
              {s.status === "invoice_paid" ? "Factuur voldaan op" : "Uitbetaald op"}{" "}
              {format(new Date(s.paid_at), "d MMM yyyy", { locale: nl })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
