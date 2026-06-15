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

// Goedkeuring terugdraaien (approved → calculated). Alleen mogelijk zolang er
// geen geldstroom is gestart; daarna is de afrekening definitief.
export async function unapproveSettlement(id: string) {
  const rpcClient = supabase as unknown as {
    rpc(name: "unapprove_settlements", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("unapprove_settlements", { settlement_ids: [id] });
}

// Service-fee voor één maand kwijtschelden of herstellen. Alleen mogelijk bij
// status 'live'/'calculated' (server-side afgedwongen). Kwijtschelden nult de
// fee-snapshot (fee 0, payout = bruto); herstellen herleidt het tarief van de
// klant/organisatie en herrekent de bedragen.
export async function setSettlementFeeWaived(id: string, waived: boolean) {
  const rpcClient = supabase as unknown as {
    rpc(
      name: "set_settlement_fee_waived",
      args: { p_settlement_id: string; p_waived: boolean },
    ): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc("set_settlement_fee_waived", { p_settlement_id: id, p_waived: waived });
}
