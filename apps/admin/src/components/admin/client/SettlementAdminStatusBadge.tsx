import { StatusBadge } from "@/components/admin/StatusBadge";
import type { Settlement } from "@/types/db";
import { settlementCustomerCashflow } from "./clientDetailUtils";

export function SettlementAdminStatusBadge({ settlement }: { settlement: Settlement }) {
  if (settlement.status === "approved" && settlementCustomerCashflow(settlement) < 0) {
    return <span className="badge-offerte">Factuur te sturen</span>;
  }

  return <StatusBadge status={settlement.status || "calculated"} />;
}
