import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { DEFAULT_ECHARGING_FEE_PER_KWH, computeSettlement } from "../_shared/settlement-math.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// Settlement-aggregator — bouwt settlements (maandelijks) op uit charging_sessions.
//
// Service-fee model (vervangt revenue-share):
//   echarging_revenue = echarging_fee_per_kwh * total_kwh   (default 0.10, GEEN minimum)
//   client_payout     = gross_revenue - echarging_revenue
// Geen energie-doorbelasting, geen platform-fee, geen opstartkosten, geen 75/25-split.
//
// LET OP: de fee is 0.10 = TIEN CENT per kWh. NIET 0.001.
//
// Logic:
//   - Groepeer sessies per (client_id, year, month) — afgeleid uit started_at
//   - Sla NULL client_id over (ongekoppelde sessies tellen niet) + excluded sessies
//   - UPSERT in settlements; status 'live' (lopende maand) of 'calculated' (afgelopen)
//   - Sla rijen met definitieve status (approved/paid/invoice_*/charged_back) over
//
// Trigger: dagelijks via cron + chaining vanuit eflux-sync, of handmatig POST.
//
// Body (optioneel):
//   { "year": 2026, "month": 5 }                                  → alleen die maand
//   { "fromYear": 2026, "fromMonth": 1, "toYear": 2026, "toMonth": 6 }
//   {}                                                             → huidige + vorige maand

const corsHeaders = CORS_INTERNAL;

interface Range { fromYear: number; fromMonth: number; toYear: number; toMonth: number; }
type AggregateBody = Record<string, unknown>;
type Aggregation = {
  client_id: string;
  total_kwh: number;
  total_sessions: number;
  reimbursement_total: number;
};

