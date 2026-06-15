// Demo-omgeving voor sales: een volledig fictief maar overtuigend klantportaal.
// Alle data komt uit dit bestand; in demo-modus wordt GEEN enkele Supabase-
// dataquery gedaan (de portal-RPC's zouden voor een sales-gebruiker sowieso
// leeg zijn — SECURITY DEFINER, gescoped op portal_user_id).
//
// Ontwerpprincipes:
// - Verankerd aan "nu": de maandreeks schuift mee met de echte kalender, zodat
//   de demo nooit veroudert. De groeicurve (index 1 = vorige maand) is vast.
// - Deterministisch: sessies worden per maand met een vaste seed gegenereerd
//   (mulberry32), dus elke reload toont exact dezelfde demo.
// - Intern consistent: sessie-sommen per maand = settlement-totalen = KPI-rijen
//   (zelfde kWh/yield), CO₂ = kWh × 0,306 (zelfde factor als de echte RPC),
//   en de factuur-fixtures passeren de Wet OB-validatie zodat de
//   factuur-download in de demo écht werkt.
// - Curve afgestemd op de gauge-schaal (niceQuarterMax): het openingsbeeld
//   (laatste complete maand) vult de meters 70-86%.
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

const NET_RATE_PER_KWH = 0.581;   // netto vergoeding per kWh (fictief, realistisch)
const CO2_KG_PER_KWH = 0.306;     // identiek aan de echte dashboard-RPC
const ERE_RATE_PER_KWH = 0.10;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const iso = (d: Date) => d.toISOString();
const dateOnly = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

// ── Groeicurve: index = maanden geleden (1 = vorige/laatste complete maand) ──
// kWh-reeks loopt op van ~2.450 naar 5.610; de twee recentste maanden staan
// nog op "approved" (onderweg), de rest is uitbetaald.
const MONTH_CURVE: Array<{ offset: number; kwh: number; sessions: number; status: "paid" | "approved"; invoiceSeq: string }> = [
  { offset: 14, kwh: 2450, sessions: 128, status: "paid", invoiceSeq: "00112" },
  { offset: 13, kwh: 2710, sessions: 141, status: "paid", invoiceSeq: "00123" },
  { offset: 12, kwh: 2980, sessions: 154, status: "paid", invoiceSeq: "00137" },
  { offset: 11, kwh: 3240, sessions: 166, status: "paid", invoiceSeq: "00151" },
  { offset: 10, kwh: 3530, sessions: 180, status: "paid", invoiceSeq: "00166" },
  { offset: 9, kwh: 3780, sessions: 192, status: "paid", invoiceSeq: "00182" },
  { offset: 8, kwh: 4080, sessions: 206, status: "paid", invoiceSeq: "00199" },
  { offset: 7, kwh: 4370, sessions: 219, status: "paid", invoiceSeq: "00217" },
  { offset: 6, kwh: 4650, sessions: 232, status: "paid", invoiceSeq: "00236" },
  { offset: 5, kwh: 4890, sessions: 243, status: "paid", invoiceSeq: "00014" },
  { offset: 4, kwh: 5120, sessions: 254, status: "paid", invoiceSeq: "00031" },
  { offset: 3, kwh: 5340, sessions: 264, status: "paid", invoiceSeq: "00049" },
  { offset: 2, kwh: 5480, sessions: 271, status: "approved", invoiceSeq: "00068" },
  { offset: 1, kwh: 5610, sessions: 277, status: "approved", invoiceSeq: "00088" },
];

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

function buildMonths(): DemoMonth[] {
  const cur = getCurrentMonth();
  return MONTH_CURVE.map((row) => {
    const { year, month } = shiftMonth(cur, -row.offset);
    return {
      year,
      month,
      kwh: row.kwh,
      yield_: round2(row.kwh * NET_RATE_PER_KWH),
      sessions: row.sessions,
      status: row.status,
      invoiceNumber: `ECF-${year}-${row.invoiceSeq}`,
      periodStart: dateOnly(year, month, 1),
      periodEnd: dateOnly(year, month, daysInMonth(year, month)),
    };
  });
}

