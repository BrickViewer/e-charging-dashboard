import { useNavigate } from "react-router-dom";
import { Send, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInstallationOrders, useUpdateOrder, useHandoffOrder, ORDER_STATUSES } from "@/hooks/useInstallations";

const STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw", overgedragen: "Overgedragen", ingepland: "Ingepland",
  geinstalleerd: "Geïnstalleerd", afgerond: "Afgerond", geannuleerd: "Geannuleerd",
};

export default function AdminInstallations() {
  const orders = useInstallationOrders();
  const update = useUpdateOrder();
  const handoff = useHandoffOrder();
  const navigate = useNavigate();

  const doHandoff = async (id: string) => {
    try {
      const res = await handoff.mutateAsync(id);
      toast.success(`Overgedragen aan e-portal (${res?.external_ref ?? "—"})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Overdracht mislukt");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Installaties</h1>
        <p className="mt-1 text-sm text-muted-foreground">Installatie-orders uit getekende offertes — overdracht naar e-portal en voortgang.</p>
      </div>

      {orders.isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (orders.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Wrench className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen installatie-orders. Ze ontstaan zodra een offerte digitaal akkoord krijgt.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Klant</th>
                <th className="px-4 py-2.5 font-medium">e-portal ref</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actie</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <button className="font-medium text-foreground hover:underline" onClick={() => o.client_id && navigate(`/admin/klanten/${o.client_id}`)}>
                      {o.clients?.company_name || "—"}
                    </button>
                    {o.clients?.client_number && <span className="ml-1.5 text-[11px] text-muted-foreground">#{o.clients.client_number}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{o.external_ref || "—"}</td>
                  <td className="px-4 py-2.5">
                    <Select value={o.status} onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}>
                      <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {o.status === "nieuw" && (
                      <Button size="sm" variant="outline" onClick={() => doHandoff(o.id)} disabled={handoff.isPending}>
                        <Send className="mr-1.5 h-4 w-4" /> Verstuur naar e-portal
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
