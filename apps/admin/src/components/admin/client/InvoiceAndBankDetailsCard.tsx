import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientPaymentDetails, ClientWithRelations } from "@/types/db";
import { ClientDetailRow } from "./clientDetailUtils";

export function InvoiceAndBankDetailsCard({
  client,
  paymentDetails,
}: {
  client: ClientWithRelations;
  paymentDetails?: ClientPaymentDetails | null;
}) {
  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Factuur- en bankgegevens</CardTitle></CardHeader>
      <CardContent className="text-sm">
        <div className="space-y-0">
          <ClientDetailRow label="Factuurmail" value={paymentDetails?.invoice_email ?? client.contact_email} />
          <ClientDetailRow label="Naam rekeninghouder" value={paymentDetails?.payout_account_holder_name} />
          <ClientDetailRow label="IBAN" value={paymentDetails?.payout_iban} />
          <ClientDetailRow label="BIC" value={paymentDetails?.payout_bic} />
        </div>
      </CardContent>
    </Card>
  );
}
