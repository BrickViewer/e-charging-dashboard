// Demo-presets (keuzescherm) + de mapping van een echte configurator-configuratie naar
// demo-parameters. Puur, geen React. Presets komen uit de admin-settings; FALLBACK_*
// dient als baked default én als terugval als de publieke fetch faalt.
import type { DemoCustomer, DemoParams, DemoSiteSpec } from "@/lib/demoData";

// €/kWh klantvergoeding-default (config-demo's leiden 'm liever af uit het rekenresultaat).
const NET = 0.581;

// ── Demo-presets ──────────────────────────────────────────────────────────────
export interface DemoPresetLocation { name: string; chargePoints: number; powerKw: number }
export interface DemoPreset {
  key: string;
  label: string;
  customerName: string;
  kwhPerCpMonth: number;
  sessionsPerCpMonth: number;
  locations: DemoPresetLocation[];
}

// Mirror van pricing-engine `defaultDemoPresets` (1/2/3 locaties, kleinste 5 palen/1 loc).
export const FALLBACK_DEMO_PRESETS: DemoPreset[] = [
  { key: "1-locatie", label: "1 locatie", customerName: "Van der Velde Retail B.V.", kwhPerCpMonth: 420, sessionsPerCpMonth: 35, locations: [{ name: "Hoofdlocatie", chargePoints: 5, powerKw: 11 }] },
  { key: "2-locaties", label: "2 locaties", customerName: "Hofstede Vastgoed B.V.", kwhPerCpMonth: 480, sessionsPerCpMonth: 40, locations: [{ name: "Hoofdkantoor", chargePoints: 4, powerKw: 22 }, { name: "Bezoekersparkeren", chargePoints: 4, powerKw: 11 }] },
  { key: "3-locaties", label: "3 locaties", customerName: "Rijnpoort Logistiek B.V.", kwhPerCpMonth: 520, sessionsPerCpMonth: 42, locations: [{ name: "Distributiecentrum", chargePoints: 6, powerKw: 22 }, { name: "Wagenpark", chargePoints: 4, powerKw: 11 }, { name: "Kantoor", chargePoints: 2, powerKw: 22 }] },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function presetChargePoints(preset: DemoPreset): number {
  return preset.locations.reduce((sum, l) => sum + Math.max(1, Math.round(l.chargePoints)), 0);
}

// Indicatieve maandopbrengst voor een preset-kaart (zelfde NET-aanname als de scenario's).
export function presetMonthlyEstimate(preset: DemoPreset): number {
  return Math.round(presetChargePoints(preset) * preset.kwhPerCpMonth * NET);
}

// Bouwt demo-parameters uit een preset: per locatie een gesynthetiseerde site (adres/
// merk/zonnedak afgeleid van palen/vermogen). Klant = preset.customerName + demo-defaults.
export function demoParamsFromPreset(preset: DemoPreset): DemoParams {
  const sites: DemoSiteSpec[] = preset.locations.map((loc, i) => {
    const power = loc.powerKw >= 22 ? 22 : 11;
    const count = Math.max(1, Math.round(loc.chargePoints));
    return {
      name: loc.name || `Locatie ${i + 1}`,
      address: "Locatieadres",
      city: "Nederland",
      postal_code: "",
      property_type: "bedrijfslocatie",
      parking_spots: Math.max(count * 2, count + 4),
      has_solar: i === 0,
      solar_capacity_kwp: i === 0 ? round2(count * 5) : null,
      brand: power >= 22 ? "Alfen" : "Zaptec",
      model: power >= 22 ? "Eve Double Pro" : "Pro",
      max_power: power,
      num_connectors: power >= 22 ? 2 : 1,
      count,
      idPrefix: `demo-cp-${i + 1}`,
      cpPrefix: `LP${i + 1}`,
    };
  });
  return {
    id: `preset-${preset.key}`,
    chargePoints: sites.reduce((sum, s) => sum + s.count, 0),
    kwhPerCpMonth: preset.kwhPerCpMonth,
    sessionsPerCpMonth: preset.sessionsPerCpMonth,
    netRatePerKwh: NET,
    customer: { ...DEMO_CONFIG_CUSTOMER, companyName: preset.customerName || DEMO_CONFIG_CUSTOMER.companyName },
    sites,
    chargerPowerKw: Math.max(...sites.map((s) => s.max_power)), // dominant vermogen → configurator-seed
    monthsWindow: 14,
    ereEnabled: true, // demo toont ERE standaard aan (sales-highlight)
    seed: hashSeed(preset.key),
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

// ── Demo-config in de link (no-login demo) ───────────────────────────────────
// De configurator codeert de geconfigureerde data in de demo-URL, zodat de demo
// volledig client-side draait zonder DB-query/login. base64url van JSON; de
// configurator gebruikt exact hetzelfde schema voor encoderen.
export interface DemoConfigPayload {
  leadId?: string | null;
  config: LeadConfiguration;
}

export function encodeDemoConfig(payload: DemoConfigPayload): string {
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDemoConfig(s: string): DemoConfigPayload {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(atob(b64))) as DemoConfigPayload;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Vaste demo-klant voor de configuratie-demo: we nemen alleen de instellingen en
// de rendementsinschatting over, NIET de gegevens van de echte klant. Standaard
// demo-namen dus.
const DEMO_CONFIG_CUSTOMER: DemoCustomer = {
  companyName: "Demo Laadplein B.V.",
  contactName: "Alex de Boer",
  contactEmail: "demo@e-charging.nl",
  contactPhone: "+31 30 123 4567",
  address: "Energieweg 12",
  postalCode: "3542 AB",
  city: "Utrecht",
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

/**
 * Bouwt demo-parameters uit een opgeslagen configuratie van een lead. Neemt ALLEEN
 * de instellingen + de rendementsinschatting over (laadpunten, kWh/sessies, netto
 * tarief, ERE); de klantgegevens worden NIET overgenomen — de demo gebruikt vaste
 * demo-namen (DEMO_CONFIG_CUSTOMER).
 */
export function demoParamsFromConfiguration(
  leadId: string,
  config: LeadConfiguration | null | undefined,
): DemoParams {
  const pin = config?.pricing_input ?? {};
  const usage = pin.usage ?? {};
  const hw = pin.hardware ?? {};
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

  return {
    id: `lead-${leadId}`,
    chargePoints,
    kwhPerCpMonth,
    sessionsPerCpMonth,
    netRatePerKwh: netRate,
    hardwareInvestment: hw.hardwareInvestment,
    customer: DEMO_CONFIG_CUSTOMER, // vaste demo-klant; klantgegevens worden niet overgenomen
    chargerPowerKw: power >= 20 ? 22 : 11,
    monthsWindow: 14,
    ereEnabled: config?.ere === true, // ERE uit de configuratie overnemen
    seed: hashSeed(leadId),
    // geen sites → single-site demo op het demo-adres
  };
}

function DEFAULT_NET() {
  return NET;
}
