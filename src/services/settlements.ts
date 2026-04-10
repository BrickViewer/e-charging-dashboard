import { supabase } from "@/integrations/supabase/client";

export async function getSettlements(clientId?: string) {
  let query = supabase
    .from("monthly_settlements")
    .select("*, clients(company_name)")
    .order("month", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function approveSettlement(id: string) {
  return supabase.from("monthly_settlements").update({ status: "approved" }).eq("id", id);
}

export async function markSettlementPaid(id: string) {
  return supabase.from("monthly_settlements").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
}
