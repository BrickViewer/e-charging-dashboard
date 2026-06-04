import { supabase } from "@/integrations/supabase/client";

export async function getSettlements(clientId?: string) {
  let query = supabase
    .from("settlements")
    .select("*, clients(client_number, company_name)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function approveSettlement(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "approve_settlements", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("approve_settlements", { settlement_ids: [id] });
}

export async function markSettlementEfluxReimbursed(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "mark_settlements_eflux_reimbursed", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("mark_settlements_eflux_reimbursed", { settlement_ids: [id] });
}

export async function markSettlementPaid(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "mark_settlements_paid", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("mark_settlements_paid", { settlement_ids: [id] });
}

export async function markSettlementInvoiceSent(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "mark_settlements_invoice_sent", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("mark_settlements_invoice_sent", { settlement_ids: [id] });
}

export async function markSettlementInvoicePaid(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "mark_settlements_invoice_paid", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("mark_settlements_invoice_paid", { settlement_ids: [id] });
}
