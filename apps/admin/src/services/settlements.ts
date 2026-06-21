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

// Eén plek voor de settlement state-machine RPC's. De generated Supabase-types kennen
// deze RPC's (nog) niet, dus de cast leeft hier centraal i.p.v. gedupliceerd per
// call-site in de pagina's. Accepteert één id of een batch (zelfde RPC, één round-trip).
type SettlementRpc =
  | "approve_settlements"
  | "unapprove_settlements"
  | "mark_settlements_eflux_reimbursed"
  | "mark_settlements_paid"
  | "mark_settlements_invoice_sent"
  | "mark_settlements_invoice_paid";

function callSettlementRpc(name: SettlementRpc, ids: string | string[]) {
  const settlement_ids = Array.isArray(ids) ? ids : [ids];
  const rpcClient = supabase as unknown as {
    rpc(name: SettlementRpc, args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
  };
  return rpcClient.rpc(name, { settlement_ids });
}

export const approveSettlement = (ids: string | string[]) => callSettlementRpc("approve_settlements", ids);
// Goedkeuring terugdraaien (approved → calculated). Alleen mogelijk zolang er geen
// geldstroom is gestart; daarna is de afrekening definitief (server-side afgedwongen).
export const unapproveSettlement = (ids: string | string[]) => callSettlementRpc("unapprove_settlements", ids);
export const markSettlementEfluxReimbursed = (ids: string | string[]) => callSettlementRpc("mark_settlements_eflux_reimbursed", ids);
export const markSettlementPaid = (ids: string | string[]) => callSettlementRpc("mark_settlements_paid", ids);
export const markSettlementInvoiceSent = (ids: string | string[]) => callSettlementRpc("mark_settlements_invoice_sent", ids);
export const markSettlementInvoicePaid = (ids: string | string[]) => callSettlementRpc("mark_settlements_invoice_paid", ids);

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
