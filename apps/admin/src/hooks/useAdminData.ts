import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AdminChargePoint,
  ClientInvitationSummary,
  ClientWithRelations,
  CronJobStatus,
  Organization,
  RecentInvitation,
} from "@/types/db";
import { getCurrentMonth, monthShortLabel } from "@/lib/period";
import { isActiveChargePoint } from "@/services/chargePoints";

export function useAllClients() {
  return useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // Gekoppeld contact (companies/persons) meelezen zodat de lijst het canonieke
        // bedrijf/persoon kan tonen + naar het Bedrijfsdossier kan deeplinken; de
        // gedenormaliseerde clients.company_name/contact_* blijven de fallback (trigger-synced).
        // Locaties versmald tot bestaan + per laadpunt id/status. AdminFinancial heeft z'n eigen full-row.
        .select(
          "*, companies(id, name, kvk, city), persons(id, full_name, email), locations(id, archived_at, charge_points(id, status, operational_status)), client_invitations(id, status, invited_at, expires_at)",
        );
      if (error) throw error;
      // Pak de meest recente invitation per klant (Supabase select geeft array)
      return ((data ?? []) as ClientWithRelations[]).map((c) => {
        const invites = c.client_invitations ?? [];
        const latest = invites
          .slice()
          .sort(
            (a, b) =>
              new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime(),
          )[0];
        // Gearchiveerde (in e-Flux verwijderde) locaties niet meetellen/tonen; en per
        // locatie ook de in e-Flux verwijderde laadpunten (operational_status='archived') weglaten.
        const locations = (c.locations ?? [])
          .filter((l) => !l.archived_at)
          .map((l) => ({ ...l, charge_points: (l.charge_points ?? []).filter(isActiveChargePoint) }));
        return { ...c, locations, latest_invitation: latest ?? null };
      });
    },
  });
}

export function useClientById(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-client", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, locations(*, charge_points(*))")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      // Gearchiveerde (in e-Flux verwijderde) locaties niet tonen op de klantpagina; en per
      // locatie ook de in e-Flux verwijderde laadpunten (operational_status='archived') weglaten.
      if (data?.locations) {
        data.locations = data.locations
          .filter((l) => !l.archived_at)
          .map((l) => ({ ...l, charge_points: (l.charge_points ?? []).filter(isActiveChargePoint) }));
      }
      return data;
    },
  });
}

