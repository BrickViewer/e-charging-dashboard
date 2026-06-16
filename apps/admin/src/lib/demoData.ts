// Demo-omgeving voor sales: een volledig fictief maar overtuigend klantportaal.
// Alle data komt uit dit bestand; in demo-modus wordt GEEN enkele Supabase-
// dataquery gedaan (de portal-RPC's zouden voor een sales-gebruiker sowieso
// leeg zijn — SECURITY DEFINER, gescoped op portal_user_id).
//
// GEPARAMETRISEERD: `buildDemoDataset(params)` bouwt een complete, interne-
// consistente demo voor een gegeven aantal laadpalen / verbruik / klant. Zo
// kunnen we (a) scenario's tonen (5/10/20 laadpalen) en (b) een demo opbouwen
// uit een echte configurator-configuratie.
//
// Ontwerpprincipes (per dataset):
// - Verankerd aan "nu": de maandreeks schuift mee met de echte kalender.
// - Deterministisch: sessies per maand met vaste seed (mulberry32) → elke
//   reload toont exact dezelfde demo.
// - Intern consistent: sessie-sommen per maand = settlement-totalen = KPI-rijen
//   (zelfde kWh/yield), CO₂ = kWh × 0,306, factuur-fixtures passeren de Wet OB-
//   validatie zodat de factuur-download écht werkt.
// - De gauges schalen automatisch (CockpitGauge/niceQuarterMax), dus elk niveau
//   (5/10/20 palen) oogt netjes.
import type {
  Notification,
  PortalClient,
  PortalLocation,
  PortalPaymentDetails,
  PortalSessionNet,
  PortalSettlement,
} from "@/types/db";
import type { PortalDashboardKpiRow, PortalInvoiceContext } from "@/hooks/useClientData";
import type { GetPortalSessionsOpts } from "@/services/sessions";
import { getCurrentMonth, shiftMonth, monthFullLabel } from "@/lib/period";

export const DEMO_CLIENT_ID = "demo-client-hofstede";

const DEFAULT_NET_RATE_PER_KWH = 0.581; // netto vergoeding per kWh (fictief, realistisch)
const DEFAULT_CO2_KG_PER_KWH = 0.306;   // identiek aan de echte dashboard-RPC
const DEFAULT_ERE_RATE_PER_KWH = 0.10;
const DEFAULT_MONTHS = 14;
const RAMP_START = 0.44; // eerste maand ≈ 44% van de piek (zoals 2450/5610 in het oude demo)

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const iso = (d: Date) => d.toISOString();
const dateOnly = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

// ── Publieke parameter- en dataset-vorm ─────────────────────────────────────
export interface DemoCustomer {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string; // straat + huisnummer
  postalCode: string;
  city: string;
  kvk?: string;
  btwNumber?: string;
  clientNumber?: number;
}

/** Eén locatie in een demo (een preset kan er meerdere hebben). */
export interface DemoSiteSpec {
  name: string;
  address: string;
  city: string;
  postal_code: string;
  property_type: string;
  parking_spots: number;
  has_solar: boolean;
  solar_capacity_kwp: number | null;
  brand: string;
  model: string;
  max_power: number;
  num_connectors: number;
  count: number;     // aantal laadpunten op deze locatie
  idPrefix: string;  // voor stabiele id's, bv. "demo-cp-1"
  cpPrefix: string;  // voor laadpunt-labels, bv. "HH"
}

export interface DemoParams {
  id: string;                    // stabiele dataset-id → React Query-key + sessionStorage
  chargePoints: number;          // totaal aantal laadpalen
  kwhPerCpMonth: number;         // piek (laatste complete maand) per laadpaal
  sessionsPerCpMonth: number;    // piek aantal sessies per laadpaal per maand
  netRatePerKwh?: number;        // klantvergoeding €/kWh (default 0,581)
  co2KgPerKwh?: number;          // default 0,306
  ereRatePerKwh?: number;        // default 0,10
  hardwareInvestment?: number;   // optioneel; alleen cosmetisch
  customer: DemoCustomer;
  monthsOfHistory?: number;      // default 14
  seed?: number;                 // basis-seed; default 1
  chargerPowerKw?: number;       // voor single-site (config) demo, default 22
  chargerBrand?: string;         // single-site merk
  sites?: DemoSiteSpec[];        // expliciete locatie-indeling (presets); anders single-site uit customer
}

