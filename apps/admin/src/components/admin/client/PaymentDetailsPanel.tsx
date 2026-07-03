import { Card, CardContent } from "@/components/ui/card";
import { Landmark } from "lucide-react";
import type { ClientPaymentDetails, ClientWithRelations } from "@/types/db";

export function PaymentDetailsPanel({
  client,
  paymentDetails,
}: {
  client: ClientWithRelations;
  paymentDetails?: ClientPaymentDetails | null;
}) {
  const status = client.payment_onboarding_status ?? "missing";
  const hasBankDetails = Boolean(paymentDetails?.payout_iban_last4);
  let iconBg: string;
  let title: string;
  let subtitle: string;

  if ((status === "saved" || status === "needs_review") && hasBankDetails) {
    iconBg = "bg-primary/10 border-primary/20";
    title = "Gegevens opgeslagen";
    subtitle = `${paymentDetails?.invoice_email ?? client.contact_email} · IBAN eindigt op ${paymentDetails?.payout_iban_last4}`;
  } else if (paymentDetails?.invoice_email) {
    iconBg = "bg-muted/40 border-border";
    title = "Bankgegevens ontbreken";
    subtitle = `${paymentDetails.invoice_email} · klant heeft nog geen IBAN opgeslagen`;
  } else {
    iconBg = "bg-muted/40 border-border";
    title = "Betaalgegevens ontbreken";
    subtitle = "Klant vult deze in via Mijn gegevens";
  }

  return (
    <Card className="portal-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconBg}`}
            >
              <Landmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="cockpit-section-label mb-0.5">Betaalgegevens</p>
              <p className="text-sm font-medium truncate">{title}</p>
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
