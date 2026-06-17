import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Trash2, Wrench, AlertTriangle, MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  useInstallationOrders,
  useUpdateOrder,
  useHandoffOrder,
  useUpdateOrderSite,
  useDeleteOrder,
  ORDER_STATUSES,
  type OrderWithClient,
  type SitePatch,
} from "@/hooks/useInstallations";
import { deriveServiceSummary } from "@/services/installationHandoff";
import { useAuth } from "@/hooks/useAuth";
import { canAccessBeheer } from "@/lib/workspaces";

const STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw", overgedragen: "Overgedragen", ingepland: "Ingepland",
  geinstalleerd: "Geïnstalleerd", afgerond: "Afgerond", geannuleerd: "Geannuleerd",
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("nl-NL") : "—");

// Toont het site-adres uit het snapshot, met terugval op de lead.
function siteAddress(o: OrderWithClient): string {
  const street = o.site_street || o.leads?.address_street || "";
  const huis = o.site_house_number || "";
  const pc = o.site_postal || o.leads?.postal_code || "";
  const city = o.site_city || o.leads?.city || "";
  const line1 = [street, huis].filter(Boolean).join(" ");
  const line2 = [pc, city].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ") || "—";
}

function serviceSummary(o: OrderWithClient): string {
  return o.service_summary || deriveServiceSummary(o.leads) || "—";
}

// Sync-badge: weerspiegelt de E-Group-kant los van de (handmatige) interne status.
function SyncBadge({ o }: { o: OrderWithClient }) {
  if (o.last_sync_error) {
    return (
      <span title={o.last_sync_error} className="inline-flex items-center gap-1">
        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Sync-fout</Badge>
      </span>
    );
  }
  if (o.completed_at || o.status === "afgerond") {
    return <Badge className="gap-1 bg-green-600 hover:bg-green-600/90"><CheckCircle2 className="h-3 w-3" /> Afgerond</Badge>;
  }
  if (o.egroup_order_id) {
    const label = o.external_status ? STATUS_LABEL[o.status] ?? "Verstuurd" : "Verstuurd";
    return <Badge variant="secondary">{label}{o.egroup_order_number ? ` · ${o.egroup_order_number}` : ""}</Badge>;
  }
  return <Badge variant="outline">Niet verstuurd</Badge>;
}

