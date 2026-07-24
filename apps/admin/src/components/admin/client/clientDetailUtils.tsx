import { monthFullLabel } from "@/lib/period";
import { settlementNetExcl } from "@/services/calculations";
import type { OnbOrder, OnboardingClient } from "@/services/onboardingPipeline";
import type {
  ClientPaymentDetails,
  ClientWithRelations,
  Settlement,
} from "@/types/db";

// De klantpagina rekent met dezelfde ladder als het onboarding-bord
// (services/onboardingPipeline.ts). Deze mapping is de enige plek waar de clients-rij
// naar dat model wordt vertaald; wat je op de klantpagina ziet is dus exact wat de kaart
// op /sales/onboarding laat zien.
export function toOnboardingItem(client: ClientWithRelations, orders: OnbOrder[]): OnboardingClient {
  return {
    id: client.id,
    company_name: client.company_name,
    client_number: client.client_number,
    status: client.status,
    portal_user_id: client.portal_user_id,
    contact_email: client.contact_email,
    contact_name: client.contact_name,
    contact_phone: client.contact_phone,
    created_at: client.created_at,
    payment_onboarding_status: client.payment_onboarding_status,
    needs_installation: client.needs_installation,
    managed: client.managed,
    vat_status: client.vat_status,
    kvk: client.kvk,
    btw_number: client.btw_number,
    billing_address_street: client.billing_address_street,
    billing_address_postal: client.billing_address_postal,
    billing_address_city: client.billing_address_city,
    // Zonder deze twee is activationOpen hier altijd 0 en viel de factuurstap voor een
    // alleen-beheer-klant terug op 'n.v.t.' — terwijl het bord hem wél als openstaand toont.
    activation_fee_total: client.activation_fee_total,
    activation_invoiced_total: client.activation_invoiced_total,
    installation_orders: orders,
    locations: (client.locations ?? []).map((l) => ({ id: l.id, archived_at: l.archived_at })),
    client_invitations: client.client_invitations ?? [],
    kind: "client",
  };
}

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
export const settlementCustomerCashflow = (settlement: Settlement) =>
  Number(settlement.client_payout || 0);

// Netto daadwerkelijk uitbetaald (excl-equivalent) = vergoeding − verrekende activatie,
// via de gedeelde helper zodat het overeenkomt met de factuur "Netto over te boeken".
export const settlementNetPaid = (settlement: Settlement) =>
  settlementNetExcl({
    clientPayout: Number(settlement.client_payout || 0),
    activationCost: Number(settlement.activation_cost || 0),
    vatRate: Number(settlement.vat_rate ?? 0.21),
  });

export const settlementPeriodLabel = (s: { year: number; month: number }) => monthFullLabel(s.year, s.month);