const DEMO_MONTHS: DemoMonth[] = buildMonths();
const NEWEST_FIRST = [...DEMO_MONTHS].sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));

// ── Klant ─────────────────────────────────────────────────────────────────
const contractStart = shiftMonth(getCurrentMonth(), -15);

export const DEMO_CLIENT: PortalClient = {
  id: DEMO_CLIENT_ID,
  client_number: 217,
  company_name: "Hofstede Vastgoed B.V.",
  kvk: "63094821",
  btw_number: "NL863094821B01",
  contact_name: "Mark Hofstede",
  contact_email: "m.hofstede@hofstedevastgoed.nl",
  contact_phone: "+31334567890",
  billing_address: "Stationsplein 12, 3818LE Amersfoort",
  billing_address_street: "Stationsplein 12",
  billing_address_postal: "3818LE",
  billing_address_city: "Amersfoort",
  country: "Nederland",
  vat_status: "vat_liable",
  vat_status_confirmed_at: iso(new Date(contractStart.year, contractStart.month - 1, 18, 11, 0)),
  contract_start_date: dateOnly(contractStart.year, contractStart.month, 1),
  contract_duration_months: 120,
  revenue_share_percentage: null,
  calculate_ere_enabled: true,
  status: "active",
};

// ── Locaties + laadpunten (8 online, 4 in gebruik, 0 storingen) ───────────
export const DEMO_LOCATIONS: PortalLocation[] = [
  {
    id: "demo-loc-1",
    name: "Hofstede Huis",
    address: "Stationsplein 12",
    city: "Amersfoort",
    postal_code: "3818 LE",
    property_type: "kantoor",
    parking_spots: 40,
    has_solar: true,
    solar_capacity_kwp: 36,
    charge_points: [
      { id: "demo-cp-101", name: "HH-01", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "online", max_power: 22, num_connectors: 2 },
      { id: "demo-cp-102", name: "HH-02", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "in_use", max_power: 22, num_connectors: 2 },
      { id: "demo-cp-103", name: "HH-03", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "online", max_power: 22, num_connectors: 2 },
      { id: "demo-cp-104", name: "HH-04", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "online", max_power: 22, num_connectors: 2 },
    ],
  },
  {
    id: "demo-loc-2",
    name: "Wooncomplex De Eempoort",
    address: "Eemplein 84",
    city: "Amersfoort",
    postal_code: "3812 EA",
    property_type: "wooncomplex",
    parking_spots: 64,
    has_solar: false,
    solar_capacity_kwp: null,
    charge_points: [
      { id: "demo-cp-201", name: "EP-01", brand: "Zaptec", model: "Pro", type: "ac", status: "online", max_power: 11, num_connectors: 1 },
      { id: "demo-cp-202", name: "EP-02", brand: "Zaptec", model: "Pro", type: "ac", status: "online", max_power: 11, num_connectors: 1 },
      { id: "demo-cp-203", name: "EP-03", brand: "Zaptec", model: "Pro", type: "ac", status: "in_use", max_power: 11, num_connectors: 1 },
      { id: "demo-cp-204", name: "EP-04", brand: "Zaptec", model: "Pro", type: "ac", status: "online", max_power: 11, num_connectors: 1 },
      { id: "demo-cp-205", name: "EP-05", brand: "Zaptec", model: "Pro", type: "ac", status: "in_use", max_power: 11, num_connectors: 1 },
      { id: "demo-cp-206", name: "EP-06", brand: "Zaptec", model: "Pro", type: "ac", status: "online", max_power: 11, num_connectors: 1 },
    ],
  },
  {
    id: "demo-loc-3",
    name: "Bedrijvenpark Calveen",
    address: "Nijverheidsweg-Noord 60",
    city: "Amersfoort",
    postal_code: "3812 PM",
    property_type: "bedrijventerrein",
    parking_spots: 28,
    has_solar: true,
    solar_capacity_kwp: 52.8,
    charge_points: [
      { id: "demo-cp-301", name: "BC-01", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "online", max_power: 22, num_connectors: 2 },
      { id: "demo-cp-302", name: "BC-02", brand: "Alfen", model: "Eve Double Pro", type: "ac", status: "in_use", max_power: 22, num_connectors: 2 },
    ],
  },
];

