// Scenario-presets (5/10/20 laadpalen) en de mapping van een echte
// configurator-configuratie naar demo-parameters. Puur, geen React.
import type { DemoCustomer, DemoParams, DemoSiteSpec } from "@/lib/demoData";

export type ScenarioKey = 5 | 10 | 20;
export const SCENARIO_KEYS: ScenarioKey[] = [5, 10, 20];

// Per-paal aannames volgen de configurator-locatietype-profielen
// (destination 420 / public 520 kWh per paal/maand) + €0,581/kWh klantvergoeding.
const NET = 0.581;

const CUSTOMER_5: DemoCustomer = {
  companyName: "Van der Velde Retail B.V.",
  contactName: "Sanne van der Velde",
  contactEmail: "s.vandervelde@vdvretail.nl",
  contactPhone: "+31302345678",
  address: "Croeselaan 18",
  postalCode: "3521 CB",
  city: "Utrecht",
  kvk: "30123456",
  btwNumber: "NL803012345B01",
  clientNumber: 184,
};

const CUSTOMER_10: DemoCustomer = {
  companyName: "Hofstede Vastgoed B.V.",
  contactName: "Mark Hofstede",
  contactEmail: "m.hofstede@hofstedevastgoed.nl",
  contactPhone: "+31334567890",
  address: "Stationsplein 12",
  postalCode: "3818 LE",
  city: "Amersfoort",
  kvk: "63094821",
  btwNumber: "NL863094821B01",
  clientNumber: 217,
};

const CUSTOMER_20: DemoCustomer = {
  companyName: "Rijnpoort Logistiek B.V.",
  contactName: "Erik Bakker",
  contactEmail: "e.bakker@rijnpoortlogistiek.nl",
  contactPhone: "+31104567890",
  address: "Waalhaven Oostzijde 75",
  postalCode: "3087 BM",
  city: "Rotterdam",
  kvk: "24501234",
  btwNumber: "NL824501234B01",
  clientNumber: 263,
};

const SITES_5: DemoSiteSpec[] = [
  { name: "Hoofdkantoor Croeselaan", address: "Croeselaan 18", city: "Utrecht", postal_code: "3521 CB", property_type: "kantoor", parking_spots: 24, has_solar: true, solar_capacity_kwp: 30, brand: "Alfen", model: "Eve Double Pro", max_power: 22, num_connectors: 2, count: 3, idPrefix: "demo-cp-1", cpPrefix: "HK" },
  { name: "Bezoekersparkeren Jaarbeurs", address: "Jaarbeursplein 6", city: "Utrecht", postal_code: "3521 AL", property_type: "retail", parking_spots: 18, has_solar: false, solar_capacity_kwp: null, brand: "Zaptec", model: "Pro", max_power: 11, num_connectors: 1, count: 2, idPrefix: "demo-cp-2", cpPrefix: "BZ" },
];

const SITES_10: DemoSiteSpec[] = [
  { name: "Hofstede Huis", address: "Stationsplein 12", city: "Amersfoort", postal_code: "3818 LE", property_type: "kantoor", parking_spots: 40, has_solar: true, solar_capacity_kwp: 36, brand: "Alfen", model: "Eve Double Pro", max_power: 22, num_connectors: 2, count: 4, idPrefix: "demo-cp-1", cpPrefix: "HH" },
  { name: "Wooncomplex De Eempoort", address: "Eemplein 84", city: "Amersfoort", postal_code: "3812 EA", property_type: "wooncomplex", parking_spots: 64, has_solar: false, solar_capacity_kwp: null, brand: "Zaptec", model: "Pro", max_power: 11, num_connectors: 1, count: 4, idPrefix: "demo-cp-2", cpPrefix: "EP" },
  { name: "Bedrijvenpark Calveen", address: "Nijverheidsweg-Noord 60", city: "Amersfoort", postal_code: "3812 PM", property_type: "bedrijventerrein", parking_spots: 28, has_solar: true, solar_capacity_kwp: 52.8, brand: "Alfen", model: "Eve Double Pro", max_power: 22, num_connectors: 2, count: 2, idPrefix: "demo-cp-3", cpPrefix: "BC" },
];

const SITES_20: DemoSiteSpec[] = [
  { name: "Distributiecentrum Waalhaven", address: "Waalhaven Oostzijde 75", city: "Rotterdam", postal_code: "3087 BM", property_type: "bedrijventerrein", parking_spots: 80, has_solar: true, solar_capacity_kwp: 120, brand: "Alfen", model: "Eve Double Pro", max_power: 22, num_connectors: 2, count: 6, idPrefix: "demo-cp-1", cpPrefix: "DC" },
  { name: "Wagenpark Vlaardingen", address: "Industrieweg 40", city: "Vlaardingen", postal_code: "3133 EE", property_type: "bedrijventerrein", parking_spots: 60, has_solar: true, solar_capacity_kwp: 88, brand: "Zaptec", model: "Pro", max_power: 11, num_connectors: 1, count: 6, idPrefix: "demo-cp-2", cpPrefix: "WP" },
  { name: "Kantoor Rijnhaven", address: "Rijnhaven 12", city: "Rotterdam", postal_code: "3072 AP", property_type: "kantoor", parking_spots: 36, has_solar: false, solar_capacity_kwp: null, brand: "Alfen", model: "Eve Single Pro", max_power: 22, num_connectors: 1, count: 4, idPrefix: "demo-cp-3", cpPrefix: "KR" },
  { name: "Retailpark Zuidplein", address: "Zuidplein 120", city: "Rotterdam", postal_code: "3083 CW", property_type: "retail", parking_spots: 48, has_solar: false, solar_capacity_kwp: null, brand: "Zaptec", model: "Pro", max_power: 11, num_connectors: 1, count: 4, idPrefix: "demo-cp-4", cpPrefix: "RZ" },
];

