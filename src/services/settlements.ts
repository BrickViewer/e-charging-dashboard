import { supabase } from "@/integrations/supabase/client";

export async function getSettlements(clientId?: string) {
  let query = supabase
    .from("quarterly_settlements")
    .select("*, clients(company_name)")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function approveSettlement(id: string) {
  return supabase.from("quarterly_settlements").update({ status: "approved" }).eq("id", id);
}

export async function markSettlementPaid(id: string) {
  return supabase
    .from("quarterly_settlements")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);
}
