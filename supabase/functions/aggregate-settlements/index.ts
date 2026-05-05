import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Settlement-aggregator — bouwt quarterly_settlements rows op uit charging_sessions.
//
// Logic:
//   - Groepeer sessies per (client_id, year, quarter) — afgeleid uit started_at
//   - Sla NULL client_id over (ongekoppelde sessies tellen niet)
//   - Sla excluded sessions over
//   - Per quartaal: sum kwh, gross, reimbursement, client_share, echarging_share
//   - UPSERT in quarterly_settlements met status='calculated'
//   - Sla quarters over die al status='approved'/'paid'/'overdue' hebben — niet overschrijven
//
// Trigger:
//   - Dagelijks via cron (02:00 UTC)
//   - Of handmatig via POST naar deze function (admin "Recompute settlements"-knop)
//
// Body (optioneel):
//   { "year": 2026, "quarter": 1 }    → alleen dit kwartaal
//   { "fromYear": 2026, "fromQuarter": 1, "toYear": 2026, "toQuarter": 4 }
//   {}                                  → huidig + vorig kwartaal (default)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Range { fromYear: number; fromQuarter: number; toYear: number; toQuarter: number; }

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}

function prevQuarter(q: { year: number; quarter: number }) {
  if (q.quarter === 1) return { year: q.year - 1, quarter: 4 };
  return { year: q.year, quarter: q.quarter - 1 };
}

function quarterDates(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3; // 0,3,6,9
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1)); // first of next quarter
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function quarterDateOnly(year: number, quarter: number): { period_start: string; period_end: string } {
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(Date.UTC(year, startMonth, 1));
  // Last day of last month in quarter
  const endDate = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    period_start: startDate.toISOString().slice(0, 10),
    period_end: endDate.toISOString().slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* empty body OK */ }

    let range: Range;
    if (body.year && body.quarter) {
      range = { fromYear: body.year, fromQuarter: body.quarter, toYear: body.year, toQuarter: body.quarter };
    } else if (body.fromYear && body.fromQuarter && body.toYear && body.toQuarter) {
      range = {
        fromYear: body.fromYear, fromQuarter: body.fromQuarter,
        toYear: body.toYear, toQuarter: body.toQuarter,
      };
    } else {
      // Default: huidig + vorig kwartaal
      const cur = currentQuarter();
      const prev = prevQuarter(cur);
      range = {
        fromYear: prev.year, fromQuarter: prev.quarter,
        toYear: cur.year, toQuarter: cur.quarter,
      };
    }

    const results: Array<{
      year: number; quarter: number; clients: number;
      computed: number; skipped: number; errors: number;
    }> = [];

    // Itereer over alle quarters in range
    const quarters: Array<{ year: number; quarter: number }> = [];
    let y = range.fromYear, q = range.fromQuarter;
    while (y < range.toYear || (y === range.toYear && q <= range.toQuarter)) {
      quarters.push({ year: y, quarter: q });
      q++;
      if (q > 4) { q = 1; y++; }
      if (quarters.length > 40) break; // safety
    }

    for (const { year, quarter } of quarters) {
      const result = await aggregateQuarter(supabase, year, quarter);
      results.push({ year, quarter, ...result });
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

async function aggregateQuarter(supabase: any, year: number, quarter: number) {
  const { start, end } = quarterDates(year, quarter);
  const { period_start, period_end } = quarterDateOnly(year, quarter);

  // Aggregeer per client uit sessies in dit kwartaal (excl. excluded sessies)
  const { data: aggs, error } = await supabase.rpc("aggregate_client_sessions_for_quarter", {
    _start: start,
    _end: end,
  });

  // Fallback: als de RPC niet bestaat, doe het in TypeScript
  let aggregations: Array<{
    client_id: string;
    total_kwh: number;
    total_sessions: number;
    gross_revenue: number;
    total_energy_cost: number;
    reimbursement_total: number;
    client_share: number;
    echarging_share: number;
  }>;

  if (error || !aggs) {
    // TS-fallback: handmatig groeperen
    const { data: sessions, error: sErr } = await supabase
      .from("charging_sessions")
      .select("client_id, kwh_delivered, gross_revenue, energy_cost, reimbursement_amount, net_margin, client_share, echarging_share")
      .gte("started_at", start)
      .lt("started_at", end)
      .eq("excluded", false)
      .not("client_id", "is", null);

    if (sErr) throw sErr;

    const map = new Map<string, any>();
    for (const s of sessions ?? []) {
      const k = s.client_id as string;
      if (!map.has(k)) {
        map.set(k, {
          client_id: k,
          total_kwh: 0, total_sessions: 0, gross_revenue: 0,
          total_energy_cost: 0, reimbursement_total: 0,
          client_share: 0, echarging_share: 0,
        });
      }
      const a = map.get(k);
      a.total_kwh += Number(s.kwh_delivered ?? 0);
      a.total_sessions += 1;
      a.gross_revenue += Number(s.gross_revenue ?? 0);
      a.total_energy_cost += Number(s.energy_cost ?? 0);
      // Authoritative reimbursement als beschikbaar, anders fallback op net_margin
      a.reimbursement_total += Number(s.reimbursement_amount ?? s.net_margin ?? 0);
      a.client_share += Number(s.client_share ?? 0);
      a.echarging_share += Number(s.echarging_share ?? 0);
    }
    aggregations = Array.from(map.values());
  } else {
    aggregations = aggs;
  }

  let computed = 0, skipped = 0, errors = 0;

  for (const a of aggregations) {
    // Check of bestaande row voor deze (client, year, quarter) niet 'approved' of 'paid' is
    const { data: existing } = await supabase
      .from("quarterly_settlements")
      .select("id, status")
      .eq("client_id", a.client_id)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle();

    if (existing && (existing.status === "approved" || existing.status === "paid" || existing.status === "charged_back")) {
      skipped++;
      continue;
    }

    const row = {
      client_id: a.client_id,
      year,
      quarter,
      period_start,
      period_end,
      total_kwh: a.total_kwh,
      total_sessions: a.total_sessions,
      gross_revenue: a.gross_revenue,
      total_energy_cost: a.total_energy_cost,
      total_platform_fee: 0,        // TODO: berekenen op basis van #sockets × maandprijs
      total_transaction_fees: 0,    // TODO: uit Road's CPO subscription invoice
      ere_commission: 0,
      net_margin: a.reimbursement_total,
      client_payout: a.client_share,
      echarging_revenue: a.echarging_share,
      ere_estimate: 0,              // TODO: uit Road of via NEa-rate × kWh
      status: existing?.status ?? "calculated",
    };

    const { error: upErr } = await supabase
      .from("quarterly_settlements")
      .upsert(row, { onConflict: "client_id,year,quarter", ignoreDuplicates: false });

    if (upErr) {
      console.error(`upsert settlement ${a.client_id} Q${quarter} ${year} failed:`, upErr.message);
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