export interface DemoDataset {
  id: string;
  client: PortalClient;
  locations: PortalLocation[];
  kpiRows: PortalDashboardKpiRow[];
  settlements: PortalSettlement[];
  paymentDetails: PortalPaymentDetails;
  invoiceContext: PortalInvoiceContext;
  notifications: DemoNotification[];
  getSessions(opts?: GetPortalSessionsOpts): PortalSessionNet[];
  getMonthBounds(year: number, month: number): { start: string; end: string };
}

type DemoNotification = Pick<Notification, "id" | "type" | "title" | "message" | "read" | "created_at">;

type DemoMonth = {
  year: number;
  month: number;
  kwh: number;
  yield_: number;
  sessions: number;
  status: "paid" | "approved";
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
};

type DemoChargePoint = { id: string; name: string; locationId: string; locationName: string; weight: number };

// ── Locaties ────────────────────────────────────────────────────────────────
function buildLocations(params: DemoParams): PortalLocation[] {
  // Presets leveren een expliciete locatie-indeling; config-demo's krijgen één
  // locatie op het adres van de klant met N laadpalen.
  const specs: DemoSiteSpec[] = params.sites?.length
    ? params.sites
    : singleSite(params);

  let cpCounter = 0;
  return specs.map((spec, li) => {
    const charge_points = Array.from({ length: spec.count }, (_, i) => {
      cpCounter++;
      return {
        id: `${spec.idPrefix}-${i + 1}`,
        name: `${spec.cpPrefix}-${String(i + 1).padStart(2, "0")}`,
        brand: spec.brand,
        model: spec.model,
        type: "ac",
        // ~1 op de 3 in gebruik, rest online, nooit offline/storing.
        status: cpCounter % 3 === 1 ? "in_use" : "online",
        max_power: spec.max_power,
        num_connectors: spec.num_connectors,
      };
    });
    return {
      id: `demo-loc-${li + 1}`,
      name: spec.name,
      address: spec.address,
      city: spec.city,
      postal_code: spec.postal_code,
      property_type: spec.property_type,
      parking_spots: spec.parking_spots,
      has_solar: spec.has_solar,
      solar_capacity_kwp: spec.solar_capacity_kwp,
      charge_points,
    } as PortalLocation;
  });
}

// Eén locatie op het adres van de klant (config-demo): faithful aan de
// configurator, die over één locatie gaat.
function singleSite(params: DemoParams): DemoSiteSpec[] {
  const power = params.chargerPowerKw && params.chargerPowerKw >= 22 ? 22 : 11;
  const brand = params.chargerBrand ?? (power >= 22 ? "Alfen" : "Zaptec");
  const model = power >= 22 ? "Eve Double Pro" : "Pro";
  const c = params.customer;
  return [
    {
      name: c.companyName ? `${c.companyName} - laadplein` : "Laadlocatie",
      address: c.address || "Locatieadres",
      city: c.city || "Nederland",
      postal_code: c.postalCode || "",
      property_type: "bedrijfslocatie",
      parking_spots: Math.max(params.chargePoints * 2, params.chargePoints + 4),
      has_solar: true,
      solar_capacity_kwp: round2(params.chargePoints * 5),
      brand,
      model,
      max_power: power,
      num_connectors: power >= 22 ? 2 : 1,
      count: params.chargePoints,
      idPrefix: "demo-cp-1",
      cpPrefix: "LP",
    },
  ];
}

function chargePointPool(locations: PortalLocation[]): DemoChargePoint[] {
  return locations.flatMap((loc) =>
    (loc.charge_points ?? []).map((cp) => ({
      id: cp.id,
      name: cp.name,
      locationId: loc.id,
      locationName: loc.name,
      // 22 kW-punten trekken zwaardere sessies dan 11 kW-punten
      weight: (cp.max_power ?? 11) >= 22 ? 2 : 1,
    })),
  );
}

