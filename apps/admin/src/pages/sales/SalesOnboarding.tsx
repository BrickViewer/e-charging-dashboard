import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Send, Plug, MailPlus, ExternalLink, Clock, ArrowRight, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ONBOARDING_STAGES, deriveStage, hasPendingInvite, primaryOrder,
  useOnboardingClients, useUnlinkedLocations, useLinkLocationToClient, useSendOnboardingInvite, useMarkInvoiced,
  type OnboardingClient, type OnboardingStage,
} from "@/hooks/useOnboarding";
import { OnboardingHandoffDialog } from "@/components/sales/OnboardingHandoffDialog";

function NextAction({
  client, stage, onLink, onInvite, onHandoff, onMarkInvoiced, inviting, invoicing, navigate,
}: {
  client: OnboardingClient;
  stage: OnboardingStage;
  onLink: (c: OnboardingClient) => void;
  onInvite: (c: OnboardingClient) => void;
  onHandoff: (c: OnboardingClient) => void;
  onMarkInvoiced: (c: OnboardingClient) => void;
  inviting: boolean;
  invoicing: boolean;
  navigate: (to: string) => void;
}) {
  const order = primaryOrder(client);
  switch (stage) {
    case "getekend":
      return <Button size="sm" className="w-full" disabled={!order} onClick={() => onHandoff(client)}><Send className="mr-1.5 h-3.5 w-3.5" /> Doorsturen naar installateur</Button>;
    case "bij_installateur":
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Verstuurd{order?.egroup_order_number ? ` · ${order.egroup_order_number}` : ""} — wacht op oplevering
        </p>
      );
    case "opgeleverd":
      return <Button size="sm" className="w-full" disabled={invoicing || !order} onClick={() => onMarkInvoiced(client)}><Receipt className="mr-1.5 h-3.5 w-3.5" /> Markeer gefactureerd</Button>;
    case "locaties_koppelen":
      return <Button size="sm" className="w-full" onClick={() => onLink(client)}><Plug className="mr-1.5 h-3.5 w-3.5" /> Locaties koppelen</Button>;
    case "klant_uitnodigen":
      return (
        <Button size="sm" variant={hasPendingInvite(client) ? "outline" : "default"} className="w-full" disabled={inviting} onClick={() => onInvite(client)}>
          <MailPlus className="mr-1.5 h-3.5 w-3.5" /> {hasPendingInvite(client) ? "Uitnodiging opnieuw" : "Uitnodiging versturen"}
        </Button>
      );
    case "gegevens":
      return <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Wacht op gegevens van de klant</p>;
    case "archief":
      return <Button size="sm" variant="ghost" className="w-full" onClick={() => navigate(`/admin/klanten/${client.id}`)}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Bekijk klant</Button>;
  }
}

function LinkLocationDialog({ client, onClose }: { client: OnboardingClient | null; onClose: () => void }) {
  const { data: locations, isLoading } = useUnlinkedLocations(!!client);
  const link = useLinkLocationToClient();
  const [selected, setSelected] = useState("");

  useEffect(() => { setSelected(""); }, [client?.id]);

  const submit = async () => {
    if (!client || !selected) return;
    try {
      await link.mutateAsync({ locationId: selected, clientId: client.id });
      toast.success("Locatie gekoppeld aan de klant");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt");
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Locaties koppelen</DialogTitle>
          <DialogDescription>
            Koppel de opgeleverde locatie (uit e-Flux) aan {client?.company_name}. De laadsessies tellen daarna mee voor deze klant.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (locations && locations.length > 0) ? (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Kies een locatie…" /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {(l.name || l.address || "Locatie")} {l.city ? `· ${l.city}` : ""} ({l.charge_points?.length ?? 0} laadpunten)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">Geen ongekoppelde locaties gevonden. Wacht tot de laadpunten via de e-Flux-sync binnenkomen.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={!selected || link.isPending}>Koppelen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesOnboarding() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useOnboardingClients();
  const sendInvite = useSendOnboardingInvite();
  const markInvoiced = useMarkInvoiced();
  const [linkFor, setLinkFor] = useState<OnboardingClient | null>(null);
  const [handoffFor, setHandoffFor] = useState<OnboardingClient | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const byStage = useMemo(() => {
    const map: Record<OnboardingStage, OnboardingClient[]> = {
      getekend: [], bij_installateur: [], opgeleverd: [], locaties_koppelen: [], klant_uitnodigen: [], gegevens: [], archief: [],
    };
    for (const c of clients ?? []) map[deriveStage(c)].push(c);
    return map;
  }, [clients]);

  const onInvite = async (c: OnboardingClient) => {
    setInvitingId(c.id);
    try {
      const res = await sendInvite.mutateAsync(c.id);
      if (res.status === "sent") toast.success(`Uitnodiging verstuurd naar ${res.to ?? c.contact_email ?? "de klant"}`);
      else if (res.status === "already_linked") toast.info("Klant heeft al een actief portaal-account");
      else if (res.status === "not_configured") toast.warning("E-mail (Resend) is nog niet geconfigureerd");
      else toast.error(res.message ?? "Versturen mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setInvitingId(null);
    }
  };

  const onMarkInvoiced = async (c: OnboardingClient) => {
    const order = primaryOrder(c);
    if (!order) return;
    setInvoicingId(c.id);
    try {
      await markInvoiced.mutateAsync(order.id);
      toast.success("Gemarkeerd als gefactureerd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Markeren mislukt");
    } finally {
      setInvoicingId(null);
    }
  };

  const stages = ONBOARDING_STAGES.filter((s) => showArchive || s.key !== "archief");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Elke klant in zijn fase — de fase volgt automatisch de echte status. Voer per kaart de volgende stap uit.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowArchive((v) => !v)}>
          {showArchive ? "Verberg archief" : "Toon archief"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 flex-shrink-0 rounded-xl" />)}
        </div>
      ) : (
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => {
            const items = byStage[s.key];
            return (
              <div key={s.key} className="flex min-w-[210px] max-w-[300px] flex-1 flex-col rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm font-semibold">{s.label}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{s.hint}</p>
                <div className="flex flex-col gap-2 p-3">
                  {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Geen klanten</p>}
                  {items.map((c) => (
                    <div key={c.id} className="space-y-2 rounded-lg border bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.company_name}</p>
                          {c.client_number != null && <p className="text-xs text-muted-foreground">Klant #{c.client_number}</p>}
                        </div>
                        <button type="button" onClick={() => navigate(`/admin/klanten/${c.id}`)} aria-label="Open klant" className="text-muted-foreground hover:text-foreground">
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                      <NextAction
                        client={c} stage={s.key}
                        onLink={setLinkFor} onInvite={onInvite} onHandoff={setHandoffFor} onMarkInvoiced={onMarkInvoiced}
                        inviting={invitingId === c.id} invoicing={invoicingId === c.id} navigate={navigate}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl bg-gradient-to-l from-background to-transparent" />
        </div>
      )}

      <LinkLocationDialog client={linkFor} onClose={() => setLinkFor(null)} />
      <OnboardingHandoffDialog client={handoffFor} onClose={() => setHandoffFor(null)} />
    </div>
  );
}
