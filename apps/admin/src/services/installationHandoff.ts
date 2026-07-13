// Puur en framework-vrij: bouwt de handoff-payload voor de E-Group portal,
// valideert het site-adres, splitst Nederlandse adressen en mapt E-Group-
// statussen terug naar onze installation_orders-status. Unit-testbaar; de
// edge functions houden een dunne inline-spiegel van splitDutchAddress en
// mapEgroupStatus (Deno kan niet uit apps/admin/src importeren).

// ── Adres splitsen ──────────────────────────────────────────────────────────
// E-Group projects vereisen straat + huisnummer apart; onze data bewaart vaak
// één adresregel. Best-effort: laatste getal + optionele letter/toevoeging.
const HOUSE_NUMBER_RE = /\s*(\d+\s*[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s*$/;

export function splitDutchAddress(address: string | null | undefined): {
  street: string;
  house_number: string;
} {
  const value = (address ?? "").trim();
  if (!value) return { street: "", house_number: "" };
  const match = value.match(HOUSE_NUMBER_RE);
  if (!match) return { street: value, house_number: "" };
  return {
    street: value.slice(0, match.index).trim(),
    house_number: match[1].replace(/\s+/g, ""),
  };
}

// ── Status-mapping E-Group -> e-charging ────────────────────────────────────
export type InstallationStatus =
  | "nieuw"
  | "overgedragen"
  | "ingepland"
  | "geinstalleerd"
  | "afgerond"
  | "geannuleerd";

// Volledige spiegeling: elke E-Group-status valt op een interne status; de rauwe
// waarde wordt los bewaard in external_status. completed=true zet completed_at.
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
      return { status: null, completed: false }; // onbekend: alleen external_status bewaren
  }
}

