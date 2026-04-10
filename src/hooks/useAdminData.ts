import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAllClients() {
  return useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, locations(*, charge_points(*))");
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
        .select("*, locations(name, address, client_id, clients(company_name))");
      if (error) throw error;
      return data;
    },
  });
}

export function useAllSettlements() {
  return useQuery({
    queryKey: ["admin-settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_settlements")
        .select("*, clients(company_name)")
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllQuotes() {
  return useQuery({
    queryKey: ["admin-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminKPIs() {
  const { data: clients } = useAllClients();
  const { data: settlements } = useAllSettlements();

  const activeClients = clients?.filter(c => c.status === "actief") || [];
  const totalChargePoints = clients?.flatMap(c =>
    (c as any).locations?.flatMap((l: any) => l.charge_points || []) || []
  ).length || 0;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentSettlements = settlements?.filter(s => s.month?.slice(0, 7) === currentMonth) || [];

  const mrr = currentSettlements.reduce((sum, s) => sum + Number(s.echarging_revenue || 0), 0);
  const totalKwh = currentSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0);
  const avgMargin = activeClients.length > 0 ? mrr / activeClients.length : 0;

  return {
    activeClients: activeClients.length,
    totalChargePoints,
    mrr,
    totalKwh,
    avgMargin,
  };
}
