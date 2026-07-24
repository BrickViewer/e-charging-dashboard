import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatEuro } from "@/services/calculations";
import type { ClientPaymentDetails, ClientWithRelations, Organization, Settlement } from "@/types/db";
import { ClientSettlementCard } from "./ClientSettlementCard";
import { WefactClientBillingCard } from "./WefactClientBillingCard";

export function ClientFinancialTab({
  settlements,
  settlementsLoading,
  settlementsError,
  totalPaidOut,
  paidCount,
  openBankCashflow,
  openInvoiceAmount,
  totalRevenue,
  afrekeningenCount,
  client,
  org,
  paymentDetails,
  approvingId,
  approveSettlement,
  unapproveSettlement,
  executeMoneyFlow,
  markEfluxReimbursed,
}: {
  settlements: Settlement[];
  settlementsLoading: boolean;
  settlementsError: boolean;
  totalPaidOut: number;
  paidCount: number;
  openBankCashflow: number;
  openInvoiceAmount: number;
  totalRevenue: number;
  afrekeningenCount: number;
  client: ClientWithRelations;
  org: Organization | null | undefined;
  paymentDetails?: ClientPaymentDetails | null;
  approvingId: string | null;
  approveSettlement: (id: string) => void;
  unapproveSettlement: (id: string) => void;
  executeMoneyFlow: (settlement: Settlement) => void;
  markEfluxReimbursed: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Totaal uitbetaald</p>
          <p className="text-2xl font-semibold">{formatEuro(totalPaidOut)}</p>
          <p className="text-xs text-muted-foreground mt-1">{paidCount} {paidCount === 1 ? "maandafrekening" : "maandafrekeningen"} uitbetaald</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Nog uit te betalen</p>
          <p className="text-2xl font-semibold">{formatEuro(openBankCashflow)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {openInvoiceAmount > 0
              ? `${formatEuro(openInvoiceAmount)} te factureren`
              : "Rendement + stroomvergoeding"}
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Totaal omzet (incl. lopend)</p>
          <p className="text-2xl font-semibold">{formatEuro(totalRevenue)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Afrekeningen</p>
          <p className="text-2xl font-semibold">{afrekeningenCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Lopende/concept tellen niet mee</p>
        </CardContent></Card>
      </div>

      <WefactClientBillingCard client={client} />

      {settlementsLoading && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Afrekeningen laden…
        </CardContent></Card>
      )}
      {settlementsError && (
        <Card className="border-destructive/25 bg-destructive/5"><CardContent className="py-12 text-center text-destructive">
          Afrekeningen konden niet worden geladen. Ververs de pagina om het opnieuw te proberen.
        </CardContent></Card>
      )}
      {!settlementsLoading && !settlementsError && settlements.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nog geen afrekeningen. Dit wordt automatisch berekend zodra er sessies binnenkomen.
        </CardContent></Card>
      )}

      {settlements.map((s) => (
        <ClientSettlementCard
          key={s.id}
          settlement={s}
          client={client}
          org={org}
          paymentDetails={paymentDetails}
          approvingId={approvingId}
          approveSettlement={approveSettlement}
          unapproveSettlement={unapproveSettlement}
          executeMoneyFlow={executeMoneyFlow}
          markEfluxReimbursed={markEfluxReimbursed}
        />
      ))}
    </div>
  );
}