type SiteForm = {
  site_street: string; site_house_number: string; site_postal: string; site_city: string;
  site_contact_name: string; site_contact_email: string; site_contact_phone: string; service_summary: string;
};

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export default function SalesInstallations() {
  const orders = useInstallationOrders();
  const update = useUpdateOrder();
  const handoff = useHandoffOrder();
  const updateSite = useUpdateOrderSite();
  const del = useDeleteOrder();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canOpenClient = canAccessBeheer(role);

  const [detailId, setDetailId] = useState<string | null>(null);
  const selected = useMemo(
    () => (orders.data ?? []).find((o) => o.id === detailId) ?? null,
    [orders.data, detailId],
  );

  const doHandoff = async (id: string) => {
    try {
      const res = await handoff.mutateAsync(id);
      if (res.status === "ok") {
        toast.success(res.already_sent
          ? `Al verstuurd naar E-Group (${res.egroup_order_number ?? res.egroup_order_id})`
          : `Opdracht verstuurd naar E-Group (${res.egroup_order_number ?? res.egroup_order_id})`);
      } else if (res.status === "validation_error") {
        toast.error(res.message ?? "Site-adres onvolledig");
        setDetailId(id); // open de kaart zodat de gebruiker het adres aanvult
      } else if (res.status === "not_configured") {
        toast.warning("E-Group koppeling is nog niet geconfigureerd");
      } else {
        toast.error(res.message ?? "Versturen mislukt");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    }
  };

  const doDelete = async (id: string, name: string) => {
    if (!window.confirm(`Installatie-opdracht van ${name} definitief verwijderen?`)) return;
    try {
      await del.mutateAsync(id);
      toast.success("Installatie-opdracht verwijderd");
      if (detailId === id) setDetailId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Installaties</h1>
        <p className="mt-1 text-sm text-muted-foreground">Installatie-orders uit getekende offertes. Versturen naar E-Group en de voortgang live volgen.</p>
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
                <th className="px-4 py-2.5 font-medium">Site-adres</th>
                <th className="px-4 py-2.5 font-medium">Installatie</th>
                <th className="px-4 py-2.5 font-medium">E-Group</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Afgerond</th>
                <th className="px-4 py-2.5 text-right font-medium">Actie</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    {canOpenClient && o.client_id ? (
                      <button className="font-medium text-foreground hover:underline" onClick={() => navigate(`/admin/klanten/${o.client_id}`)}>
                        {o.clients?.company_name || "—"}
                      </button>
                    ) : (
                      <span className="font-medium text-foreground">{o.clients?.company_name || "—"}</span>
                    )}
                    {o.clients?.client_number && <span className="ml-1.5 text-[11px] text-muted-foreground">#{o.clients.client_number}</span>}
                    {o.quotes?.quote_number && <div className="text-[11px] text-muted-foreground">{o.quotes.quote_number}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button className="text-left text-muted-foreground hover:text-foreground hover:underline" onClick={() => setDetailId(o.id)}>
                      {siteAddress(o)}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{serviceSummary(o)}</td>
                  <td className="px-4 py-2.5"><SyncBadge o={o} /></td>
                  <td className="px-4 py-2.5">
                    <Select value={o.status} onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}>
                      <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{fmtDate(o.completed_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {o.status === "nieuw" && !o.egroup_order_id && (
                        <Button size="sm" variant="outline" onClick={() => doHandoff(o.id)} disabled={handoff.isPending}>
                          <Send className="mr-1.5 h-4 w-4" /> Versturen opdracht
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(o.id)}>Details</Button>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Verwijderen"
                        onClick={() => doDelete(o.id, o.clients?.company_name || "deze klant")}
                        disabled={del.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailSheet
        order={selected}
        onClose={() => setDetailId(null)}
        onSaveSite={async (patch) => {
          if (!selected) return;
          try {
            await updateSite.mutateAsync({ id: selected.id, patch });
            toast.success("Site-gegevens opgeslagen");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
          }
        }}
        saving={updateSite.isPending}
        onHandoff={doHandoff}
        handoffPending={handoff.isPending}
      />
    </div>
  );
}

function DetailSheet({
  order, onClose, onSaveSite, saving, onHandoff, handoffPending,
}: {
  order: OrderWithClient | null;
  onClose: () => void;
  onSaveSite: (patch: SitePatch) => Promise<void>;
  saving: boolean;
  onHandoff: (id: string) => void;
  handoffPending: boolean;
}) {
  // Form-state wordt opnieuw geïnitialiseerd per geopende order (key op id).
  const [form, setForm] = useState<SiteForm>(() => initForm(order));
  const [initFor, setInitFor] = useState<string | null>(order?.id ?? null);
  if (order && order.id !== initFor) {
    setForm(initForm(order));
    setInitFor(order.id);
  }

  const lines = Array.isArray(order?.quotes?.line_items) ? (order!.quotes!.line_items as { description: string; qty: number; unit_price: number; total: number }[]) : [];
  const sent = !!order?.egroup_order_id;

  return (
    <Sheet open={!!order} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {order && (
          <>
            <SheetHeader>
              <SheetTitle>{order.clients?.company_name || "Installatie-opdracht"}</SheetTitle>
              <SheetDescription>
                {order.quotes?.quote_number ? `Offerte ${order.quotes.quote_number}` : "Installatie-order"}
                {order.egroup_order_number ? ` · E-Group ${order.egroup_order_number}` : ""}
              </SheetDescription>
            </SheetHeader>

            {order.last_sync_error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{order.last_sync_error}</span>
              </div>
            )}

            <div className="mt-6 space-y-5">
              <section className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4" /> Site-adres (locatie installatie)</h3>
                <p className="text-xs text-muted-foreground">E-Group heeft een compleet adres nodig. Vul aan voor je de opdracht verstuurt.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="site_street">Straat</Label>
                    <Input id="site_street" value={form.site_street} onChange={(e) => setForm({ ...form, site_street: e.target.value })} disabled={sent} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site_house_number">Huisnr.</Label>
                    <Input id="site_house_number" value={form.site_house_number} onChange={(e) => setForm({ ...form, site_house_number: e.target.value })} disabled={sent} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site_postal">Postcode</Label>
                    <Input id="site_postal" value={form.site_postal} onChange={(e) => setForm({ ...form, site_postal: e.target.value })} disabled={sent} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="site_city">Plaats</Label>
                    <Input id="site_city" value={form.site_city} onChange={(e) => setForm({ ...form, site_city: e.target.value })} disabled={sent} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Contactpersoon op locatie</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="site_contact_name">Naam</Label>
                    <Input id="site_contact_name" value={form.site_contact_name} onChange={(e) => setForm({ ...form, site_contact_name: e.target.value })} disabled={sent} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site_contact_email">E-mail</Label>
                    <Input id="site_contact_email" value={form.site_contact_email} onChange={(e) => setForm({ ...form, site_contact_email: e.target.value })} disabled={sent} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site_contact_phone">Telefoon</Label>
                    <Input id="site_contact_phone" value={form.site_contact_phone} onChange={(e) => setForm({ ...form, site_contact_phone: e.target.value })} disabled={sent} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="service_summary">Service-samenvatting</Label>
                    <Input id="service_summary" value={form.service_summary} onChange={(e) => setForm({ ...form, service_summary: e.target.value })} disabled={sent} placeholder="bijv. 10 laadpunten" />
                  </div>
                </div>
              </section>

              {lines.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Offerte-regels</h3>
                  <div className="rounded-lg border">
                    {lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-0">
                        <span className="text-muted-foreground">{l.qty}× {l.description}</span>
                        <span className="tabular-nums">€ {Number(l.total).toLocaleString("nl-NL")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {order.external_status && (
                <p className="text-xs text-muted-foreground">E-Group status: <span className="font-medium text-foreground">{order.external_status}</span></p>
              )}
            </div>

            <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
              {!sent && (
                <Button
                  onClick={async () => {
                    // Eerst de site-gegevens opslaan, daarna direct versturen — één actie.
                    await onSaveSite({
                      site_street: emptyToNull(form.site_street),
                      site_house_number: emptyToNull(form.site_house_number),
                      site_postal: emptyToNull(form.site_postal),
                      site_city: emptyToNull(form.site_city),
                      site_contact_name: emptyToNull(form.site_contact_name),
                      site_contact_email: emptyToNull(form.site_contact_email),
                      site_contact_phone: emptyToNull(form.site_contact_phone),
                      service_summary: emptyToNull(form.service_summary),
                    });
                    onHandoff(order.id);
                  }}
                  disabled={saving || handoffPending}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {saving ? "Opslaan…" : handoffPending ? "Versturen…" : "Opslaan en versturen"}
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function initForm(order: OrderWithClient | null): SiteForm {
  return {
    site_street: order?.site_street ?? order?.leads?.address_street ?? "",
    site_house_number: order?.site_house_number ?? "",
    site_postal: order?.site_postal ?? order?.leads?.postal_code ?? "",
    site_city: order?.site_city ?? order?.leads?.city ?? "",
    site_contact_name: order?.site_contact_name ?? order?.clients?.contact_name ?? "",
    site_contact_email: order?.site_contact_email ?? order?.clients?.contact_email ?? "",
    site_contact_phone: order?.site_contact_phone ?? order?.clients?.contact_phone ?? order?.leads?.contact_phone ?? "",
    service_summary: order?.service_summary ?? deriveServiceSummary(order?.leads) ?? "",
  };
}
