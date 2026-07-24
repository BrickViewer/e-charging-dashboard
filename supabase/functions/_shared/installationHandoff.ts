// Deno-spiegel van apps/admin/src/lib/houseNumber.ts (DE canonieke adressplitser).
// Deno kan niet uit apps/admin/src importeren, dus dit blijft een inline kopie — de pariteit
// wordt bewaakt door apps/admin/src/services/address.parity.test.ts. Wijzig je hier iets,
// wijzig het daar ook.
const HOUSE_NUMBER_RE = /\s*(\d+\s*[A-Za-z]?(?:[-/]\d+\s*[A-Za-z]?)?)\s*$/;

export function splitDutchAddress(address: string | null | undefined): {
  street: string;
  house_number: string;
} {
  const value = (address ?? "").trim();
  if (!value) return { street: "", house_number: "" };
  const match = value.match(HOUSE_NUMBER_RE);
  if (!match || match.index === undefined) return { street: value, house_number: "" };
  return {
    street: value.slice(0, match.index).trim(),
    house_number: match[1].replace(/\s+/g, ""),
  };
}

// Tegenhanger: straat + los huisnummer weer tot één adresregel. Nodig omdat
// companies/leads/project_locations ze los opslaan terwijl clients/organizations en externe
// systemen (WeFact, e-portal) één regel willen.
export function joinStreetAndHouse(
  street?: string | null,
  houseNumber?: string | null,
): string {
  return [street, houseNumber].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}

export type InstallationStatus =
  | "nieuw"
  | "overgedragen"
  | "ingepland"
  | "geinstalleerd"
  | "afgerond"
  | "geannuleerd";

export function mapEgroupStatus(
  egroupStatus: string | null | undefined,
): { status: InstallationStatus | null; completed: boolean } {
  switch ((egroupStatus ?? "").toLowerCase()) {
    case "bevestigd":
    case "te_plannen":
      return { status: "overgedragen", completed: false };
    case "ingepland":
      return { status: "ingepland", completed: false };
    case "in_uitvoering":
      return { status: "geinstalleerd", completed: false };
    case "gereed":
    case "afgerond":
      return { status: "afgerond", completed: true };
    default:
      return { status: null, completed: false };
  }
}