// ── Groeicurve ───────────────────────────────────────────────────────────────
function buildMonths(params: DemoParams): DemoMonth[] {
  const months = params.monthsOfHistory ?? DEFAULT_MONTHS;
  const netRate = params.netRatePerKwh ?? DEFAULT_NET_RATE_PER_KWH;
  const peakKwh = params.chargePoints * params.kwhPerCpMonth;
  const peakSessions = Math.max(1, Math.round(params.chargePoints * params.sessionsPerCpMonth));
  const invoiceBase = 100 + ((params.seed ?? 1) % 60);
  const cur = getCurrentMonth();

  // offset = maanden geleden (months..1); index 0 = oudste, months-1 = vorige maand.
  const out: DemoMonth[] = [];
  for (let i = 0; i < months; i++) {
    const offset = months - i; // months..1
    const t = months > 1 ? (months - offset) / (months - 1) : 1; // 0..1
    const factor = RAMP_START + (1 - RAMP_START) * t;
    const kwh = Math.round(peakKwh * factor);
    const sessions = Math.max(1, Math.round(peakSessions * factor));
    const { year, month } = shiftMonth(cur, -offset);
    const status: "paid" | "approved" = offset <= 2 ? "approved" : "paid";
    out.push({
      year,
      month,
      kwh,
      yield_: round2(kwh * netRate),
      sessions,
      status,
      invoiceNumber: `ECF-${year}-${String(invoiceBase + i * 13).padStart(5, "0")}`,
      periodStart: dateOnly(year, month, 1),
      periodEnd: dateOnly(year, month, daysInMonth(year, month)),
    });
  }
  return out;
}

// ── Klant / betaal- en factuurcontext / berichten ───────────────────────────
function buildClient(params: DemoParams, contractStart: { year: number; month: number }): PortalClient {
  const c = params.customer;
  return {
    id: DEMO_CLIENT_ID,
    client_number: c.clientNumber ?? 217,
    company_name: c.companyName || "Demo klant B.V.",
    kvk: c.kvk ?? "63094821",
    btw_number: c.btwNumber ?? "NL863094821B01",
    contact_name: c.contactName || "Contactpersoon",
    contact_email: c.contactEmail || "contact@demo.nl",
    contact_phone: c.contactPhone || "+31330000000",
    billing_address: [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    billing_address_street: c.address || null,
    billing_address_postal: c.postalCode || null,
    billing_address_city: c.city || null,
    country: "Nederland",
    vat_status: "vat_liable",
    vat_status_confirmed_at: iso(new Date(contractStart.year, contractStart.month - 1, 18, 11, 0)),
    contract_start_date: dateOnly(contractStart.year, contractStart.month, 1),
    contract_duration_months: 120,
    revenue_share_percentage: null,
    calculate_ere_enabled: true,
    status: "active",
  } as PortalClient;
}

function buildPaymentDetails(params: DemoParams, contractStart: { year: number; month: number }): PortalPaymentDetails {
  const name = params.customer.companyName || "Demo klant B.V.";
  return {
    client_id: DEMO_CLIENT_ID,
    invoice_email: params.customer.contactEmail || "administratie@demo.nl",
    payout_account_holder_name: name,
    payout_iban_masked: "NL44 RABO •••• 4628",
    payout_iban_last4: "4628",
    payout_bic: "RABONL2U",
    account_holder_confirmed: true,
    status: "complete",
    updated_at: iso(new Date(contractStart.year, contractStart.month - 1, 20, 9, 0)),
  };
}

function buildInvoiceContext(params: DemoParams): PortalInvoiceContext {
  // De org-zijde blijft constant en validatie-compleet (E-Charging B.V.); de
  // payout-naam volgt de klant. De IBAN/BIC blijven bekende geldige fixtures
  // zodat de Wet OB-validatie + factuur-PDF blijven werken.
  return {
    org: {
      name: "E-Charging B.V.",
      kvk: "92418307",
      address: null,
      address_street: "Computerweg 11",
      address_postal: "3821AB",
      address_city: "Amersfoort",
      country: "Nederland",
      email: "administratie@e-charging.nl",
      btw_number: "NL865734201B01",
      iban: "NL20INGB0001234567",
      bic: "INGBNL2A",
    },
    paymentDetails: {
      payout_account_holder_name: params.customer.companyName || "Demo klant B.V.",
      payout_iban: "NL44RABO0317164628",
      payout_bic: "RABONL2U",
    },
  };
}

function daysAgo(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
}

function buildNotifications(
  newestFirst: DemoMonth[],
  locations: PortalLocation[],
  contractStart: { year: number; month: number },
): DemoNotification[] {
  const newest = newestFirst[0];
  const paidRecent = newestFirst.find((m) => m.status === "paid");
  const lastLoc = locations[locations.length - 1];
  const lastCp = (lastLoc?.charge_points ?? [])[(lastLoc?.charge_points?.length ?? 1) - 1];
  const fmt = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2 });
  return [
    {
      id: "demo-msg-1",
      type: "settlement_approved",
      title: `Vergoeding ${monthFullLabel(newest.year, newest.month)} goedgekeurd`,
      message: `Uw vergoeding van €${fmt(newest.yield_)} over ${monthFullLabel(newest.year, newest.month)} is goedgekeurd en wordt binnenkort uitbetaald. Bekijk de specificatie onder Financieel.`,
      read: false,
      created_at: daysAgo(2),
    },
    {
      id: "demo-msg-2",
      type: "charge_point_online",
      title: `Nieuwe laadpaal online op ${lastLoc?.name ?? "uw locatie"}`,
      message: `Laadpunt ${lastCp?.name ?? "het nieuwste laadpunt"} is succesvol opgeleverd en neemt vanaf nu deel aan uw vergoedingsoverzicht.`,
      read: false,
      created_at: daysAgo(6),
    },
    {
      id: "demo-msg-3",
      type: "payout_processed",
      title: paidRecent ? `Uitbetaling ${monthFullLabel(paidRecent.year, paidRecent.month)} verwerkt` : "Uitbetaling verwerkt",
      message: paidRecent
        ? `€${fmt(paidRecent.yield_)} is overgemaakt naar uw rekening eindigend op 4628.`
        : "Uw vergoeding is overgemaakt.",
      read: true,
      created_at: daysAgo(16),
    },
    {
      id: "demo-msg-4",
      type: "welcome",
      title: "Welkom in uw E-Charging portaal",
      message: "Hier volgt u uw laadsessies, vergoedingen en locaties. Vragen? We staan voor u klaar.",
      read: true,
      created_at: iso(new Date(contractStart.year, contractStart.month - 1, 21, 14, 0)),
    },
  ];
}