export function useClientSettlements(clientId: string | undefined) {
  return useQuery({
    queryKey: ["admin-client-settlements", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlements")
        .select("*")
        .eq("client_id", clientId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useClientActivity(clientId: string | undefined) {
  return useQuery({
    queryKey: ["admin-client-activity", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useClientSessions(clientId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ["admin-client-sessions", clientId, limit],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*, charge_points(name), locations(name)")
        .eq("client_id", clientId!)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useAllChargePoints() {
  return useQuery({
    queryKey: ["admin-chargepoints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("*, locations(name, address, client_id, clients(client_number, company_name))");
      if (error) throw error;
      // In e-Flux verwijderde laadpunten (operational_status='archived') niet tonen/tellen.
      return (data ?? []).filter(isActiveChargePoint);
    },
  });
}

export function useAllSettlements() {
  return useQuery({
    queryKey: ["admin-settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlements")
        .select("*, clients(client_number, company_name, payment_onboarding_status, kvk, btw_number)")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// CFO-reconciliatie per maand (eFlux-vergoeding ↔ klant-uitkeringen + onze fee). Admin-only RPC.
export interface MonthlyFinancialRow {
  year: number; month: number;
  eflux_credit_incl: number; eflux_credit_excl: number; eflux_usage_incl: number; eflux_net_incl: number;
  sessions_reimb_excl: number; sessions_reimb_incl: number; sessions_kwh: number; sessions_count: number;
  recon_diff_incl: number; tie_out_ok: boolean;
  gross_total: number; payout_total: number; activation_total: number; fee_total: number; assigned_reimb: number; unassigned_reimb: number;
  cnt_live: number; cnt_calculated: number; cnt_approved: number; cnt_paid: number;
  cnt_invoice_sent: number; cnt_invoice_paid: number; cnt_charged_back: number;
  settlements_total: number; settlements_final: number;
  recon_status: "sluit" | "verschil" | "geen_factuur" | "lopend";
}
export function useMonthlyFinancialOverview(year?: number) {
  return useQuery({
    queryKey: ["admin-financial-overview", year ?? null],
    queryFn: async () => {
      const rpcClient = supabase as unknown as {
        rpc(name: "monthly_financial_overview", args: { p_year: number | null }):
          Promise<{ data: MonthlyFinancialRow[] | null; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("monthly_financial_overview", { p_year: year ?? null });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Ruwe eFlux-facturen (cpo-credit = vergoeding, cpo-usage = kosten). RLS: admin-only tabel.
export function useEfluxInvoices() {
  return useQuery({
    queryKey: ["admin-eflux-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eflux_invoices")
        .select("id, year, month, type, total_credit_amount_with_vat, total_amount_with_vat, is_paid, is_ready, has_error, identifier, account_name, currency, synced_at")
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("type", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Huidige per-locatie tarief (laatste valid_from) uit tariff_profiles.
export function useLocationTariff(locationId: string | undefined) {
  return useQuery({
    queryKey: ["admin-location-tariff", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariff_profiles")
        .select("id, echarging_fee_per_kwh, charge_rate_per_kwh, energy_cost_per_kwh, start_tariff, idle_tariff_per_min, valid_from")
        .eq("location_id", locationId!)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAllSessions(limit = 1000) {
  return useQuery({
    queryKey: ["admin-sessions", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*, clients(client_number, company_name), charge_points(name), locations(name)")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ["admin-organization"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// Org-update mutation — vervangt de losse `supabase.from("organizations").update(...)`-calls
// in AdminSettings (spiegelt useUpdateCompany/useUpdatePerson uit useContacts).
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Organization> }) => {
      const { error } = await supabase.from("organizations").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-organization"] }); },
  });
}

// Team- en toegangsbeheer (admin-only) — voorheen inline in AdminSettings. `enabled` gate
// zodat manager/viewer deze admin-only reads niet afvuren.
export function useTeamMembers(enabled = true) {
  return useQuery({
    queryKey: ["admin-profiles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUserRoles(enabled = true) {
  return useQuery({
    queryKey: ["admin-user-roles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAccessRequests(enabled = true) {
  return useQuery({
    queryKey: ["admin-access-requests"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("access_requests").select("*").eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUnlinkedLocations() {
  return useQuery({
    queryKey: ["unlinked-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .is("client_id", null)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

// Alle locaties met laadpunten + klant-info — voor de admin Locaties-pagina.
export function useAllLocations() {
  return useQuery({
    queryKey: ["admin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*, charge_points(id, status, connectivity_state, operational_status), clients(id, client_number, company_name, status)")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useLocationById(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-location", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*, charge_points(*), clients(id, client_number, company_name, status, contact_name, contact_email)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useLocationSessions(locationId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["admin-location-sessions", locationId, limit],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*, charge_points(name), clients(client_number, company_name)")
        .eq("location_id", locationId!)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

// Laatste invitation per klant — voor status-indicator + "opnieuw versturen"-knop.
export function useClientInvitation(clientId: string | undefined) {
  return useQuery({
    queryKey: ["admin-client-invitation", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invitations")
        .select("id, client_id, email, status, invited_at, expires_at, accepted_at, invited_by, resend_count, last_resend_at, created_at")
        .eq("client_id", clientId!)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });
}

export function useLatestEfluxSync() {
  return useQuery({
    queryKey: ["admin-latest-sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eflux_sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000, // 1 min
  });
}

export function useCronStatus() {
  return useQuery({
    queryKey: ["admin-cron-status"],
    queryFn: async () => {
      const rpcClient = supabase as unknown as {
        rpc(name: "admin_get_cron_status"): Promise<{ data: CronJobStatus[] | null; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("admin_get_cron_status");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function useRecentInvitations(limit = 5) {
  return useQuery({
    queryKey: ["admin-recent-invitations", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invitations")
        .select("id, client_id, email, status, invited_at, expires_at, accepted_at, invited_by, resend_count, last_resend_at, created_at, clients(client_number, company_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as RecentInvitation[]);
    },
  });
}

export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ["admin-activity", limit],
    enabled: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*, clients(client_number, company_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

interface AdminSettlementKpis {
  available_years: number[];
  monthly: { month: number; revenue: number; kwh: number; clients: number }[];
  cur: { month_revenue: number; total_kwh: number; total_revenue: number };
  prev: { month_revenue: number; kwh: number };
}

export function useAdminKPIs(chartYear?: number) {
  const { data: clients } = useAllClients();
  const { data: chargePoints } = useAllChargePoints();

  // getCurrentMonth buiten de memo (goedkoop) zodat de maandgrens nooit verstart.
  const { year: curYear, month: curMonth } = getCurrentMonth();
  // Jaar-navigatie voor de omzetgrafiek: standaard het huidige jaar.
  const selectedYear = chartYear ?? curYear;

  // Settlement-aggregatie server-side via admin_settlement_kpis i.p.v. álle settlements
  // client-side ophalen + reducen (het dashboard trok voorheen de hele settlements-tabel).
  // De huidige maand wordt in NL-tijd (getCurrentMonth) bepaald en meegegeven, zodat de
  // server exact dezelfde maandgrens spiegelt. Jaar-stappen doet nu een kleine, gecachete
  // RPC-call i.p.v. een client-filter (geen gedrags-/correctheidswijziging).
  const { data: kpi } = useQuery({
    queryKey: ["admin-settlement-kpis", selectedYear, curYear, curMonth],
    queryFn: async () => {
      const rpcClient = supabase as unknown as {
        rpc(
          name: "admin_settlement_kpis",
          args: { p_year: number; p_cur_year: number; p_cur_month: number },
        ): Promise<{ data: AdminSettlementKpis | null; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("admin_settlement_kpis", {
        p_year: selectedYear,
        p_cur_year: curYear,
        p_cur_month: curMonth,
      });
      if (error) throw error;
      return data;
    },
  });

  return useMemo(() => {
  const cur = { year: curYear, month: curMonth };
  // Verwijderde (geanonimiseerde) profielen tellen niet als klant — net als in de klantenlijst.
  const visibleClients = (clients ?? []).filter(c => c.status !== "verwijderd");
  // Actieve klant = klant met minstens één gekoppelde locatie. Totaal = alle (niet-verwijderde)
  // klanten, met én zonder gekoppelde locatie.
  const activeClients = visibleClients.filter(c => (c.locations?.length ?? 0) > 0);
  const totalChargePoints = chargePoints?.length || 0;
  const typedChargePoints = (chargePoints ?? []) as AdminChargePoint[];
  // Alleen laadpunten op een aan-een-klant-gekoppelde locatie tellen mee als "in gebruik".
  const linkedCPs = typedChargePoints.filter(cp => cp.locations?.client_id != null);
  const onlineCPs = linkedCPs.filter(cp => cp.status === "online" || cp.status === "in_use");
  const offlineCPs = linkedCPs.filter(cp => cp.status === "offline" || cp.status === "error");

  // Settlement-afgeleiden uit de RPC; labels (monthShortLabel) + %-deltas blijven client-side
  // identiek. Tijdens laden: 12 nul-maanden + alleen het huidige jaar (zoals voorheen).
  const monthlyRows = kpi?.monthly?.length
    ? kpi.monthly
    : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, kwh: 0, clients: 0 }));
  const monthlyData = monthlyRows.map(r => ({
    period: monthShortLabel(selectedYear, r.month),
    revenue: Number(r.revenue || 0),
    kwh: Number(r.kwh || 0),
    clients: Number(r.clients || 0),
  }));
  const availableYears = kpi?.available_years ?? [cur.year];

  const monthRevenue = Number(kpi?.cur?.month_revenue || 0);
  const prevMonthRevenue = Number(kpi?.prev?.month_revenue || 0);
  const totalKwh = Number(kpi?.cur?.total_kwh || 0);
  const prevKwh = Number(kpi?.prev?.kwh || 0);
  const totalRevenue = Number(kpi?.cur?.total_revenue || 0);

  const revenueChange = prevMonthRevenue > 0 ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;
  const kwhChange = prevKwh > 0 ? ((totalKwh - prevKwh) / prevKwh) * 100 : 0;

  return {
    activeClients: activeClients.length,
    totalClients: visibleClients.length,
    totalChargePoints,
    linkedChargePoints: linkedCPs.length,
    onlineChargePoints: onlineCPs.length,
    offlineChargePoints: offlineCPs.length,
    monthRevenue,
    revenueChange,
    totalKwh,
    kwhChange,
    totalRevenue,
    monthlyData,
    currentMonth: cur,
    selectedChartYear: selectedYear,
    availableYears,
  };
  }, [clients, chargePoints, kpi, curYear, curMonth, selectedYear]);
}

export type LeadEstimateMode = "computed" | "manual";
export interface AvgRevenuePerChargePoint {
  value: number | null;          // effectieve waarde die de leads-module gebruikt
  source: "computed" | "manual" | "fallback" | "none";
  computedValue: number | null;  // rauw berekend gemiddelde (mode-onafhankelijk), voor weergave
  manualValue: number | null;    // ingestelde vaste waarde
  mode: LeadEstimateMode;         // gekozen bron
  months: number;
  charge_points: number;
}

// Gemiddelde E-Charging service-fee-omzet per actieve laadpaal per jaar (server-side
// geaggregeerd via avg_echarging_revenue_per_charge_point). De RPC lost de effectieve
// waarde op basis van de gekozen modus (computed/manual) op; 'source' zegt welk getal het werd.
export function useAvgRevenuePerChargePoint() {
  return useQuery({
    queryKey: ["admin-avg-revenue-per-cp"],
    staleTime: 1000 * 60 * 30, // verandert traag; één gedeelde call voor alle lead-kaarten
    queryFn: async (): Promise<AvgRevenuePerChargePoint> => {
      const rpcClient = supabase as unknown as {
        rpc(name: "avg_echarging_revenue_per_charge_point"): Promise<{
          data: {
            value: number | null; source: string; computed_value: number | null;
            manual_value: number | null; mode: string; months: number; charge_points: number;
          } | null;
          error: Error | null;
        }>;
      };
      const { data, error } = await rpcClient.rpc("avg_echarging_revenue_per_charge_point");
      if (error) throw error;
      const src = data?.source;
      return {
        value: data?.value != null ? Number(data.value) : null,
        source: src === "computed" || src === "manual" || src === "fallback" ? src : "none",
        computedValue: data?.computed_value != null ? Number(data.computed_value) : null,
        manualValue: data?.manual_value != null ? Number(data.manual_value) : null,
        mode: data?.mode === "manual" ? "manual" : "computed",
        months: Number(data?.months ?? 0),
        charge_points: Number(data?.charge_points ?? 0),
      };
    },
  });
}
