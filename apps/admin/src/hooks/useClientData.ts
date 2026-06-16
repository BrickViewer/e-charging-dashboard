import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PortalClient, PortalLocation, PortalPaymentDetails, PortalSettlement } from "@/types/db";
import { getPortalSessions } from "@/services/sessions";
import { MONTH_LABELS_SHORT, getCurrentMonth, prevMonth } from "@/lib/period";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { useDemoDatasetOptional } from "@/contexts/demoDatasetContextValue";

export const FINAL_SETTLEMENT_STATUSES = ["approved", "paid", "invoice_sent", "invoice_paid", "charged_back"] as const;

const PORTAL_CLIENT_FIELDS = [
  "id",
  "client_number",
  "company_name",
  "kvk",
  "btw_number",
  "contact_name",
  "contact_email",
  "contact_phone",
  "billing_address",
  "billing_address_street",
  "billing_address_postal",
  "billing_address_city",
  "country",
  "vat_status",
  "vat_status_confirmed_at",
  "contract_start_date",
  "contract_duration_months",
  "revenue_share_percentage",
  "calculate_ere_enabled",
  "status",
].join(", ");

const PORTAL_CHARGE_POINT_FIELDS = [
  "id",
  "name",
  "brand",
  "model",
  "type",
  "status",
  "max_power",
  "num_connectors",
].join(", ");

export const PORTAL_LOCATION_FIELDS = [
  "id",
  "name",
  "address",
  "city",
  "postal_code",
  "property_type",
  "parking_spots",
  "has_solar",
  "solar_capacity_kwp",
  `charge_points(${PORTAL_CHARGE_POINT_FIELDS})`,
].join(", ");

// Netto-only: gross_revenue / echarging_fee_per_kwh / echarging_revenue worden
// bewust NIET naar het portaal gestuurd (de fee mag niet herleidbaar zijn).
const PORTAL_SETTLEMENT_FIELDS = [
  "id",
  "client_id",
  "year",
  "month",
  "period_start",
  "period_end",
  "status",
  "paid_at",
  "eflux_reimbursed_at",
  "invoice_sent_at",
  "total_kwh",
  "total_sessions",
  "client_payout",
  "vat_rate",
  "vat_status",
  "invoice_number",
].join(", ");

// Maandnamen (nl, kort) — hergeëxporteerd uit de centrale periode-util (lib/period)
// zodat bestaande consumers (ClientFinancial e.d.) blijven werken.
export const MONTH_LABELS_NL = MONTH_LABELS_SHORT;

export function useClientProfile() {
  const { user } = useAuth();
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "client-profile"] : ["client-profile", user?.id],
    queryFn: async () => {
      if (demo) return ds!.client;
      const { data, error } = await supabase
        .from("clients")
        .select(PORTAL_CLIENT_FIELDS)
        .eq("portal_user_id", user!.id)
        .single();
      if (error) throw error;
      return data as unknown as PortalClient;
    },
    enabled: demo || !!user,
  });
}

type PortalPaymentDetailsRpcResult = {
  data: PortalPaymentDetails[] | null;
  error: { message: string } | null;
};

type PortalPaymentDetailsRpcClient = {
  rpc: (fn: "get_portal_payment_details") => PromiseLike<PortalPaymentDetailsRpcResult>;
};

export function useClientPaymentDetails(clientId?: string) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "client-payment-details"] : ["client-payment-details", clientId],
    queryFn: async () => {
      if (demo) return ds!.paymentDetails;
      const { data, error } = await (supabase as unknown as PortalPaymentDetailsRpcClient).rpc("get_portal_payment_details");
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: demo || !!clientId,
  });
}

// Extra gegevens voor de self-billing factuur die het portaal niet direct mag lezen:
// E-Charging's factuur-identiteit (org) + de eigen uitbetaalgegevens (incl. volledige
// IBAN). Via de SECURITY DEFINER RPC get_portal_invoice_context (eigen client only).
type PortalInvoiceContextRow = {
  org_name: string | null;
  org_kvk: string | null;
  org_address: string | null;
  org_address_street: string | null;
  org_address_postal: string | null;
  org_address_city: string | null;
  org_country: string | null;
  org_email: string | null;
  org_btw_number: string | null;
  org_iban: string | null;
  org_bic: string | null;
  payout_account_holder_name: string | null;
  payout_iban: string | null;
  payout_bic: string | null;
};

type PortalInvoiceContextRpcClient = {
  rpc: (fn: "get_portal_invoice_context") => PromiseLike<{ data: PortalInvoiceContextRow[] | null; error: { message: string } | null }>;
};

export interface PortalInvoiceContext {
  org: {
    name: string | null;
    kvk: string | null;
    address: string | null;
    address_street: string | null;
    address_postal: string | null;
    address_city: string | null;
    country: string | null;
    email: string | null;
    btw_number: string | null;
    iban: string | null;
    bic: string | null;
  };
  paymentDetails: {
    payout_account_holder_name: string | null;
    payout_iban: string | null;
    payout_bic: string | null;
  };
}

