import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClientWithRelations } from "@/types/db";

const VAT_STATUS_LABELS: Record<string, string> = {
  vat_liable: "BTW-ondernemer (21%)",
  kor: "KOR — vrijgesteld van BTW",
  private: "Particulier — geen BTW",
};

// Weergave + bevestiging van de BTW-status van de leverancier (Wet OB).
// Zonder bevestigde status blokkeert approve_settlements het goedkeuren.
export function VatStatusBlock({ client, clientId }: { client: ClientWithRelations; clientId: string | undefined }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(client.vat_status ?? "");
  const [confirming, setConfirming] = useState(false);

  const confirmed = Boolean(client.vat_status && client.vat_status_confirmed_at);
  const pending = Boolean(client.vat_status && !client.vat_status_confirmed_at);

  const confirm = async () => {
    if (!selected) { toast.error("Kies eerst een BTW-status"); return; }
    setConfirming(true);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "confirm_client_vat_status", args: { p_client_id: string; p_vat_status: string }): Promise<{ data: unknown; error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("confirm_client_vat_status", {
        p_client_id: client.id,
        p_vat_status: selected,
      });
      if (error) throw error;
      toast.success("BTW-status bevestigd");
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    } catch (err) {
      toast.error((err as Error).message || "Bevestigen mislukt");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">BTW-status</p>
        {confirmed && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
            Bevestigd
          </span>
        )}
        {pending && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-amber)/0.15)] text-[hsl(var(--status-amber))] border border-[hsl(var(--status-amber)/0.25)]">
            Wacht op bevestiging
          </span>
        )}
        {!client.vat_status && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
            Nog niet opgegeven
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {client.vat_status
          ? `Opgegeven: ${VAT_STATUS_LABELS[client.vat_status] ?? client.vat_status}`
          : "De host kan dit in het portaal opgeven; jij kunt het hier direct vaststellen."}
        {" "}Zonder bevestigde status kan de maand niet worden goedgekeurd.
      </p>
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder="Kies BTW-status…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vat_liable">{VAT_STATUS_LABELS.vat_liable}</SelectItem>
            <SelectItem value="kor">{VAT_STATUS_LABELS.kor}</SelectItem>
            <SelectItem value="private">{VAT_STATUS_LABELS.private}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={confirm} disabled={confirming || !selected}>
          {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          Bevestigen
        </Button>
      </div>
    </div>
  );
}