// Materiaalstatus-aggregatie (Contract 3): "slechtste toestand wint";
// niet_nodig is neutraal, geen relevante materialen = niet_nodig.
export const MATERIAL_STATUSES = ["niet_nodig", "te_bestellen", "besteld", "binnen"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export function aggregatePreparationStatus(statuses: readonly MaterialStatus[]): MaterialStatus {
  const relevant = statuses.filter((s) => s !== "niet_nodig");
  if (relevant.length === 0) return "niet_nodig";
  if (relevant.includes("te_bestellen")) return "te_bestellen";
  if (relevant.includes("besteld")) return "besteld";
  return "binnen";
}

export const REQUIRED_SITE_FIELDS = ["site_street", "site_house_number", "site_postal", "site_city"] as const;

const SITE_LABELS: Record<string, string> = {
  site_street: "Straat",
  site_house_number: "Huisnummer",
  site_postal: "Postcode",
  site_city: "Plaats",
};

// deno-lint-ignore no-explicit-any
export function validateSiteForHandoff(order: any): { ok: boolean; missing: string[] } {
  const missing = REQUIRED_SITE_FIELDS.filter((f) => !((order?.[f] ?? "") as string).trim()).map(
    (f) => SITE_LABELS[f],
  );
  return { ok: missing.length === 0, missing };
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export function buildHandoffPayload(input: any): any {
  const { order, client, company, lead, quote, calculation, callbackUrl } = input;

  const customerName = firstNonEmpty(client?.company_name, company?.name, lead?.company_name) ?? "Onbekend";
  // clients draagt straat+huisnummer in ÉÉN kolom; companies/leads hebben ze los. Die los
  // opgeslagen delen eerst samenvoegen, anders valt het huisnummer weg zodra we op het
  // bedrijf/de lead terugvallen.
  const customerStreetFull = firstNonEmpty(
    client?.billing_address_street,
    joinStreetAndHouse(company?.address_street, company?.house_number),
  );
  const customerSplit = splitDutchAddress(customerStreetFull);

  const siteStreet = (order.site_street ?? "").trim();
  const siteHouse = (order.site_house_number ?? "").trim();
  const siteStreetFull = firstNonEmpty(
    joinStreetAndHouse(siteStreet, siteHouse),
    joinStreetAndHouse(lead?.address_street, lead?.house_number),
  );
  // Valt het site-adres terug op de lead, dan moeten street/house_number dát adres weergeven.
  // Stond eerder alleen in street_full, waardoor de e-portal een leeg straat/huisnummer kreeg.
  const siteSplit = siteStreet
    ? { street: siteStreet, house_number: siteHouse }
    : splitDutchAddress(siteStreetFull);

  // Eén samenvattende werkregel (e-portal toont één rij per order_line). Scope in notes, kosten in totals.
  // Uren uit de calculatie (0 = "geen urenregels" → null, misleidender dan onbekend).
  const workLabel = (order.service_summary ?? "").trim() || "laadinfrastructuur";
  const hoursTotal =
    calculation?.hours_total != null && Number(calculation.hours_total) > 0 ? Number(calculation.hours_total) : null;
  const lines = [
    { description: `Levering & installatie — ${workLabel}`, qty: 1, unit_price: 0, total: 0, estimated_hours: hoursTotal },
  ];

  return {
    external_reference: order.id,
    external_system: "e-charging",
    service_category: order.service_category || "e_charging",
    source: "e_charging_dashboard",
    idempotency_key: order.id,
    quote_number: firstNonEmpty(quote?.quote_number),
    service_summary: firstNonEmpty(order.service_summary),
    notes: firstNonEmpty(order.notes),
    callback_url: callbackUrl,
    customer: {
      name: customerName,
      // Particulier (B2C) vs bedrijf, afgeleid uit de offerte; de e-portal-spiegel ondersteunt beide.
      organization_type: quote?.is_private ? "particulier" : "bedrijf",
      kvk_number: firstNonEmpty(client?.kvk, company?.kvk, lead?.kvk),
      vat_number: firstNonEmpty(client?.btw_number, company?.btw_number),
      email: firstNonEmpty(client?.contact_email, lead?.contact_email),
      phone: firstNonEmpty(client?.contact_phone, lead?.contact_phone),
      street: customerSplit.street,
      house_number: customerSplit.house_number,
      street_full: customerStreetFull,
      postal_code: firstNonEmpty(client?.billing_address_postal, company?.postal_code),
      city: firstNonEmpty(client?.billing_address_city, company?.city),
      country: firstNonEmpty(client?.country) ?? "NL",
      client_number: client?.client_number ?? null,
    },
    site: {
      location_name: firstNonEmpty(lead?.company_name, customerName),
      street: siteSplit.street,
      house_number: siteSplit.house_number,
      street_full: siteStreetFull,
      postal_code: firstNonEmpty(order.site_postal, lead?.postal_code),
      city: firstNonEmpty(order.site_city, lead?.city),
      country: "NL",
    },
    // Back-office/administratie-contact: het algemene accountcontact van de klant.
    contact: {
      name: firstNonEmpty(client?.contact_name, lead?.contact_name),
      email: firstNonEmpty(client?.contact_email, lead?.contact_email),
      phone: firstNonEmpty(client?.contact_phone, lead?.contact_phone),
    },
    // Contactpersoon op locatie: bewerkbare snapshot is leidend, terugval op lead
    // en daarna het algemene klantcontact (telefoon niet leeg laten).
    site_contact: {
      name: firstNonEmpty(order.site_contact_name, lead?.contact_name, client?.contact_name),
      phone: firstNonEmpty(order.site_contact_phone, lead?.contact_phone, client?.contact_phone),
      email: firstNonEmpty(order.site_contact_email, lead?.contact_email, client?.contact_email),
    },
    order_lines: lines,
    // Plannings-context uit de calculatie (alleen bewaard in raw_payload).
    planning: calculation
      ? {
          hours_total: hoursTotal,
          retour_km: calculation.retour_km != null ? Number(calculation.retour_km) : null,
          travel_days: calculation.travel_days != null ? Number(calculation.travel_days) : null,
        }
      : null,
    totals: {
      hardware_cost: quote?.total_hardware_cost ?? null,
      installation_cost: quote?.total_installation_cost ?? null,
      with_management: quote?.with_management ?? null,
    },
    // Facturering door e-charging, niet door de E-Portal.
    billing: {
      invoiced_by: "e_charging",
      e_portal_creates_invoice: false,
    },
  };
}