export function usePortalInvoiceContext(clientId?: string) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "portal-invoice-context"] : ["portal-invoice-context", clientId],
    queryFn: async (): Promise<PortalInvoiceContext | null> => {
      if (demo) return ds!.invoiceContext;
      const { data, error } = await (supabase as unknown as PortalInvoiceContextRpcClient).rpc("get_portal_invoice_context");
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return {
        org: {
          name: row.org_name,
          kvk: row.org_kvk,
          address: row.org_address,
          address_street: row.org_address_street,
          address_postal: row.org_address_postal,
          address_city: row.org_address_city,
          country: row.org_country,
          email: row.org_email,
          btw_number: row.org_btw_number,
          iban: row.org_iban,
          bic: row.org_bic,
        },
        paymentDetails: {
          payout_account_holder_name: row.payout_account_holder_name,
          payout_iban: row.payout_iban,
          payout_bic: row.payout_bic,
        },
      };
    },
    enabled: demo || !!clientId,
  });
}

export function useClientLocations(clientId?: string) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "client-locations"] : ["client-locations", clientId],
    queryFn: async () => {
      if (demo) return ds!.locations;
      const { data, error } = await supabase
        .from("locations")
        .select(PORTAL_LOCATION_FIELDS)
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as unknown as PortalLocation[];
    },
    enabled: demo || !!clientId,
  });
}

export function useClientSessions(clientId?: string, limit?: number) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "client-sessions", limit] : ["client-sessions", clientId, limit],
    // Netto-only via RPC; bruto/fee bereiken de browser niet.
    queryFn: async () => (demo ? ds!.getSessions({ limit }) : getPortalSessions({ limit })),
    enabled: demo || !!clientId,
  });
}

export function useClientSettlements(clientId?: string) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "client-settlements"] : ["client-settlements", clientId],
    queryFn: async () => {
      if (demo) return ds!.settlements;
      const { data, error } = await supabase
        .from("settlements")
        .select(PORTAL_SETTLEMENT_FIELDS)
        .eq("client_id", clientId!)
        .in("status", [...FINAL_SETTLEMENT_STATUSES])
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PortalSettlement[];
    },
    enabled: demo || !!clientId,
  });
}

export const DEFAULT_ERE_RATE_PER_KWH = 0.10;

// ERE's zijn een klantkeuze in het portaal. Als de klant dit aanzet,
// tellen we een indicatieve EUR-waarde mee op basis van geleverde kWh.

// Periode-filter voor dashboard — bepaalt welke settlements meegerekend worden.
export type DashboardPeriod =
  | { type: "ttm" }                                  // laatste 12 maanden
  | { type: "month"; year: number; month: number }   // specifieke maand
  | { type: "year"; year: number }                   // heel jaar
  | { type: "all" };                                 // sinds begin

export interface PortalDashboardKpiRow {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  status: string;
  is_final: boolean;
  total_kwh: number;
  total_customer_cashflow: number;
  estimated_client_yield: number;
  co2_kg_avoided: number;
  ere_estimate: number;
}

export function periodLabel(p: DashboardPeriod): string {
  if (p.type === "ttm") return "laatste 12 maanden";
  if (p.type === "month") return `${MONTH_LABELS_NL[p.month - 1]} ${p.year}`;
  if (p.type === "year") return `heel ${p.year}`;
  return "sinds begin";
}

function filterKpiRowsByPeriod(rows: PortalDashboardKpiRow[], p: DashboardPeriod): PortalDashboardKpiRow[] {
  if (p.type === "all") return rows;
  if (p.type === "ttm") {
    const sorted = [...rows].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
    return sorted.slice(0, 12);
  }
  if (p.type === "month") {
    return rows.filter(s => s.year === p.year && s.month === p.month);
  }
  return rows.filter(s => s.year === p.year);
}