type DemoChargePoint = { id: string; name: string; locationId: string; locationName: string; weight: number };

const DEMO_CHARGE_POINTS: DemoChargePoint[] = DEMO_LOCATIONS.flatMap((loc) =>
  (loc.charge_points ?? []).map((cp) => ({
    id: cp.id,
    name: cp.name,
    locationId: loc.id,
    locationName: loc.name,
    // 22 kW-punten trekken zwaardere sessies dan 11 kW-punten
    weight: (cp.max_power ?? 11) >= 22 ? 2 : 1,
  })),
);

// ── KPI-rijen (dashboard) en settlements (financieel) — zelfde 14 maanden ──
export const DEMO_KPI_ROWS: PortalDashboardKpiRow[] = NEWEST_FIRST.map((m) => ({
  year: m.year,
  month: m.month,
  period_start: m.periodStart,
  period_end: m.periodEnd,
  status: m.status,
  is_final: true,
  total_kwh: m.kwh,
  total_customer_cashflow: m.yield_,
  estimated_client_yield: m.yield_,
  co2_kg_avoided: round2(m.kwh * CO2_KG_PER_KWH),
  ere_estimate: round2(m.kwh * ERE_RATE_PER_KWH),
}));

export const DEMO_SETTLEMENTS: PortalSettlement[] = NEWEST_FIRST.map((m) => {
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

// ── Betaal- en factuurcontext (validatie-compleet, dus de PDF werkt) ───────
export const DEMO_PAYMENT_DETAILS: PortalPaymentDetails = {
  client_id: DEMO_CLIENT_ID,
  invoice_email: "administratie@hofstedevastgoed.nl",
  payout_account_holder_name: "Hofstede Vastgoed B.V.",
  payout_iban_masked: "NL44 RABO •••• 4628",
  payout_iban_last4: "4628",
  payout_bic: "RABONL2U",
  account_holder_confirmed: true,
  status: "complete",
  updated_at: iso(new Date(contractStart.year, contractStart.month - 1, 20, 9, 0)),
};

export const DEMO_INVOICE_CONTEXT: PortalInvoiceContext = {
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
    payout_account_holder_name: "Hofstede Vastgoed B.V.",
    payout_iban: "NL44RABO0317164628",
    payout_bic: "RABONL2U",
  },
};

// ── Berichten ──────────────────────────────────────────────────────────────
type DemoNotification = Pick<Notification, "id" | "type" | "title" | "message" | "read" | "created_at">;

function daysAgo(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
}

export function buildDemoNotifications(): DemoNotification[] {
  const newest = NEWEST_FIRST[0];
  const paidRecent = NEWEST_FIRST.find((m) => m.status === "paid");
  return [
    {
      id: "demo-msg-1",
      type: "settlement_approved",
      title: `Vergoeding ${monthFullLabel(newest.year, newest.month)} goedgekeurd`,
      message: `Uw vergoeding van €${newest.yield_.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} over ${monthFullLabel(newest.year, newest.month)} is goedgekeurd en wordt binnenkort uitbetaald. Bekijk de specificatie onder Financieel.`,
      read: false,
      created_at: daysAgo(2),
    },
    {
      id: "demo-msg-2",
      type: "charge_point_online",
      title: "Nieuwe laadpaal online op Bedrijvenpark Calveen",
      message: "Laadpunt BC-02 is succesvol opgeleverd en neemt vanaf nu deel aan uw vergoedingsoverzicht.",
      read: false,
      created_at: daysAgo(6),
    },
    {
      id: "demo-msg-3",
      type: "payout_processed",
      title: paidRecent ? `Uitbetaling ${monthFullLabel(paidRecent.year, paidRecent.month)} verwerkt` : "Uitbetaling verwerkt",
      message: paidRecent
        ? `€${paidRecent.yield_.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} is overgemaakt naar uw rekening eindigend op 4628.`
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

const CP_TO_LOCATION = new Map(DEMO_CHARGE_POINTS.map((cp) => [cp.id, cp.locationId]));

function generateMonthSessions(year: number, month: number, targetKwh: number, targetCount: number): PortalSessionNet[] {
  const rng = mulberry32(year * 100 + month);
  const dim = daysInMonth(year, month);
  const rows: PortalSessionNet[] = [];

  // Gewogen laadpunt-pool (22 kW-punten vaker)
  const pool: DemoChargePoint[] = DEMO_CHARGE_POINTS.flatMap((cp) => Array(cp.weight).fill(cp));

  // Ruwe sessies trekken, daarna kWh schalen zodat de maandsom exact klopt.
  const raw: Array<{ day: number; hour: number; minute: number; kwh: number; cp: DemoChargePoint }> = [];
  for (let i = 0; i < targetCount; i++) {
    raw.push({
      day: 1 + Math.floor(rng() * dim),
      hour: 7 + Math.floor(rng() * 14),       // 07:00–20:59
      minute: Math.floor(rng() * 60),
      kwh: 6 + rng() * 54,                     // 6–60 kWh
      cp: pool[Math.floor(rng() * pool.length)],
    });
  }
  const rawSum = raw.reduce((a, r) => a + r.kwh, 0);
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
      vergoeding: round2(kwh * NET_RATE_PER_KWH),
    });
  });

  return rows;
}

