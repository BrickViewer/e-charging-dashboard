import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { primaryOrder, useMarkInvoiced, type OnboardingClient } from "@/hooks/useOnboarding";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Factuur-reviewscherm (onder 'Opgeleverd'): toont alle facturatiegegevens (klant/locatie + bedragen uit de
// offerte, ex/incl 21% btw). Je maakt/verstuurt de factuur in je eigen boekhouding en markeert hier 'Gefactureerd'
// → de kaart schuift naar Archief. (v1: geen automatische factuur-PDF/mail.)
export function OnboardingInvoiceDialog({ client, onClose }: { client: OnboardingClient | null; onClose: () => void }) {
  const order = client ? primaryOrder(client) : null;
  const markInvoiced = useMarkInvoiced();

  const quoteId = order?.quote_id ?? null;
  const { data: quote, isLoading } = useQuery({
    queryKey: ["invoice-quote", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      if (!quoteId) return null;
      const { data, error } = await supabase.from("quotes")
        .select("quote_number, total_hardware_cost, total_installation_cost")
        .eq("id", quoteId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const exBtw = (Number(quote?.total_hardware_cost) || 0) + (Number(quote?.total_installation_cost) || 0);
  const btw = exBtw * 0.21;
  const incl = exBtw + btw;
  const already = !!order?.invoiced_at;

  const siteAddr = [order?.site_street, order?.site_house_number].filter(Boolean).join(" ");
  const sitePlace = [order?.site_postal, order?.site_city].filter(Boolean).join(" ");

  const confirm = async () => {
    if (!order) return;
    try {
      await markInvoiced.mutateAsync(order.id);
      toast.success("Gemarkeerd als gefactureerd");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Markeren mislukt"); }
  };

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Factureren</DialogTitle>
          <DialogDescription>
            Controleer de facturatiegegevens, maak de factuur in je boekhouding en markeer hier als verstuurd.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Klant</p>
              <p className="font-medium">{client?.company_name}</p>
              {(client?.contact_name || client?.contact_email) && (
                <p className="text-muted-foreground">{[client?.contact_name, client?.contact_email].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            {(siteAddr || sitePlace) && (
              <div>
                <p className="text-xs text-muted-foreground">Installatieadres</p>
                <p>{[siteAddr, sitePlace].filter(Boolean).join(", ")}</p>
              </div>
            )}
            <div className="divide-y rounded-lg border">
              <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Offerte</span><span className="tabular-nums">{quote?.quote_number ?? "—"}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Subtotaal (excl. btw)</span><span className="tabular-nums">{euro(exBtw)}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Btw 21%</span><span className="tabular-nums">{euro(btw)}</span></div>
              <div className="flex justify-between px-3 py-2 font-semibold"><span>Totaal (incl. btw)</span><span className="tabular-nums">{euro(incl)}</span></div>
            </div>
            {order?.invoiced_at && <p className="text-[11px] text-emerald-700">Al gemarkeerd als gefactureerd op {new Date(order.invoiced_at).toLocaleDateString("nl-NL")}.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Sluiten</Button>
          <Button onClick={confirm} disabled={markInvoiced.isPending || already || !order}>
            <Receipt className="mr-1.5 h-4 w-4" /> {already ? "Gefactureerd" : "Markeer gefactureerd"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
