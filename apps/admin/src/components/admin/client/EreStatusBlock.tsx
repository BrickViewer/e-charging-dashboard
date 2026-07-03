import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientWithRelations } from "@/types/db";

// ERE-interesse: de klant geeft in het portaal aan ERE-certificaten te willen (aanmelden kan nog niet).
// We tonen de openstaande aanvraag en laten een medewerker 'm als geregeld markeren (mark_ere_arranged).
export function EreStatusBlock({ client, clientId }: { client: ClientWithRelations; clientId: string | undefined }) {
  const queryClient = useQueryClient();
  const [arranging, setArranging] = useState(false);

  const requested = Boolean(client.ere_requested_at);
  const arranged = Boolean(client.ere_arranged_at);
  const pending = requested && !arranged;

  if (!requested && !arranged) return null; // niets aangevraagd → geen blok

  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "";

  const markArranged = async () => {
    setArranging(true);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "mark_ere_arranged", args: { p_client_id: string }): Promise<{ data: unknown; error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("mark_ere_arranged", { p_client_id: client.id });
      if (error) throw error;
      toast.success("ERE-aanvraag gemarkeerd als geregeld");
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    } catch (err) {
      toast.error((err as Error).message || "Markeren mislukt");
    } finally {
      setArranging(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">ERE-certificaten</p>
        {pending && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-amber)/0.15)] text-[hsl(var(--status-amber))] border border-[hsl(var(--status-amber)/0.25)]">
            Aangevraagd
          </span>
        )}
        {arranged && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
            Geregeld
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {arranged
          ? `De klant vroeg ERE aan; gemarkeerd als geregeld op ${fmtDate(client.ere_arranged_at)}.`
          : `De klant gaf in het portaal aan ERE-certificaten te willen (aangevraagd op ${fmtDate(client.ere_requested_at)}). Neem contact op om ze aan te melden.`}
      </p>
      {pending && (
        <div>
          <Button size="sm" variant="outline" onClick={markArranged} disabled={arranging}>
            {arranging ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
            Markeer als geregeld
          </Button>
        </div>
      )}
    </div>
  );
}