let sessionCache: PortalSessionNet[] | null = null;

function allDemoSessions(): PortalSessionNet[] {
  if (sessionCache) return sessionCache;
  const rows: PortalSessionNet[] = [];

  for (const m of DEMO_MONTHS) {
    rows.push(...generateMonthSessions(m.year, m.month, m.kwh, m.sessions));
  }

  // Lopende maand: tot en met gisteren, pro-rata van een doorzettende groei.
  const now = new Date();
  const cur = getCurrentMonth();
  const dim = daysInMonth(cur.year, cur.month);
  const elapsedDays = Math.max(0, now.getDate() - 1);
  if (elapsedDays > 0) {
    const proRataKwh = Math.round((5700 * elapsedDays) / dim);
    const proRataCount = Math.max(4, Math.round((280 * elapsedDays) / dim));
    rows.push(
      ...generateMonthSessions(cur.year, cur.month, proRataKwh, proRataCount)
        // alleen verstreken dagen — de demo toont geen sessies in de toekomst
        .filter((s) => s.started_at !== null && new Date(s.started_at) < now),
    );
  }

  rows.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  sessionCache = rows;
  return rows;
}

/** Zelfde signatuur als getPortalSessions, maar dan op demo-data. */
export function getDemoSessions(opts: GetPortalSessionsOpts = {}): PortalSessionNet[] {
  const { from, to, locationId, chargePointId, limit } = opts;
  return allDemoSessions()
    .filter((s) => !from || (s.started_at ?? "") >= from)
    .filter((s) => !to || (s.started_at ?? "") < to)
    .filter((s) => !chargePointId || s.charge_point_id === chargePointId)
    .filter((s) => !locationId || CP_TO_LOCATION.get(s.charge_point_id ?? "") === locationId)
    .slice(0, limit ?? 1000);
}

/** Lokale maandgrenzen volstaan in de demo: sessies liggen ruim binnen de maand. */
export function getDemoMonthBounds(year: number, month: number): { start: string; end: string } {
  return {
    start: new Date(year, month - 1, 1).toISOString(),
    end: new Date(year, month, 1).toISOString(),
  };
}
