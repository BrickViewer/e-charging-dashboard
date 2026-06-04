import type { AdminSettlement } from "@/types/db";
import { settlementVat } from "@/services/calculations";

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SettlementDetailRow({ settlement }: { settlement: AdminSettlement }) {
  const vat = settlementVat({
    clientPayout: Number(settlement.client_payout || 0),
    vatRate: Number(settlement.vat_rate ?? 0.21),
  });
  const hasVat = vat.vatRate > 0;
  const vatPct = (vat.vatRate * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-muted/30 px-6 py-4 border-b border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Sessies</p>
              <p className="font-medium">{settlement.total_sessions ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Laadopbrengst (excl BTW)</p>
              <p className="font-medium">{fmt(Number(settlement.gross_revenue || 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">E-Charging service-fee</p>
              <p className="font-medium">{fmt(Number(settlement.echarging_revenue || 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">e-Flux uitbetaald</p>
              <p className="font-medium">
                {settlement.eflux_reimbursed_at ? new Date(settlement.eflux_reimbursed_at).toLocaleDateString("nl-NL") : "Nog niet"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Factuurstatus</p>
              <p className="font-medium">
                {settlement.status === "invoice_paid"
                  ? "Factuur voldaan"
                  : settlement.status === "invoice_sent"
                  ? "Factuur open"
                  : settlement.status === "charged_back"
                  ? "Legacy incasso"
                  : Number(settlement.client_payout || 0) < 0
                  ? "Factuur te sturen"
                  : "Niet van toepassing"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Betaald op</p>
              <p className="font-medium">{settlement.paid_at ? new Date(settlement.paid_at).toLocaleDateString("nl-NL") : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Netto uitbetaling (excl. BTW)</p>
              <p className="font-medium">{fmt(vat.net)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">BTW {hasVat ? `(${vatPct}%)` : "(vrijgesteld)"}</p>
              <p className="font-medium">{fmt(vat.vatAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Incl. BTW (overboeken)</p>
              <p className="font-semibold text-primary">{fmt(vat.inclVat)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Geschatte ERE-opbrengst</p>
              <p className="font-medium text-green-700 dark:text-green-400">~{fmt(Number(settlement.ere_estimate || 0))} <span className="text-xs text-muted-foreground font-normal">indicatief</span></p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