function currentMonth(): { year: number; month: number } {
  // Huidige maand in Europe/Amsterdam (DST-correct) — niet in UTC, zodat de 'live'
  // maand rond middernacht/jaargrens bij de juiste NL-kalendermaand hoort.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

function prevMonth(m: { year: number; month: number }) {
  if (m.month === 1) return { year: m.year - 1, month: 12 };
  return { year: m.year, month: m.month - 1 };
}

function monthDateOnly(year: number, month: number): { period_start: string; period_end: string } {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // laatste dag van de maand
  return {
    period_start: startDate.toISOString().slice(0, 10),
    period_end: endDate.toISOString().slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const startedAt = new Date().toISOString();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    let body: AggregateBody = {};
    try { body = await req.json(); } catch (_) { /* empty body OK */ }

    const range = parseRange(body);

    const results: Array<{
      year: number; month: number; clients: number;
      computed: number; skipped: number; errors: number;
    }> = [];

    // Itereer over alle maanden in range
    const months: Array<{ year: number; month: number }> = [];
    let y = range.fromYear, m = range.fromMonth;
    while (y < range.toYear || (y === range.toYear && m <= range.toMonth)) {
      months.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
      if (months.length > 36) break; // safety
    }

    for (const { year, month } of months) {
      const result = await aggregateMonth(supabase, year, month);
      results.push({ year, month, ...result });
    }

    return json({
      status: "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
      range,
      results,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("aggregate-settlements failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});

function parseMonth(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw new Error(`${field} moet een maand tussen 1 en 12 zijn`);
  }
  return n;
}

function parseYear(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2020 || n > 2100) {
    throw new Error(`${field} moet een geldig jaar zijn`);
  }
  return n;
}

function rangeLength(range: Range): number {
  return (range.toYear * 12 + range.toMonth) - (range.fromYear * 12 + range.fromMonth) + 1;
}

function parseRange(body: AggregateBody): Range {
  if (body.year !== undefined || body.month !== undefined) {
    if (body.year === undefined || body.month === undefined) {
      throw new Error("year en month zijn samen verplicht");
    }
    const year = parseYear(body.year, "year");
    const month = parseMonth(body.month, "month");
    return { fromYear: year, fromMonth: month, toYear: year, toMonth: month };
  }

  if (
    body.fromYear !== undefined || body.fromMonth !== undefined
    || body.toYear !== undefined || body.toMonth !== undefined
  ) {
    const range = {
      fromYear: parseYear(body.fromYear, "fromYear"),
      fromMonth: parseMonth(body.fromMonth, "fromMonth"),
      toYear: parseYear(body.toYear, "toYear"),
      toMonth: parseMonth(body.toMonth, "toMonth"),
    };
    const length = rangeLength(range);
    if (length < 1) throw new Error("Periodebereik is ongeldig");
    if (length > 24) throw new Error("Periodebereik mag maximaal 24 maanden bevatten");
    return range;
  }

  // Default: huidige + vorige maand
  const cur = currentMonth();
  const prev = prevMonth(cur);
  return {
    fromYear: prev.year,
    fromMonth: prev.month,
    toYear: cur.year,
    toMonth: cur.month,
  };
}

async function aggregateMonth(supabase: SupabaseClient, year: number, month: number) {
  // Maandgrenzen op Europe/Amsterdam-tijd (DST-correct), via de canonieke SQL-functie
  // amsterdam_month_bounds. Zo telt een sessie op 1 jan 00:30 NL voor januari, niet
  // voor december (zoals bij UTC-bucketing zou gebeuren).
  const { data: boundsRows, error: bErr } = await supabase
    .rpc("amsterdam_month_bounds", { p_year: year, p_month: month });
  if (bErr) throw bErr;
  const bounds = (Array.isArray(boundsRows) ? boundsRows[0] : boundsRows) as
    | { start_ts: string; end_ts: string }
    | undefined;
  if (!bounds) throw new Error(`Geen maandgrenzen voor ${year}-${String(month).padStart(2, "0")}`);
  const start = bounds.start_ts;
  const end = bounds.end_ts;
  const { period_start, period_end } = monthDateOnly(year, month);

  // Opruim-pass: bestaande settlements waarvoor de klant geen gekoppelde sessies meer heeft
  // worden gedelete (alleen live/calculated; definitieve statussen blijven historisch;
  // rijen met een gereserveerd factuurnummer blijven óók staan — doorlopende reeks).
  const { data: existingSettlements } = await supabase
    .from("settlements")
    .select("id, client_id, status, invoice_number, fee_waived")
    .eq("year", year)
    .eq("month", month);

  // Eén keer indexeren op client_id; hergebruikt in de aggregatie-loop i.p.v. een
  // SELECT per klant (N+1). Klanten met sessies worden nooit opgeruimd (disjunct van
  // de orphan-set), dus deze map blijft accuraat voor elke verwerkte klant.
  const existingByClient = new Map<string, { id: string; status: string; fee_waived: boolean }>();
  for (const s of existingSettlements ?? []) {
    existingByClient.set(s.client_id as string, {
      id: s.id as string, status: s.status as string, fee_waived: s.fee_waived === true,
    });
  }

  const clientsWithSessionsInMonth = new Set<string>();
  {
    const { data: ses } = await supabase
      .from("charging_sessions")
      .select("client_id")
      .gte("started_at", start)
      .lt("started_at", end)
      .eq("excluded", false)
      .not("client_id", "is", null);
    for (const s of ses ?? []) {
      if (s.client_id) clientsWithSessionsInMonth.add(s.client_id as string);
    }
  }

  // Opruimen in één DELETE i.p.v. per rij (exact dezelfde rijen).
  const orphanIds = (existingSettlements ?? [])
    .filter((setl) =>
      (setl.status === "live" || setl.status === "calculated")
      && !setl.invoice_number
      && !clientsWithSessionsInMonth.has(setl.client_id as string))
    .map((setl) => setl.id as string);
  if (orphanIds.length > 0) {
    await supabase.from("settlements").delete().in("id", orphanIds);
  }

  // Aggregaten per klant in deze maand (excl. excluded sessies).
  // reimbursement_amount = Road's "Prijs excl BTW" = bron van waarheid voor inkomsten.
  let aggregations: Aggregation[];
  {
    const { data: sessions, error: sErr } = await supabase
      .from("charging_sessions")
      .select("client_id, kwh_delivered, reimbursement_amount")
      .gte("started_at", start)
      .lt("started_at", end)
      .eq("excluded", false)
      .not("client_id", "is", null);

    if (sErr) throw sErr;

    const map = new Map<string, Aggregation>();
    for (const s of sessions ?? []) {
      const k = s.client_id as string;
      if (!map.has(k)) {
        map.set(k, { client_id: k, total_kwh: 0, total_sessions: 0, reimbursement_total: 0 });
      }
      const a = map.get(k)!;
      a.total_kwh += Number(s.kwh_delivered ?? 0);
      a.total_sessions += 1;
      a.reimbursement_total += Number(s.reimbursement_amount ?? 0);
    }
    aggregations = Array.from(map.values());
  }

  // Org-default service-fee per kWh
  const { data: org } = await supabase
    .from("organizations")
    .select("default_echarging_fee_per_kwh")
    .limit(1)
    .maybeSingle();
  const orgFeePerKwh = Number(org?.default_echarging_fee_per_kwh ?? DEFAULT_ECHARGING_FEE_PER_KWH);

  // Per-klant override van de fee + BTW-status (vat_status: vat_liable/kor/private;
  // NULL → legacy vat_liable-boolean als fallback, default BTW-plichtig).
  const clientIds = aggregations.map((a) => a.client_id);
  const clientFee = new Map<string, number>();
  const clientVatLiable = new Map<string, boolean>();
  const clientVatStatus = new Map<string, string | null>();
  const managedClients = new Set<string>();
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, echarging_fee_per_kwh, vat_liable, vat_status, managed")
      .in("id", clientIds);
    for (const c of clients ?? []) {
      const override = c.echarging_fee_per_kwh;
      clientFee.set(c.id as string, override === null || override === undefined ? orgFeePerKwh : Number(override));
      clientVatLiable.set(c.id as string, c.vat_liable !== false); // legacy fallback
      clientVatStatus.set(c.id as string, (c.vat_status as string | null) ?? null);
      if (c.managed !== false) managedClients.add(c.id as string); // 'zonder beheer' → geen opbrengstdeling
    }
  }

  // Lopende maand? Dan status 'live'. Anders 'calculated' (admin kan goedkeuren).
  const isMonthStillRunning = new Date() < new Date(end);

  let computed = 0, skipped = 0, errors = 0;

  for (const a of aggregations) {
    // 'Zonder beheer'-klanten (managed=false) krijgen geen maandelijkse opbrengstdeling.
    if (!managedClients.has(a.client_id)) { skipped++; continue; }
    // BTW-tarief uit vat_status; NULL → legacy vat_liable-fallback
    const vs = clientVatStatus.get(a.client_id) ?? null;
    const vatRate = vs === "vat_liable"
      ? 0.21
      : (vs === "kor" || vs === "private")
      ? 0
      : ((clientVatLiable.get(a.client_id) ?? true) ? 0.21 : 0);

    // Bestaande rij met definitieve status niet overschrijven; fee_waived
    // (handmatige kwijtschelding via set_settlement_fee_waived) preserveren.
    // Uit de vooraf opgebouwde map (geen SELECT per klant).
    const existing = existingByClient.get(a.client_id);

    if (existing && ["approved", "paid", "invoice_sent", "invoice_paid", "charged_back"].includes(existing.status)) {
      skipped++;
      continue;
    }

    // Kwijtgescholden maand → fee 0; snapshot blijft genuld over her-runs heen.
    // Formule via de gedeelde settlement-math module (zelfde getallen, één bron).
    const feeWaived = existing?.fee_waived === true;
    const grossRevenue = a.reimbursement_total;
    const { feePerKwh, echargingRevenue, clientPayout } = computeSettlement({
      totalKwh: a.total_kwh,
      grossRevenue,
      feePerKwh: clientFee.get(a.client_id) ?? orgFeePerKwh,
      feeWaived,
    });

    const newStatus = isMonthStillRunning ? "live" : "calculated";

    const row = {
      client_id: a.client_id,
      year,
      month,
      period_start,
      period_end,
      total_kwh: a.total_kwh,
      total_sessions: a.total_sessions,
      gross_revenue: grossRevenue,
      echarging_fee_per_kwh: feePerKwh, // snapshot (0 bij kwijtschelding)
      echarging_revenue: echargingRevenue,
      client_payout: clientPayout,
      vat_rate: vatRate, // BTW-snapshot (0.21 BTW-plichtig, 0 anders)
      ere_estimate: 0, // informatief; portal toont eigen schatting via Laadbeloning
      status: newStatus,
      fee_waived: feeWaived,
    };

    const { error: upErr } = await supabase
      .from("settlements")
      .upsert(row, { onConflict: "client_id,year,month", ignoreDuplicates: false });

    if (upErr) {
      console.error(`upsert settlement ${a.client_id} ${year}-${month} failed:`, upErr.message);
      errors++;
    } else {
      computed++;
    }
  }

  return { clients: aggregations.length, computed, skipped, errors };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
