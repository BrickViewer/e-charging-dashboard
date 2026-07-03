import { monthFullLabel } from "@/lib/period";
import { settlementNetExcl } from "@/services/calculations";
import type {
  ClientPaymentDetails,
  ClientWithRelations,
  QuarterlySettlement,
} from "@/types/db";

export function splitContactName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function displayValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function ClientDetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{displayValue(value)}</span>
    </div>
  );
}

export function hasCompleteClientProfile(
  client: ClientWithRelations,
  paymentDetails?: ClientPaymentDetails | null,
) {
  // KvK/BTW zijn niet voor iedereen verplicht: particulier ('private') heeft geen van beide nodig,
  // KOR heeft alleen KvK nodig, en BTW-nummer is alleen voor vat_liable. Gelijk aan isDetailsComplete().
  const kvkRequired = client.vat_status === "vat_liable" || client.vat_status === "kor";
  const btwRequired = client.vat_status === "vat_liable";
  const requiredClientFields = [
    client.company_name,
    client.vat_status,
    ...(kvkRequired ? [client.kvk] : []),
    ...(btwRequired ? [client.btw_number] : []),
    client.contact_name,
    client.contact_email,
    client.billing_address_street,
    client.billing_address_postal,
    client.billing_address_city,
  ];
  const hasCompanyFields = requiredClientFields.every((value) => String(value ?? "").trim().length > 0);
  const hasPaymentFields = Boolean(
    paymentDetails?.invoice_email &&
      paymentDetails?.payout_account_holder_name &&
      paymentDetails?.payout_iban_last4,
  );
  return hasCompanyFields && hasPaymentFields;
}

// Bruto vergoeding = client_payout. Blijft de bron voor de teken-routing (positief =
// uitbetalen, negatief = incasso), want de netto (na activatie) klemt op ≥ 0.
export const settlementCustomerCashflow = (settlement: QuarterlySettlement) =>
  Number(settlement.client_payout || 0);

// Netto daadwerkelijk uitbetaald (excl-equivalent) = vergoeding − verrekende activatie,
// via de gedeelde helper zodat het overeenkomt met de factuur "Netto over te boeken".
export const settlementNetPaid = (settlement: QuarterlySettlement) =>
  settlementNetExcl({
    clientPayout: Number(settlement.client_payout || 0),
    activationCost: Number(settlement.activation_cost || 0),
    vatRate: Number(settlement.vat_rate ?? 0.21),
  });

export const settlementPeriodLabel = (s: { year: number; month: number }) => monthFullLabel(s.year, s.month);
