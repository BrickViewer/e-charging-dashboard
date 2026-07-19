// Doelen (kpi_targets) + de bijbehorende realisatiereeksen voor het
// directie-dashboard. Doelen zijn admin-only (RLS); de realisatie komt uit
// bestaande bronnen: admin_settlement_kpis (omzet/kWh), monthly_financial_overview
// (marge via financialModel), clients.created_at en leads.won_at.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminKPIs, useMonthlyFinancialOverview, useOrganization } from "@/hooks/useAdminData";
import { buildMonthlyFinancials } from "@/services/financialModel";
import type { KpiMetric, KpiTargetRow } from "@/services/kpiTargets";

export function useKpiTargets(year: number) {
  return useQuery({
    queryKey: ["kpi-targets", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_targets")
        .select("metric, year, month, target_value")
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as KpiTargetRow[];
    },
  });
}

// Doelen voor één metric/jaar in één keer vervangen: upsert gezette waarden,
// verwijder gewiste (full-state per metric — simpel en idempotent).
export function useSaveKpiTargets() {
  const qc = useQueryClient();
  const org = useOrganization();
  return useMutation({
    mutationFn: async ({ metric, year, yearTarget, monthTargets }: {
      metric: KpiMetric;
      year: number;
      yearTarget: number | null;
      monthTargets: (number | null)[]; // index 0 = januari
    }) => {
      const orgId = org.data?.id;
      if (!orgId) throw new Error("Organisatie onbekend");
      const { error: delError } = await supabase
        .from("kpi_targets").delete().eq("metric", metric).eq("year", year);
      if (delError) throw delError;
      const rows = [
        ...(yearTarget !== null ? [{ organization_id: orgId, metric, year, month: null as number | null, target_value: yearTarget }] : []),
        ...monthTargets.flatMap((v, i) =>
          v !== null ? [{ organization_id: orgId, metric, year, month: i + 1, target_value: v }] : []),
      ];
      if (rows.length > 0) {
        const { error } = await supabase.from("kpi_targets").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpi-targets"] }),
  });
}

// Realisatie per metric als 12-lange maandreeks (index 0 = januari).
export function useDirectieActuals(year: number) {
  const kpis = useAdminKPIs(year);
  const overviewQ = useMonthlyFinancialOverview(year);

  const newClientsQ = useQuery({
    queryKey: ["directie-new-clients", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("created_at")
        .gte("created_at", `${year}-01-01`)
        .lt("created_at", `${year + 1}-01-01`);
      if (error) throw error;
      const months = Array(12).fill(0) as number[];
      for (const c of data ?? []) {
        const m = new Date(c.created_at as string).getMonth();
        months[m] += 1;
      }
      return months;
    },
  });

  const wonLeadsQ = useQuery({
    queryKey: ["directie-won-leads", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("won_at")
        .not("won_at", "is", null)
        .gte("won_at", `${year}-01-01`)
        .lt("won_at", `${year + 1}-01-01`);
      if (error) throw error;
      const months = Array(12).fill(0) as number[];
      for (const l of data ?? []) {
        const m = new Date(l.won_at as string).getMonth();
        months[m] += 1;
      }
      return months;
    },
  });

  const omzet = Array(12).fill(0) as number[];
  const kwh = Array(12).fill(0) as number[];
  for (const row of kpis.monthlyData ?? []) {
    const idx = Number(row.month) - 1;
    if (idx >= 0 && idx < 12) {
      omzet[idx] = Number(row.revenue) || 0;
      kwh[idx] = Number(row.kwh) || 0;
    }
  }

  // margeExcl komt volledig uit de RPC-rijen; de settlements-parameter stuurt
  // alleen de uitbetaal-buckets (hier niet nodig) → lege lijst volstaat.
  const marge = Array(12).fill(0) as number[];
  for (const m of buildMonthlyFinancials(overviewQ.data, [])) {
    if (m.year === year && m.month >= 1 && m.month <= 12) marge[m.month - 1] = m.margeExcl;
  }

  const months: Record<KpiMetric, number[]> = {
    omzet,
    marge,
    kwh,
    nieuwe_klanten: newClientsQ.data ?? (Array(12).fill(0) as number[]),
    gewonnen_leads: wonLeadsQ.data ?? (Array(12).fill(0) as number[]),
  };

  return {
    months,
    kpis,
    isLoading: overviewQ.isLoading || newClientsQ.isLoading || wonLeadsQ.isLoading,
    isError: overviewQ.isError || newClientsQ.isError || wonLeadsQ.isError,
  };
}
