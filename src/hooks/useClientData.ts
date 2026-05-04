import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function getCurrentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function getPreviousQuarter() {
  const { year, quarter } = getCurrentQuarter();
  if (quarter === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: quarter - 1 };
}

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
        .from("quarterly_settlements")
        .select("*")
        .eq("client_id", clientId!)
        .order("year", { ascending: false })
        .order("quarter", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

// 1 ERE = 1 kg vermeden CO2; 1 kWh ≈ 0.306 ERE op netgemiddelde 46.4% groen
// (1 kWh × 0.464 × 183 g/MJ × 3.6 MJ/kWh ÷ 1000 ≈ 0.306 kg CO2)
const ERE_KG_PER_KWH = 0.306;

export function useClientKPIs(clientId?: string) {
  const { data: settlements } = useClientSettlements(clientId);
  const { data: locations } = useClientLocations(clientId);
  const { data: profile } = useClientProfile();

  const cur = getCurrentQuarter();
  const prev = getPreviousQuarter();

  const currentSettlement = settlements?.find(s => s.year === cur.year && s.quarter === cur.quarter);
  const prevSettlement = settlements?.find(s => s.year === prev.year && s.quarter === prev.quarter);

  const allChargePoints = locations?.flatMap(l => (l as any).charge_points || []) || [];
  const onlineCount = allChargePoints.filter((cp: any) => cp.status === "online" || cp.status === "in_use").length;
  const totalCount = allChargePoints.length;
  const offlineCount = allChargePoints.filter((cp: any) => cp.status === "offline" || cp.status === "error").length;

  const currentEarnings = Number(currentSettlement?.client_payout || 0);
  const prevEarnings = Number(prevSettlement?.client_payout || 0);
  const earningsChange = prevEarnings > 0 ? ((currentEarnings - prevEarnings) / prevEarnings) * 100 : 0;

  const currentKwh = Number(currentSettlement?.total_kwh || 0);
  const prevKwh = Number(prevSettlement?.total_kwh || 0);
  const kwhChange = prevKwh > 0 ? ((currentKwh - prevKwh) / prevKwh) * 100 : 0;

  // Aggregaties over laatste 4 kwartalen (= laatste 12 maanden)
  const sortedSettlements = (settlements ?? [])
    .slice()
    .sort((a, b) => (b.year * 4 + b.quarter) - (a.year * 4 + a.quarter));
  const last4 = sortedSettlements.slice(0, 4);

  const ttmKwh = last4.reduce((s, q) => s + Number(q.total_kwh || 0), 0);
  const ttmGross = last4.reduce((s, q) => s + Number(q.gross_revenue || 0), 0);
  const ttmPayout = last4.reduce((s, q) => s + Number(q.client_payout || 0), 0);
  const ttmEreEstimate = last4.reduce((s, q) => s + Number(q.ere_estimate || 0), 0);
  const ttmEreCommission = last4.reduce((s, q) => s + Number(q.ere_commission || 0), 0);

  const ttmEreCo2 = ttmKwh * ERE_KG_PER_KWH;

  const revShareRatio = (Number(profile?.revenue_share_percentage ?? 75)) / 100;
  const ttmEreClientRevenue = (ttmEreEstimate - ttmEreCommission) * revShareRatio;

  const pastSettlements = settlements?.filter(s => !(s.year === cur.year && s.quarter === cur.quarter)) || [];
  const avgEarnings = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.client_payout || 0), 0) / pastSettlements.length
    : 1000;
  const avgKwh = pastSettlements.length > 0
    ? pastSettlements.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0) / pastSettlements.length
    : 3000;

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
    settlements: settlements || [],
    currentQuarter: cur,

    // Cockpit-gauges over de laatste 12 maanden (4 kwartalen)
    ttmKwh,
    ttmGross,
    ttmPayout,
    ttmEreCo2,
    ttmEreClientRevenue,
  };
}