// ── Deterministische sessie-generator ──────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMonthSessions(
  year: number,
  month: number,
  targetKwh: number,
  targetCount: number,
  pool: DemoChargePoint[],
  netRate: number,
  baseSeed: number,
): PortalSessionNet[] {
  // baseSeed decorreleert scenario's; per kalendermaand blijft het deterministisch.
  const rng = mulberry32((baseSeed ^ (year * 100 + month)) >>> 0);
  const dim = daysInMonth(year, month);
  const rows: PortalSessionNet[] = [];
  const weighted: DemoChargePoint[] = pool.flatMap((cp) => Array(cp.weight).fill(cp));

  const raw: Array<{ day: number; hour: number; minute: number; kwh: number; cp: DemoChargePoint }> = [];
  for (let i = 0; i < targetCount; i++) {
    raw.push({
      day: 1 + Math.floor(rng() * dim),
      hour: 7 + Math.floor(rng() * 14), // 07:00–20:59
      minute: Math.floor(rng() * 60),
      kwh: 6 + rng() * 54,              // 6–60 kWh
      cp: weighted[Math.floor(rng() * weighted.length)],
    });
  }
  const rawSum = raw.reduce((a, r) => a + r.kwh, 0) || 1;
  const scale = targetKwh / rawSum;

  raw.forEach((r, i) => {
    const kwh = round3(r.kwh * scale);
    const started = new Date(year, month - 1, r.day, r.hour, r.minute, 0);
    const durationMin = Math.round(kwh * 6 + rng() * 25);
    const ended = new Date(started.getTime() + durationMin * 60_000);
    rows.push({
      id: `demo-ses-${year}${String(month).padStart(2, "0")}-${i}`,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_minutes: durationMin,
      kwh_delivered: kwh,
      charge_point_id: r.cp.id,
      charge_point_name: r.cp.name,
      location_name: r.cp.locationName,
      vergoeding: round2(kwh * netRate),
    });
  });

  return rows;
}