// ── Materiaalstatus-aggregatie (Contract 3) ─────────────────────────────────
// Werkvoorbereiding houdt per materiaal een bestelstatus bij; de e-portal-
// planner ziet één fase per opdracht. "Slechtste toestand wint": zolang iets
// nog besteld moet worden is de opdracht te_bestellen; alles besteld maar nog
// niet binnen = besteld; pas als elke relevante regel binnen is = binnen.
// niet_nodig is neutraal; geen (relevante) materialen = niet_nodig (tevens de
// e-portal-default, dus consistent vóór de eerste sync).
export const MATERIAL_STATUSES = ["niet_nodig", "te_bestellen", "besteld", "binnen"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export function aggregatePreparationStatus(statuses: readonly MaterialStatus[]): MaterialStatus {
  const relevant = statuses.filter((s) => s !== "niet_nodig");
  if (relevant.length === 0) return "niet_nodig";
  if (relevant.includes("te_bestellen")) return "te_bestellen";
  if (relevant.includes("besteld")) return "besteld";
  return "binnen";
}

// ── Payload-contract (Contract 1) ───────────────────────────────────────────
export interface HandoffLine {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
  /** Montage-uren uit de calculatie — landt in e-portal order_lines.estimated_hours (planning). */
  estimated_hours: number | null;
}

export interface HandoffPayload {
  external_reference: string;
  external_system: "e-charging";
  service_category: string;
  source: "e_charging_dashboard";
  idempotency_key: string;
  quote_number: string | null;
  service_summary: string | null;
  notes: string | null;
  callback_url: string;
  customer: {
    name: string;
    organization_type: "bedrijf" | "particulier";
    kvk_number: string | null;
    vat_number: string | null;
    email: string | null;
    phone: string | null;
    street: string;
    house_number: string;
    street_full: string | null;
    postal_code: string | null;
    city: string | null;
    country: string;
    client_number: number | null;
  };
  site: {
    location_name: string | null;
    street: string;
    house_number: string;
    street_full: string | null;
    postal_code: string | null;
    city: string | null;
    country: string;
  };
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  site_contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  order_lines: HandoffLine[];
  /** Plannings-context uit de calculatie; wordt in e-portal alleen in
      external_order_mirrors.raw_payload bewaard (uren zelf staan op de order_line). */
  planning: {
    hours_total: number | null;
    retour_km: number | null;
    travel_days: number | null;
  } | null;
  totals: {
    hardware_cost: number | null;
    installation_cost: number | null;
    with_management: boolean | null;
  };
  // Facturering wordt door e-charging gedaan, niet door de E-Portal. De E-Portal
  // maakt geen klantfactuur aan; e-charging factureert via de settlements-flow.
  billing: {
    invoiced_by: "e_charging";
    e_portal_creates_invoice: false;
  };
}

// Minimale shapes van de bronrecords (subset van de DB-rijen).
export interface HandoffOrder {
  id: string;
  notes?: string | null;
  service_category?: string | null;
  service_summary?: string | null;
  site_street?: string | null;
  site_house_number?: string | null;
  site_postal?: string | null;
  site_city?: string | null;
  site_contact_name?: string | null;
  site_contact_email?: string | null;
  site_contact_phone?: string | null;
}

export interface HandoffClient {
  company_name?: string | null;
  kvk?: string | null;
  btw_number?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address_street?: string | null;
  billing_address_postal?: string | null;
  billing_address_city?: string | null;
  country?: string | null;
  client_number?: number | null;
}

export interface HandoffCompany {
  name?: string | null;
  kvk?: string | null;
  btw_number?: string | null;
  address_street?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

export interface HandoffLead {
  company_name?: string | null;
  kvk?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_role?: string | null;
  address_street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  estimated_charge_points?: number | null;
  charger_type?: string | null;
}

export interface HandoffQuote {
  quote_number?: string | null;
  line_items?: unknown;
  total_hardware_cost?: number | null;
  total_installation_cost?: number | null;
  with_management?: boolean | null;
  is_private?: boolean | null;
}

/** Subset van quote_calculations (via order.quote_id; kan ontbreken of 'overgeslagen' zijn). */
export interface HandoffCalculation {
  hours_total?: number | null;
  retour_km?: number | null;
  travel_days?: number | null;
}

export interface BuildHandoffInput {
  order: HandoffOrder;
  client?: HandoffClient | null;
  company?: HandoffCompany | null;
  lead?: HandoffLead | null;
  quote?: HandoffQuote | null;
  calculation?: HandoffCalculation | null;
  callbackUrl: string;
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return null;
}

// Site-velden die E-Group verplicht stelt (project NOT NULL). Lege velden
// blokkeren de handoff zodat de gebruiker ze eerst aanvult.
export const REQUIRED_SITE_FIELDS = ["site_street", "site_house_number", "site_postal", "site_city"] as const;

export function validateSiteForHandoff(order: HandoffOrder): {
  ok: boolean;
  missing: string[];
} {
  const labels: Record<string, string> = {
    site_street: "Straat",
    site_house_number: "Huisnummer",
    site_postal: "Postcode",
    site_city: "Plaats",
  };
  const missing = REQUIRED_SITE_FIELDS.filter((f) => !((order[f] ?? "") as string).trim()).map(
    (f) => labels[f],
  );
  return { ok: missing.length === 0, missing };
}

export function buildHandoffPayload(input: BuildHandoffInput): HandoffPayload {
  const { order, client, company, lead, quote, calculation, callbackUrl } = input;

  // Klant-NAW: voorkeur klant, terugval bedrijf, dan lead.
  const customerName =
    firstNonEmpty(client?.company_name, company?.name, lead?.company_name) ?? "Onbekend";
  const customerStreetFull = firstNonEmpty(client?.billing_address_street, company?.address_street);
  const customerSplit = splitDutchAddress(customerStreetFull);

  // Site-adres: het bewerkbare snapshot is leidend (door de gebruiker aangevuld).
  const siteStreet = (order.site_street ?? "").trim();
  const siteHouse = (order.site_house_number ?? "").trim();
  const siteStreetFull = firstNonEmpty(
    [siteStreet, siteHouse].filter(Boolean).join(" "),
    lead?.address_street,
  );

  // Eén samenvattende werkregel: de e-portal toont één rij per order_line, dus niet per
  // quote-regel splitsen (dat gaf dubbele opdrachtregels). Scope staat in notes, kosten in totals.
  // Uren uit de calculatie: 0 betekent "geen urenregels" en is voor de planner
  // misleidender dan "onbekend" — dan liever null.
  const workLabel = (order.service_summary ?? "").trim() || "laadinfrastructuur";
  const hoursTotal =
    calculation?.hours_total != null && calculation.hours_total > 0 ? calculation.hours_total : null;
  const lines: HandoffLine[] = [
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
      street: siteStreet,
      house_number: siteHouse,
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
    // Contactpersoon op locatie: het bewerkbare snapshot is leidend (wie de
    // monteur belt / mee aftekent), met terugval op het lead-contact en daarna
    // het algemene klantcontact (zodat het telefoonnummer niet leeg blijft).
    site_contact: {
      name: firstNonEmpty(order.site_contact_name, lead?.contact_name, client?.contact_name),
      phone: firstNonEmpty(order.site_contact_phone, lead?.contact_phone, client?.contact_phone),
      email: firstNonEmpty(order.site_contact_email, lead?.contact_email, client?.contact_email),
    },
    order_lines: lines,
    planning: calculation
      ? {
          hours_total: hoursTotal,
          retour_km: calculation.retour_km ?? null,
          travel_days: calculation.travel_days ?? null,
        }
      : null,
    totals: {
      hardware_cost: quote?.total_hardware_cost ?? null,
      installation_cost: quote?.total_installation_cost ?? null,
      with_management: quote?.with_management ?? null,
    },
    billing: {
      invoiced_by: "e_charging",
      e_portal_creates_invoice: false,
    },
  };
}

// Leidt een korte service-samenvatting af uit lead-gegevens, bv. "10 laadpunten".
export function deriveServiceSummary(lead?: HandoffLead | null): string | null {
  const n = lead?.estimated_charge_points ?? null;
  if (!n) return null;
  const noun = n === 1 ? "laadpunt" : "laadpunten";
  const type = (lead?.charger_type ?? "").trim();
  return type ? `${n} ${noun} - ${type}` : `${n} ${noun}`;
}
