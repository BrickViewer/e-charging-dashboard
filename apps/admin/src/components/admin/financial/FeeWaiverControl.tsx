import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { setSettlementFeeWaived } from "@/services/settlements";
import { BadgePercent } from "lucide-react";

const euro = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface FeeWaiverControlProps {
  settlement: {
    id: string;
    status: string;
    fee_waived?: boolean | null;
    echarging_revenue: number;
    gross_revenue: number;
    year: number;
    month: number;
  };
}

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** Kwijtscheldings-badge + toggle voor de service-fee van één maand.
 *  Alleen toonbaar/klikbaar bij status live/calculated — de RPC dwingt dit
 *  ook server-side af, dus een verouderde UI kan nooit een vergrendelde
 *  afrekening wijzigen. */
export function FeeWaiverControl({ settlement }: FeeWaiverControlProps) {
  const queryClient = useQueryClient();
  const waived = settlement.fee_waived === true;
  const editable = settlement.status === "live" || settlement.status === "calculated";
  const periodLabel = `${MONTHS_NL[(settlement.month - 1 + 12) % 12]} ${settlement.year}`;

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await setSettlementFeeWaived(settlement.id, next);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next
        ? `Service-fee voor ${periodLabel} kwijtgescholden`
        : `Service-fee voor ${periodLabel} hersteld`);
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements"] });
    },
    onError: (err: Error) => toast.error(err.message || "Kwijtschelding wijzigen mislukt"),
  });

  return (
    <span className="inline-flex items-center gap-2">
      {waived && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
          <BadgePercent className="w-3 h-3" />
          Kwijtgescholden
        </span>
      )}
      {editable && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={mutation.isPending}>
              {waived ? "Kwijtschelding opheffen" : "Fee kwijtschelden"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {waived ? `Kwijtschelding opheffen voor ${periodLabel}?` : `Service-fee kwijtschelden voor ${periodLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {waived ? (
                  <>Het tarief van de klant wordt hersteld en de fee en uitbetaling worden herrekend.</>
                ) : (
                  <>
                    De E-Charging service-fee ({euro(Number(settlement.echarging_revenue || 0))}) vervalt voor deze maand.
                    De uitbetaling aan de klant wordt dan {euro(Number(settlement.gross_revenue || 0))} (het volledige brutobedrag).
                    Dit werkt door in de afrekening en de vergoedingsfactuur. Je kunt dit terugdraaien zolang de maand niet is goedgekeurd.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate(!waived)}>
                {waived ? "Herstellen" : "Kwijtschelden"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </span>
  );
}
