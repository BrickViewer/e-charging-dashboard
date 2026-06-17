import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Send, Plug, MailPlus, ExternalLink, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ONBOARDING_PHASES, deriveOnboardingPhase, hasPendingInvite,
  useOnboardingClients, useUnlinkedLocations, useLinkLocationToClient, useSendOnboardingInvite,
  type OnboardingClient, type OnboardingPhase,
} from "@/hooks/useOnboarding";

function NextAction({
  client, phase, onLink, onInvite, inviting, navigate,
}: {
  client: OnboardingClient;
  phase: OnboardingPhase;
  onLink: (c: OnboardingClient) => void;
  onInvite: (c: OnboardingClient) => void;
  inviting: boolean;
  navigate: (to: string) => void;
}) {
  switch (phase) {
    case "getekend":
      return <Button size="sm" className="w-full" onClick={() => navigate("/sales/installaties")}><Send className="mr-1.5 h-3.5 w-3.5" /> Installatie versturen</Button>;
    case "bij_installateur":
      return <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/sales/installaties")}><Clock className="mr-1.5 h-3.5 w-3.5" /> Bekijk installatie</Button>;
    case "opgeleverd":
      return <Button size="sm" className="w-full" onClick={() => onLink(client)}><Plug className="mr-1.5 h-3.5 w-3.5" /> Laadpunten koppelen</Button>;
    case "portaal":
      return (
        <Button size="sm" variant={hasPendingInvite(client) ? "outline" : "default"} className="w-full" disabled={inviting} onClick={() => onInvite(client)}>
          <MailPlus className="mr-1.5 h-3.5 w-3.5" /> {hasPendingInvite(client) ? "Uitnodiging opnieuw" : "Portaal-uitnodiging"}
        </Button>
      );
    case "operationeel":
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
      toast.success("Laadpunten gekoppeld aan de klant");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt");
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Laadpunten koppelen</DialogTitle>
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
  const [linkFor, setLinkFor] = useState<OnboardingClient | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [showOperational, setShowOperational] = useState(false);

  const byPhase = useMemo(() => {
    const map: Record<OnboardingPhase, OnboardingClient[]> = {
      getekend: [], bij_installateur: [], opgeleverd: [], portaal: [], operationeel: [],
    };
    for (const c of clients ?? []) map[deriveOnboardingPhase(c)].push(c);
    return map;
  }, [clients]);

  const onInvite = async (c: OnboardingClient) => {
    setInvitingId(c.id);
    try {
      const res = await sendInvite.mutateAsync(c.id);
      if (res.status === "sent") toast.success(`Portaal-uitnodiging verstuurd naar ${res.to ?? c.contact_email ?? "de klant"}`);
      else if (res.status === "already_linked") toast.info("Klant heeft al een actief portaal-account");
      else if (res.status === "not_configured") toast.warning("E-mail (Resend) is nog niet geconfigureerd");
      else toast.error(res.message ?? "Versturen mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setInvitingId(null);
    }
  };

  const phases = ONBOARDING_PHASES.filter((p) => showOperational || p.key !== "operationeel");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Elke klant in zijn fase — de fase volgt automatisch de echte status. Voer per kaart de volgende stap uit.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowOperational((v) => !v)}>
          {showOperational ? "Verberg operationeel" : "Toon operationeel"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 flex-shrink-0 rounded-xl" />)}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {phases.map((p) => {
            const items = byPhase[p.key];
            return (
              <div key={p.key} className="flex w-72 flex-shrink-0 flex-col rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="text-sm font-semibold">{p.label}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{p.hint}</p>
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
                      <NextAction client={c} phase={p.key} onLink={setLinkFor} onInvite={onInvite} inviting={invitingId === c.id} navigate={navigate} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LinkLocationDialog client={linkFor} onClose={() => setLinkFor(null)} />
    </div>
  );
}
