import { Card } from "@/components/ui/card";

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SettlementDetailRow({ settlement }: { settlement: any }) {
  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-muted/30 px-6 py-4 border-b border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Sessies</p>
              <p className="font-medium">{settlement.total_sessions ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Energiekosten</p>
              <p className="font-medium">{fmt(Number(settlement.total_energy_cost || 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Platformkosten</p>
              <p className="font-medium">{fmt(Number(settlement.total_platform_fee || 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Stripe transfer</p>
              <p className="font-medium">{settlement.stripe_transfer_id || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Betaald op</p>
              <p className="font-medium">{settlement.paid_at ? new Date(settlement.paid_at).toLocaleDateString("nl-NL") : "—"}</p>
            </div>
            <div className="md:col-span-3">
              <p className="text-muted-foreground mb-1">Geschatte ERE-opbrengst (via Laadbeloning, niet via ons)</p>
              <p className="font-medium text-green-700 dark:text-green-400">~{fmt(Number(settlement.ere_estimate || 0))} <span className="text-xs text-muted-foreground font-normal">indicatief</span></p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