export const DEMO_SCENARIOS: Record<ScenarioKey, DemoParams> = {
  5: { id: "scenario-5", chargePoints: 5, kwhPerCpMonth: 420, sessionsPerCpMonth: 35, netRatePerKwh: NET, customer: CUSTOMER_5, sites: SITES_5, monthsAhead: 12, seed: 5 },
  10: { id: "scenario-10", chargePoints: 10, kwhPerCpMonth: 520, sessionsPerCpMonth: 45, netRatePerKwh: NET, customer: CUSTOMER_10, sites: SITES_10, monthsAhead: 12, seed: 10 },
  20: { id: "scenario-20", chargePoints: 20, kwhPerCpMonth: 480, sessionsPerCpMonth: 38, netRatePerKwh: NET, customer: CUSTOMER_20, sites: SITES_20, monthsAhead: 12, seed: 20 },
};

export function isScenarioKey(v: unknown): v is ScenarioKey {
  return v === 5 || v === 10 || v === 20;
}

// Korte beschrijving voor de keuzekaarten.
export function scenarioDescriptor(key: ScenarioKey): {
  klant: string;
  locaties: number;
  maandopbrengst: string;
} {
  const p = DEMO_SCENARIOS[key];
  const perMonth = p.chargePoints * p.kwhPerCpMonth * (p.netRatePerKwh ?? NET);
  return {
    klant: p.customer.companyName,
    locaties: p.sites?.length ?? 1,
    maandopbrengst: `€ ${Math.round(perMonth).toLocaleString("nl-NL")}`,
  };
}

// ── Configuratie → demo-parameters ───────────────────────────────────────────
export interface LeadPricingInput {
  customer?: { companyName?: string; contactName?: string; contactEmail?: string; contactPhone?: string; locationAddress?: string; postalCode?: string; city?: string; locationType?: string };
  hardware?: { chargePoints?: number; socketsPerChargePoint?: number; hardwareInvestment?: number };
  usage?: { sessionsPerChargePointMonth?: number; kwhPerChargePointMonth?: number; averageSessionDurationHours?: number; effectiveChargingPowerKw?: number };
  tariffs?: { chargeTariffPerKwh?: number; energyCostPerKwh?: number };
}
export interface LeadPricingResult {
  customerNetPerChargePointMonth?: number;
  totals?: { customerPerMonth?: number };
}
export interface LeadConfiguration {
  pricing_input?: LeadPricingInput;
  pricing_result?: LeadPricingResult;
  ere?: boolean; // ERE-subsidie aan/uit zoals in de configurator gekozen
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

/** Bouwt demo-parameters uit een opgeslagen configuratie van een lead. */
export function demoParamsFromConfiguration(
  leadId: string,
  config: LeadConfiguration | null | undefined,
  fallbackCompanyName?: string | null,
): DemoParams {
  const pin = config?.pricing_input ?? {};
  const usage = pin.usage ?? {};
  const hw = pin.hardware ?? {};
  const cust = pin.customer ?? {};
  const result = config?.pricing_result;

  const chargePoints = clamp(Math.round(hw.chargePoints ?? 10), 1, 200);
  const kwhPerCpMonth = clamp(usage.kwhPerChargePointMonth ?? 420, 1, 5000);
  const sessionsPerCpMonth = clamp(Math.round(usage.sessionsPerChargePointMonth ?? 20), 1, 400);

  // Klantvergoeding per kWh: liefst uit het rekenresultaat, anders een veilige default.
  let netRate = DEFAULT_NET();
  const netPerCpMonth = result?.customerNetPerChargePointMonth;
  if (typeof netPerCpMonth === "number" && netPerCpMonth > 0 && kwhPerCpMonth > 0) {
    netRate = clamp(netPerCpMonth / kwhPerCpMonth, 0.05, 2.0);
  }

  const power = usage.effectiveChargingPowerKw ?? 11;
  const customer: DemoCustomer = {
    companyName: (cust.companyName || fallbackCompanyName || "Demo klant B.V.").trim(),
    contactName: cust.contactName || "Contactpersoon",
    contactEmail: cust.contactEmail || "contact@demo.nl",
    contactPhone: cust.contactPhone || "+31330000000",
    address: cust.locationAddress || "Locatieadres",
    postalCode: cust.postalCode || "",
    city: cust.city || "Nederland",
  };

  return {
    id: `lead-${leadId}`,
    chargePoints,
    kwhPerCpMonth,
    sessionsPerCpMonth,
    netRatePerKwh: netRate,
    hardwareInvestment: hw.hardwareInvestment,
    customer,
    chargerPowerKw: power >= 20 ? 22 : 11,
    monthsAhead: 12,
    ereEnabled: config?.ere === true, // ERE uit de configuratie overnemen
    seed: hashSeed(leadId),
    // geen sites → single-site demo op het adres van de klant (faithful aan de configuratie)
  };
}

function DEFAULT_NET() {
  return NET;
}
