import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageOpen, Send, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useClientOrders, useUpdateOrder, useHandoffOrder, ORDER_STATUSES, type InstallationOrder } from "@/hooks/useInstallations";
import { useStartWorkPreparation } from "@/hooks/useOrderMaterials";
import { OnboardingMaterialsDialog } from "@/components/sales/OnboardingMaterialsDialog";

const ORDER_STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw", overgedragen: "Overgedragen", ingepland: "Ingepland",
  geinstalleerd: "Geïnstalleerd", afgerond: "Afgerond", geannuleerd: "Geannuleerd",
};

export function InstallationOrdersCard({ clientId }: { clientId: string | undefined }) {
  const orders = useClientOrders(clientId);
  const update = useUpdateOrder();
  const handoff = useHandoffOrder();
  const startPrep = useStartWorkPreparation();
  const [materialsForId, setMaterialsForId] = useState<string | null>(null);
  const list = orders.data ?? [];
  // Verse rij uit de query zodat statussen/sync-badge meebewegen in de dialog.
  const materialsOrder = list.find((o) => o.id === materialsForId) ?? null;
  if (orders.isLoading || list.length === 0) return null;

  const doStartPrep = async (orderId: string) => {
    try {
      const seeded = await startPrep.mutateAsync(orderId);
      toast.success(seeded > 0 ? `Werkvoorbereiding gestart — ${seeded} materialen uit de calculatie` : "Werkvoorbereiding gestart");
      setMaterialsForId(orderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Werkvoorbereiding starten mislukt");
    }
  };

  const doHandoff = async (orderId: string) => {
    try {
      const res = await handoff.mutateAsync(orderId);
      if (res.status === "ok") {
        toast.success(`Verstuurd naar E-Group (${res.egroup_order_number ?? res.egroup_order_id ?? "—"})`);
      } else if (res.status === "validation_error" && res.reason === "work_prep") {
        toast.error(res.message ?? "Werkvoorbereiding is nog niet afgerond");
        setMaterialsForId(orderId);
      } else if (res.status === "validation_error") {
        toast.error(res.message ?? "Site-adres onvolledig, vul aan via Installaties");
      } else if (res.status === "not_configured") {
        toast.warning("E-Group koppeling is nog niet geconfigureerd");
      } else {
        toast.error(res.message ?? "Versturen mislukt");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    }
  };

  const prepActions = (o: InstallationOrder) => {
    if (o.status !== "nieuw" && !o.work_prep_started_at) return null;
    return (
      <div className="ml-auto flex items-center gap-2">
        {o.work_prep_started_at ? (
          <Button size="sm" variant="ghost" onClick={() => setMaterialsForId(o.id)}>
            <PackageOpen className="mr-1.5 h-4 w-4" /> Materialen
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => doStartPrep(o.id)} disabled={startPrep.isPending}>
            <PackageOpen className="mr-1.5 h-4 w-4" /> Werkvoorbereiding starten
          </Button>
        )}
        {o.status === "nieuw" && o.work_prep_started_at && (
          <Button size="sm" variant="outline" onClick={() => doHandoff(o.id)} disabled={handoff.isPending}>
            <Send className="mr-1.5 h-4 w-4" /> Verstuur naar e-portal
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Installatie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 p-3 text-sm">
            <span className="font-medium text-foreground">{o.external_ref || "Installatie-order"}</span>
            <Select value={o.status} onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("nl-NL")}</span>
            {prepActions(o)}
          </div>
        ))}
      </CardContent>
      <OnboardingMaterialsDialog order={materialsOrder} onClose={() => setMaterialsForId(null)} />
    </Card>
  );
}