export function usePortalDashboardKpis(clientId?: string) {
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  return useQuery({
    queryKey: demo ? ["demo", ds?.id, "portal-dashboard-kpis"] : ["portal-dashboard-kpis", clientId],
    queryFn: async () => {
      if (demo) return ds!.kpiRows;
      const rpcClient = supabase as unknown as {
        rpc(name: "get_portal_dashboard_kpis"): Promise<{ data: unknown; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("get_portal_dashboard_kpis");
      if (error) throw error;
      return (data ?? []) as PortalDashboardKpiRow[];
    },
    enabled: demo || !!clientId,
  });
}

// Beschikbare periode-opties op basis van bestaande settlements + huidige tijd.
export function useAvailablePeriods(clientId?: string): DashboardPeriod[] {
  const { data: rows } = usePortalDashboardKpis(clientId);
  const all = rows ?? [];
  const cur = getCurrentMonth();

  const options: DashboardPeriod[] = [
    { type: "ttm" },
  ];

  // Huidige maand (live concept) — alleen als er een settlement voor bestaat
  if (all.some(s => s.year === cur.year && s.month === cur.month)) {
    options.push({ type: "month", year: cur.year, month: cur.month });
  }

  // Heel huidig jaar
  if (all.some(s => s.year === cur.year)) {
    options.push({ type: "year", year: cur.year });
  }

  // Alle eerdere maanden (uniek, gesorteerd nieuw → oud) — sla huidige maand over
  const seenMonths = new Set<string>();
  const sortedDesc = [...all].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  for (const s of sortedDesc) {
    if (s.year === cur.year && s.month === cur.month) continue;
    const key = `${s.year}-${s.month}`;
    if (seenMonths.has(key)) continue;
    seenMonths.add(key);
    options.push({ type: "month", year: s.year, month: s.month });
  }

  // Eerdere hele jaren (uniek, behalve huidig)
  const seenYears = new Set<number>();
  for (const s of all) {
    if (s.year === cur.year) continue;
    if (seenYears.has(s.year)) continue;
    seenYears.add(s.year);
    options.push({ type: "year", year: s.year });
  }

  options.push({ type: "all" });
  return options;
}

export function useClientKPIs(
  clientId?: string,
  period: DashboardPeriod = { type: "ttm" },
  calculateEreEnabled = false,
) {
  const { data: dashboardRows } = usePortalDashboardKpis(clientId);
  const { data: locations } = useClientLocations(clientId);

  const cur = getCurrentMonth();
  const prev = prevMonth(cur);

  const rows = dashboardRows ?? [];
  const currentSettlement = rows.find(s => s.year === cur.year && s.month === cur.month);
  const prevSettlement = rows.find(s => s.year === prev.year && s.month === prev.month);

  const allChargePoints = locations?.flatMap(l => l.charge_points || []) || [];
  const onlineCount = allChargePoints.filter(cp => cp.status === "online" || cp.status === "in_use").length;
  const totalCount = allChargePoints.length;
  const offlineCount = allChargePoints.filter(cp => cp.status === "offline" || cp.status === "error").length;

  const currentEreEstimate = calculateEreEnabled ? Number(currentSettlement?.total_kwh || 0) * DEFAULT_ERE_RATE_PER_KWH : 0;
  const prevEreEstimate = calculateEreEnabled ? Number(prevSettlement?.total_kwh || 0) * DEFAULT_ERE_RATE_PER_KWH : 0;
  const currentEarnings = Number(currentSettlement?.estimated_client_yield || 0) + currentEreEstimate;
  const prevEarnings = Number(prevSettlement?.estimated_client_yield || 0) + prevEreEstimate;
  const earningsChange = prevEarnings > 0 ? ((currentEarnings - prevEarnings) / prevEarnings) * 100 : 0;

  const currentKwh = Number(currentSettlement?.total_kwh || 0);
  const prevKwh = Number(prevSettlement?.total_kwh || 0);
  const kwhChange = prevKwh > 0 ? ((currentKwh - prevKwh) / prevKwh) * 100 : 0;

  // Aggregaten over geselecteerde periode (default: laatste 12 maanden)
  const inPeriod = filterKpiRowsByPeriod(rows, period);
  const ttmKwh = inPeriod.reduce((s, q) => s + Number(q.total_kwh || 0), 0);
  const ttmCustomerCashflow = inPeriod.reduce(
    (s, q) => s + Number(q.total_customer_cashflow ?? q.estimated_client_yield ?? 0),
    0,
  );
  const ttmBasePayout = inPeriod.reduce((s, q) => s + Number(q.estimated_client_yield || 0), 0);
  const ttmEreCo2 = inPeriod.reduce((s, q) => s + Number(q.co2_kg_avoided || 0), 0);
  const ttmEreClientEstimate = calculateEreEnabled ? ttmKwh * DEFAULT_ERE_RATE_PER_KWH : 0;
  const ttmPayout = ttmBasePayout + ttmEreClientEstimate;

  // Totaal uitbetaald = levenslang daadwerkelijk aan klant uitgekeerd (status 'paid'),
  // ongeacht de geselecteerde periode. Puur client_payout (geen ERE, dat loopt via Laadbeloning).
  const totalPaidOut = rows
    .filter((q) => q.status === "paid")
    .reduce((s, q) => s + Number(q.estimated_client_yield || 0), 0);

  const pastSettlements = rows.filter(s => !(s.year === cur.year && s.month === cur.month));
  const avgEarnings = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.estimated_client_yield || 0), 0) / pastSettlements.length
    : 1000;
  const avgKwh = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0) / pastSettlements.length
    : 3000;
  const hasIndicativeData = inPeriod.some(s => !s.is_final);

  return {
    totalEarned: currentEarnings,
    kwhLoaded: currentKwh,
    chargePointsOnline: onlineCount,
    chargePointsTotal: totalCount,
    offlineCount,
    earningsChange,
    kwhChange,
    avgEarnings,
    avgKwh,
    settlements: rows,
    currentMonth: cur,
    hasIndicativeData,

    // Cockpit-gauges over geselecteerde periode (default: laatste 12 maanden)
    ttmKwh,
    ttmCustomerCashflow,
    ttmPayout,
    totalPaidOut,
    ttmEreCo2,
    ttmEreClientEstimate,
    calculateEreEnabled,
    periodLabel: periodLabel(period),
  };
}
