import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useClientProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["client-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("portal_user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useClientLocations(clientId?: string) {
  return useQuery({
    queryKey: ["client-locations", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*, charge_points(*)")
        .eq("client_id", clientId!);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useClientSessions(clientId?: string, limit?: number) {
  return useQuery({
    queryKey: ["client-sessions", clientId, limit],
    queryFn: async () => {
      let query = supabase
        .from("charging_sessions")
        .select("*, charge_points(name)")
        .eq("client_id", clientId!)
        .order("started_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useClientSettlements(clientId?: string) {
  return useQuery({
    queryKey: ["client-settlements", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_settlements")
        .select("*")
        .eq("client_id", clientId!)
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useClientKPIs(clientId?: string) {
  const { data: settlements } = useClientSettlements(clientId);
  const { data: locations } = useClientLocations(clientId);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);

  const currentSettlement = settlements?.find(s => s.month?.slice(0, 7) === currentMonth);
  const prevSettlement = settlements?.find(s => s.month?.slice(0, 7) === prevMonth);

  const allChargePoints = locations?.flatMap(l => (l as any).charge_points || []) || [];
  const onlineCount = allChargePoints.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
  const totalCount = allChargePoints.length;

  const currentEarnings = currentSettlement?.client_payout || 0;
  const prevEarnings = prevSettlement?.client_payout || 0;
  const earningsChange = prevEarnings > 0 ? ((Number(currentEarnings) - Number(prevEarnings)) / Number(prevEarnings)) * 100 : 0;

  const currentKwh = currentSettlement?.total_kwh || 0;
  const prevKwh = prevSettlement?.total_kwh || 0;
  const kwhChange = Number(prevKwh) > 0 ? ((Number(currentKwh) - Number(prevKwh)) / Number(prevKwh)) * 100 : 0;

  // Bereken gemiddelden uit vorige maanden (excl. huidige maand)
  const pastSettlements = settlements?.filter(s => s.month?.slice(0, 7) !== currentMonth) || [];
  const avgEarnings = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.client_payout || 0), 0) / pastSettlements.length
    : 1000; // fallback sample
  const avgKwh = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0) / pastSettlements.length
    : 3000; // fallback sample

  return {
    totalEarned: Number(currentEarnings),
    kwhLoaded: Number(currentKwh),
    chargePointsOnline: onlineCount,
    chargePointsTotal: totalCount,
    offlineCount: totalCount - onlineCount,
    earningsChange,
    kwhChange,
    avgEarnings,
    avgKwh,
    settlements: settlements || [],
  };
}
