import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveSettlement as approveSettlementRpc,
  unapproveSettlement as unapproveSettlementRpc,
  markSettlementEfluxReimbursed as markSettlementEfluxReimbursedRpc,
  markSettlementPaid as markSettlementPaidRpc,
  markSettlementInvoiceSent as markSettlementInvoiceSentRpc,
  markSettlementInvoicePaid as markSettlementInvoicePaidRpc,
} from "@/services/settlements";
import type { QuarterlySettlement } from "@/types/db";
import { settlementCustomerCashflow } from "./clientDetailUtils";

// Gedeelde afreken-acties voor de klantdetailpagina. `approvingId` blijft één gelifte waarde
// (één actie tegelijk in flight = huidig gedrag).
export function useClientSettlementActions(id: string | undefined) {
  const queryClient = useQueryClient();
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const approveSettlement = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const { error } = await approveSettlementRpc(settlementId);
      if (error) throw error;
      toast.success("Afrekening goedgekeurd - zichtbaar voor klant in portaal");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Goedkeuring mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  // Goedkeuring terugdraaien (approved → calculated) — kan zolang er geen
  // geldstroom is gestart; de RPC dwingt dat server-side af.
  const unapproveSettlement = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const { error } = await unapproveSettlementRpc(settlementId);
      if (error) throw error;
      toast.success("Goedkeuring teruggedraaid — afrekening staat weer op 'berekend'");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terugdraaien mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  const executeMoneyFlow = async (settlement: QuarterlySettlement) => {
    const settlementId = settlement.id;
    setApprovingId(settlementId);
    try {
      const totalCashflow = settlementCustomerCashflow(settlement);
      const rpcName =
        settlement.status === "invoice_sent"
          ? "mark_settlements_invoice_paid"
          : totalCashflow < 0
          ? "mark_settlements_invoice_sent"
          : "mark_settlements_paid";
      const rpcFn =
        rpcName === "mark_settlements_invoice_paid"
          ? markSettlementInvoicePaidRpc
          : rpcName === "mark_settlements_invoice_sent"
          ? markSettlementInvoiceSentRpc
          : markSettlementPaidRpc;
      const { error } = await rpcFn(settlementId);
      if (error) throw error;
      if (rpcName === "mark_settlements_invoice_sent") {
        toast.success("Factuur gemarkeerd als verzonden");
      } else if (rpcName === "mark_settlements_invoice_paid") {
        toast.success("Factuur gemarkeerd als voldaan");
      } else {
        toast.success("Afrekening gemarkeerd als bankuitbetaling");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  // Leg vast dat e-Flux ONS heeft uitbetaald — voorwaarde voordat we de klant uitbetalen.
  const markEfluxReimbursed = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const { error } = await markSettlementEfluxReimbursedRpc(settlementId);
      if (error) throw error;
      toast.success("Vastgelegd: e-Flux heeft uitbetaald");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  return { approvingId, approveSettlement, unapproveSettlement, executeMoneyFlow, markEfluxReimbursed };
}