// ── De builder ───────────────────────────────────────────────────────────────
export function buildDemoDataset(params: DemoParams): DemoDataset {
  const netRate = params.netRatePerKwh ?? DEFAULT_NET_RATE_PER_KWH;
  const co2Rate = params.co2KgPerKwh ?? DEFAULT_CO2_KG_PER_KWH;
  const ereRate = params.ereRatePerKwh ?? DEFAULT_ERE_RATE_PER_KWH;
  const baseSeed = params.seed ?? 1;

  const months = buildMonths(params);
  const newestFirst = [...months].sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
  const contractStart = shiftMonth(getCurrentMonth(), -((params.monthsOfHistory ?? DEFAULT_MONTHS) + 1));

  const locations = buildLocations(params);
  const pool = chargePointPool(locations);
  const cpToLocation = new Map(pool.map((cp) => [cp.id, cp.locationId]));

  const client = buildClient(params, contractStart);

  const kpiRows: PortalDashboardKpiRow[] = newestFirst.map((m) => ({
    year: m.year,
    month: m.month,
    period_start: m.periodStart,
    period_end: m.periodEnd,
    status: m.status,
    is_final: true,
    total_kwh: m.kwh,
    total_customer_cashflow: m.yield_,
    estimated_client_yield: m.yield_,
    co2_kg_avoided: round2(m.kwh * co2Rate),
    ere_estimate: round2(m.kwh * ereRate),
  }));

  const settlements: PortalSettlement[] = newestFirst.map((m) => {
    const next = shiftMonth({ year: m.year, month: m.month }, 1);
    return {
      id: `demo-settlement-${m.year}-${m.month}`,
      client_id: DEMO_CLIENT_ID,
      year: m.year,
      month: m.month,
      period_start: m.periodStart,
      period_end: m.periodEnd,
      status: m.status,
      paid_at: m.status === "paid" ? iso(new Date(next.year, next.month - 1, 14, 9, 30)) : null,
      eflux_reimbursed_at: m.status === "paid" ? iso(new Date(next.year, next.month - 1, 10, 8, 0)) : null,
      invoice_sent_at: null,
      total_kwh: m.kwh,
      total_sessions: m.sessions,
      client_payout: m.yield_,
      vat_rate: 0.21,
      vat_status: "vat_liable",
      invoice_number: m.invoiceNumber,
    };
  });

  const paymentDetails = buildPaymentDetails(params, contractStart);
  const invoiceContext = buildInvoiceContext(params);
  const notifications = buildNotifications(newestFirst, locations, contractStart);

  // Sessies: lazily gegenereerd + gecached binnen deze dataset.
  let cache: PortalSessionNet[] | null = null;
  const peakKwh = params.chargePoints * params.kwhPerCpMonth;
  const peakSessions = Math.max(4, Math.round(params.chargePoints * params.sessionsPerCpMonth));

  function allSessions(): PortalSessionNet[] {
    if (cache) return cache;
    const rows: PortalSessionNet[] = [];
    for (const m of months) {
      rows.push(...generateMonthSessions(m.year, m.month, m.kwh, m.sessions, pool, netRate, baseSeed));
    }
    // Lopende maand: tot en met gisteren, pro-rata van de piek.
    const now = new Date();
    const cur = getCurrentMonth();
    const dim = daysInMonth(cur.year, cur.month);
    const elapsedDays = Math.max(0, now.getDate() - 1);
    if (elapsedDays > 0) {
      const proRataKwh = Math.round((peakKwh * elapsedDays) / dim);
      const proRataCount = Math.max(4, Math.round((peakSessions * elapsedDays) / dim));
      rows.push(
        ...generateMonthSessions(cur.year, cur.month, proRataKwh, proRataCount, pool, netRate, baseSeed)
          .filter((s) => s.started_at !== null && new Date(s.started_at) < now),
      );
    }
    rows.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
    cache = rows;
    return rows;
  }

  function getSessions(opts: GetPortalSessionsOpts = {}): PortalSessionNet[] {
    const { from, to, locationId, chargePointId, limit } = opts;
    return allSessions()
      .filter((s) => !from || (s.started_at ?? "") >= from)
      .filter((s) => !to || (s.started_at ?? "") < to)
      .filter((s) => !chargePointId || s.charge_point_id === chargePointId)
      .filter((s) => !locationId || cpToLocation.get(s.charge_point_id ?? "") === locationId)
      .slice(0, limit ?? 1000);
  }

  function getMonthBounds(year: number, month: number): { start: string; end: string } {
    return {
      start: new Date(year, month - 1, 1).toISOString(),
      end: new Date(year, month, 1).toISOString(),
    };
  }

  return {
    id: params.id,
    client,
    locations,
    kpiRows,
    settlements,
    paymentDetails,
    invoiceContext,
    notifications,
    getSessions,
    getMonthBounds,
  };
}
