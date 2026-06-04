import { supabase } from "@/integrations/supabase/client";
import type { PortalSessionNet } from "@/types/db";

// Netto-only sessies voor het PORTAAL via de SECURITY DEFINER RPC get_portal_sessions.
// De bruto reimbursement_amount + de fee blijven server-side; de browser krijgt
// alleen het netto `vergoeding`-veld. Scoped op de eigen client (uit auth.uid()).
// Gebruikt door de Sessies-pagina, het locatiedetail én de factuur-download.
export interface GetPortalSessionsOpts {
  from?: string | null;
  to?: string | null;
  locationId?: string | null;
  chargePointId?: string | null;
  limit?: number;
}

type PortalSessionsRpcClient = {
  rpc: (
    fn: "get_portal_sessions",
    args: {
      p_from: string | null;
      p_to: string | null;
      p_location_id: string | null;
      p_charge_point_id: string | null;
      p_limit: number;
    },
  ) => PromiseLike<{ data: PortalSessionNet[] | null; error: { message: string } | null }>;
};

export async function getPortalSessions(opts: GetPortalSessionsOpts = {}): Promise<PortalSessionNet[]> {
  const { data, error } = await (supabase as unknown as PortalSessionsRpcClient).rpc("get_portal_sessions", {
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
    p_location_id: opts.locationId ?? null,
    p_charge_point_id: opts.chargePointId ?? null,
    p_limit: opts.limit ?? 1000,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSessions(clientId?: string, limit = 1000) {
  let query = supabase
    .from("charging_sessions")
    .select("*, clients(client_number, company_name), charge_points(name), locations(name)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

type MonthBoundsRpcClient = {
  rpc: (
    fn: "amsterdam_month_bounds",
    args: { p_year: number; p_month: number },
  ) => PromiseLike<{ data: { start_ts: string; end_ts: string }[] | null; error: { message: string } | null }>;
};

// Maandgrenzen [start, end) als UTC-instant op Europe/Amsterdam-tijd (DST-correct),
// via de canonieke SQL-functie amsterdam_month_bounds. Eén bron van waarheid: de
// settlement-aggregatie en de factuur-specificatie bucketen sessies identiek —
// geen UTC-misattributie rond maand-/jaargrenzen (1 jan 00:30 NL hoort bij januari).
export async function getAmsterdamMonthBounds(year: number, month: number): Promise<{ start: string; end: string }> {
  const { data, error } = await (supabase as unknown as MonthBoundsRpcClient).rpc("amsterdam_month_bounds", {
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error(`Geen maandgrenzen voor ${year}-${String(month).padStart(2, "0")}`);
  return { start: row.start_ts, end: row.end_ts };
}

// Laadsessies die exact één maand-settlement vormen — zelfde filter als de
// aggregate-settlements edge function (client_id + started_at binnen de NL-maand
// + excluded=false). Gebruikt voor de transactiespecificatie op de factuur.
export async function getSettlementSessions(clientId: string, year: number, month: number) {
  const { start, end } = await getAmsterdamMonthBounds(year, month);
  return supabase
    .from("charging_sessions")
    .select("started_at, duration_minutes, kwh_delivered, reimbursement_amount, charge_points(name), locations(name)")
    .eq("client_id", clientId)
    .eq("excluded", false)
    .gte("started_at", start)
    .lt("started_at", end)
    .order("started_at", { ascending: true });
}

export async function getSessionsByChargePoint(chargePointId: string, limit = 10) {
  return supabase
    .from("charging_sessions")
    .select("*")
    .eq("charge_point_id", chargePointId)
    .order("started_at", { ascending: false })
    .limit(limit);
}
