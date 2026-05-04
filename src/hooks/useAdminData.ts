import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function getCurrentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function shiftQuarter({ year, quarter }: { year: number; quarter: number }, delta: number) {
  const total = year * 4 + (quarter - 1) + delta;
  return { year: Math.floor(total / 4), quarter: (total % 4) + 1 };
}

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
        .from("quarterly_settlements")
        .select("*")
        .eq("client_id", clientId!)
        .order("year", { ascending: false })
        .order("quarter", { ascending: false });
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
        .from("quarterly_settlements")
        .select("*, clients(company_name)")
        .order("year", { ascending: false })
        .order("quarter", { ascending: false });
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
        .select("*, clients(company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useQuoteById(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, clients(company_name)")
        .eq("id", id!)
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
        .select("*, clients(company_name), charge_points(name), locations(name)")
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

export function useUnlinkedLocations() {
  return useQuery({
    queryKey: ["unlinked-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .is("client_id", null)
        .order("name");
      if (error) throw error;
      return data;
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
        .select("*, clients(company_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminKPIs() {
  const { data: clients } = useAllClients();
  const { data: settlements } = useAllSettlements();
  const { data: chargePoints } = useAllChargePoints();

  const activeClients = clients?.filter(c => c.status === "actief") || [];
  const totalChargePoints = chargePoints?.length || 0;
  const onlineCPs = chargePoints?.filter((cp: any) => cp.status === "online") || [];
  const offlineCPs = chargePoints?.filter((cp: any) => cp.status === "offline" || cp.status === "error") || [];

  const cur = getCurrentQuarter();
  const prev = shiftQuarter(cur, -1);

  const currentSettlements = settlements?.filter(s => s.year === cur.year && s.quarter === cur.quarter) || [];
  const prevSettlements = settlements?.filter(s => s.year === prev.year && s.quarter === prev.quarter) || [];

  const quarterRevenue = currentSettlements.reduce((sum, s) => sum + Number(s.echarging_revenue || 0), 0);
  const prevQuarterRevenue = prevSettlements.reduce((sum, s) => sum + Number(s.echarging_revenue || 0), 0);
  const totalKwh = currentSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0);
  const prevKwh = prevSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0);
  const totalRevenue = currentSettlements.reduce((sum, s) => sum + Number(s.gross_revenue || 0), 0);

  const revenueChange = prevQuarterRevenue > 0 ? ((quarterRevenue - prevQuarterRevenue) / prevQuarterRevenue) * 100 : 0;
  const kwhChange = prevKwh > 0 ? ((totalKwh - prevKwh) / prevKwh) * 100 : 0;

  const quarterlyData: { period: string; revenue: number; kwh: number; clients: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const q = shiftQuarter(cur, -i);
    const periodSettlements = settlements?.filter(s => s.year === q.year && s.quarter === q.quarter) || [];
    quarterlyData.push({
      period: `Q${q.quarter} '${String(q.year).slice(2)}`,
      revenue: periodSettlements.reduce((sum, s) => sum + Number(s.echarging_revenue || 0), 0),
      kwh: periodSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0),
      clients: periodSettlements.length,
    });
  }

  return {
    activeClients: activeClients.length,
    totalChargePoints,
    onlineChargePoints: onlineCPs.length,
    offlineChargePoints: offlineCPs.length,
    quarterRevenue,
    revenueChange,
    totalKwh,
    kwhChange,
    totalRevenue,
    quarterlyData,
    currentQuarter: cur,
  };
}
