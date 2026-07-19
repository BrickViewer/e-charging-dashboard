import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Send, Plug, MailPlus, ExternalLink, Clock, ArrowRight, Receipt, UserPlus, PackageOpen, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ONBOARDING_STAGES, STAGES_BY_SCOPE, deriveStage, hasPendingInvite, primaryOrder,
  useOnboardingClients, useOnboardingOrders, useUnlinkedLocations, useLinkLocationToClient, useSendOnboardingInvite,
  type OnboardingClient, type OnboardingStage, type OnbOrder,
} from "@/hooks/useOnboarding";
import { clientScope, scopeFromFlags, SCOPE_LABEL, SCOPE_SHORT, SCOPE_BADGE_CLASS, type QuoteScope } from "@/lib/quoteScope";
import { OnboardingHandoffDialog } from "@/components/sales/OnboardingHandoffDialog";
import { OnboardingInvoiceDialog } from "@/components/sales/OnboardingInvoiceDialog";
import { OnboardingMaterialsDialog } from "@/components/sales/OnboardingMaterialsDialog";
import { CreateClientFromQuoteDialog, type QuoteForClient } from "@/components/sales/CreateClientFromQuoteDialog";
import { useSignedQuotesAwaitingClient } from "@/hooks/useQuotes";
import { useStartWorkPreparation } from "@/hooks/useOrderMaterials";
import { materialsTrafficLight } from "@/services/workPreparation";

// Stoplicht op de kaart: rood = niet (alles) besteld, oranje = besteld maar nog
// niet binnen, groen = alles binnen. Grijs = geen materialen.
const TRAFFIC_DOT: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  muted: "bg-muted-foreground/40",
};

function MaterialsStatusLine({ order }: { order: OnbOrder | null }) {
  if (!order?.work_prep_started_at) return null;
  const light = materialsTrafficLight(order.installation_order_materials ?? []);
  return (
    <p className="flex items-center justify-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
      <span className={`h-2 w-2 shrink-0 rounded-full ${TRAFFIC_DOT[light.tone]}`} />
      <span className="truncate">{light.label}</span>
    </p>
  );
}

const planDatum = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

const SCOPE_FILTERS: { key: QuoteScope; label: string }[] = [
  { key: "installatie_beheer", label: SCOPE_LABEL.installatie_beheer },
  { key: "alleen_installatie", label: SCOPE_LABEL.alleen_installatie },
  { key: "alleen_beheer", label: SCOPE_LABEL.alleen_beheer },
];

function NextAction({
  client, stage, onLink, onInvite, onInvoice, onCreate, onStartPrep, onMaterials, startingPrep, inviting, navigate,
}: {
  client: OnboardingClient;
  stage: OnboardingStage;
  onLink: (c: OnboardingClient) => void;
  onInvite: (c: OnboardingClient) => void;
  onInvoice: (c: OnboardingClient) => void;
  onCreate: (c: OnboardingClient) => void;
  onStartPrep: (c: OnboardingClient) => void;
  onMaterials: (c: OnboardingClient) => void;
  startingPrep: boolean;
  inviting: boolean;
  navigate: (to: string) => void;
}) {
  const order = primaryOrder(client);
  // Compacte, niet-overlopende actieknop: smalle kolom-proof (mag desnoods afbreken i.p.v. buiten de kaart vallen).
  const btn = "h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs leading-tight";
  const ico = "mr-1.5 h-3.5 w-3.5 shrink-0";
  switch (stage) {
    case "getekend":
      // Doorsturen kan pas ná de werkvoorbereiding (materialen bestellen) — de
      // volgende stap is dus de checklist aanmaken uit de calculatie.
      return (
        <Button size="sm" className={btn} disabled={!order || startingPrep} onClick={() => onStartPrep(client)}>
          <PackageOpen className={ico} /> Werkvoorbereiding starten
        </Button>
      );
    case "werkvoorbereiding":
      // Bij installatie+beheer komt de klant (aanmaken/uitnodigen) vóór de
      // installateur-track, dus er is geen aparte "getekend"-kolom meer: zolang de
      // werkvoorbereiding nog niet gestart is, tonen we hier de start-actie.
      if (!order?.work_prep_started_at)
        return (
          <Button size="sm" className={btn} disabled={!order || startingPrep} onClick={() => onStartPrep(client)}>
            <PackageOpen className={ico} /> Werkvoorbereiding starten
          </Button>
        );
      return (
        <div className="space-y-1.5">
          <MaterialsStatusLine order={order} />
          <Button size="sm" className={btn} onClick={() => onMaterials(client)}>
            <PackageOpen className={ico} /> Materialen
          </Button>
        </div>
      );
    case "bij_installateur":
      return (
        <div className="space-y-1.5">
          <div className="flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{order?.egroup_order_number ? `Verstuurd · ${order.egroup_order_number}` : "Verstuurd — wacht op oplevering"}</span>
          </div>
          {/* Plandatum uit de e-portal (webhook zet scheduled_date bij het inplannen). */}
          {order?.scheduled_date && (
            <div className="flex min-h-6 items-center justify-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-center text-[11px] font-medium leading-tight text-primary">
              <CalendarCheck className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Ingepland · {planDatum(order.scheduled_date)}</span>
            </div>
          )}
          <MaterialsStatusLine order={order} />
          {/* Ná de handoff nog materialen "binnen" kunnen melden voor de planner. */}
          {order?.work_prep_started_at && (
            <Button size="sm" variant="ghost" className={btn} onClick={() => onMaterials(client)}>
              <PackageOpen className={ico} /> Materialen
            </Button>
          )}
        </div>
      );
    case "opgeleverd":
      return <Button size="sm" className={btn} disabled={!order} onClick={() => onInvoice(client)}><Receipt className={ico} /> Factureren</Button>;
    case "klant_aanmaken":
      return <Button size="sm" className={btn} onClick={() => onCreate(client)}><UserPlus className={ico} /> Klant account aanmaken</Button>;
    case "locaties_koppelen":
      return <Button size="sm" className={btn} onClick={() => onLink(client)}><Plug className={ico} /> Locaties koppelen</Button>;
    case "klant_uitnodigen":
      return (
        <Button size="sm" variant={hasPendingInvite(client) ? "outline" : "default"} className={btn} disabled={inviting} onClick={() => onInvite(client)}>
          <MailPlus className={ico} /> {hasPendingInvite(client) ? "Opnieuw uitnodigen" : "Uitnodigen"}
        </Button>
      );
    case "gegevens":
      return <div className="flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /> Wacht op gegevens</div>;
    case "archief":
      if (client.is_order_only)
        return <div className="flex min-h-8 items-center justify-center rounded-md bg-muted/60 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground">Afgerond</div>;
      return <Button size="sm" variant="ghost" className={btn} onClick={() => navigate(`/beheer/klanten/${client.id}`)}><ExternalLink className={ico} /> Bekijk klant</Button>;
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
  const { data: orders } = useOnboardingOrders();
  const { data: awaiting } = useSignedQuotesAwaitingClient();
  const sendInvite = useSendOnboardingInvite();
  const startPrep = useStartWorkPreparation();
  const [linkFor, setLinkFor] = useState<OnboardingClient | null>(null);
  const [handoffFor, setHandoffFor] = useState<OnboardingClient | null>(null);
  const [materialsFor, setMaterialsFor] = useState<OnboardingClient | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<OnboardingClient | null>(null);
  const [createFor, setCreateFor] = useState<QuoteForClient | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<QuoteScope>("installatie_beheer");

  // Echte klanten + clientloze 'order-only' installatie-orders in dezelfde pijplijn, gefilterd op de gekozen scope.
  const filteredClients = useMemo(
    () => [...(clients ?? []), ...(orders ?? [])].filter((c) => clientScope(c.needs_installation, c.managed) === scopeFilter),
    [clients, orders, scopeFilter],
  );

  // Getekende offertes zonder order/klant → intake "Klant account aanmaken" in de Getekend-kolom. Alleen voor
  // alleen-beheer: installatie-scopes krijgen automatisch een order (trigger) en lopen via Getekend → Doorsturen.
  const awaitingForScope = useMemo(
    () => scopeFilter !== "alleen_beheer" ? [] : (awaiting ?? []).filter((q) => scopeFromFlags(q.with_installation !== false, q.with_management !== false) === scopeFilter),
    [awaiting, scopeFilter],
  );

  const byStage = useMemo(() => {
    const map: Record<OnboardingStage, OnboardingClient[]> = {
      getekend: [], werkvoorbereiding: [], bij_installateur: [], opgeleverd: [], klant_aanmaken: [], locaties_koppelen: [], klant_uitnodigen: [], gegevens: [], archief: [],
    };
    for (const c of filteredClients) map[deriveStage(c)].push(c);
    return map;
  }, [filteredClients]);

  // De dialog leest de VERSE kaart uit de query-data (statussen/teller bewegen
  // mee); de state houdt alleen vast wélke kaart open is.
  const materialsClient = materialsFor ? (filteredClients.find((c) => c.id === materialsFor.id) ?? materialsFor) : null;
  const materialsOrder = materialsClient ? primaryOrder(materialsClient) : null;

  const onStartPrep = async (c: OnboardingClient) => {
    const order = primaryOrder(c);
    if (!order) return;
    try {
      const seeded = await startPrep.mutateAsync(order.id);
      toast.success(seeded > 0 ? `Werkvoorbereiding gestart — ${seeded} materialen uit de calculatie` : "Werkvoorbereiding gestart");
      setMaterialsFor(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Werkvoorbereiding starten mislukt");
    }
  };

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

  const stages = ONBOARDING_STAGES.filter((s) => (showArchive || s.key !== "archief") && STAGES_BY_SCOPE[scopeFilter].includes(s.key));

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

      <div className="flex flex-wrap gap-1.5">
        {SCOPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setScopeFilter(f.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${scopeFilter === f.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40"}`}
          >
            {f.label}
          </button>
        ))}
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
            // De Getekend-kolom toont voor alleen-beheer ook de getekende offertes zonder klantaccount (intake).
            const intake = s.key === "getekend" ? awaitingForScope : [];
            const count = items.length + intake.length;
            const hint = s.key === "getekend" && scopeFilter === "alleen_beheer" ? "Maak het klantaccount aan" : s.hint;
            return (
              <div key={s.key} className="flex min-w-[210px] max-w-[300px] flex-1 flex-col rounded-xl border bg-muted/20">
                <div className="border-b px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="truncate text-sm font-semibold">{s.label}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  {intake.map((q) => (
                    <div key={`await-${q.id}`} className="space-y-2 rounded-lg border bg-card p-2.5 shadow-sm">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.prospect_company || q.prospect_contact || "—"}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">{q.quote_number} · {euro((Number(q.total_hardware_cost) || 0) + (Number(q.total_installation_cost) || 0))}</p>
                      </div>
                      <Button size="sm" className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs leading-tight" onClick={() => setCreateFor(q)}>
                        <UserPlus className="mr-1.5 h-3.5 w-3.5 shrink-0" /> Klant account aanmaken
                      </Button>
                    </div>
                  ))}
                  {count === 0 && <p className="py-8 text-center text-xs text-muted-foreground/60">Geen klanten</p>}
                  {items.map((c) => (
                    <div key={c.id} className="space-y-2 rounded-lg border bg-card p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.company_name}</p>
                          {c.client_number != null && <p className="text-[11px] text-muted-foreground">Klant #{c.client_number}</p>}
                          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${SCOPE_BADGE_CLASS[clientScope(c.needs_installation, c.managed)]}`}>
                            {SCOPE_SHORT[clientScope(c.needs_installation, c.managed)]}
                          </span>
                        </div>
                        {!c.is_order_only && (
                          <button type="button" onClick={() => navigate(`/beheer/klanten/${c.id}`)} aria-label="Open klant" className="shrink-0 text-muted-foreground hover:text-foreground">
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <NextAction
                        client={c} stage={s.key}
                        onLink={setLinkFor} onInvite={onInvite} onInvoice={setInvoiceFor}
                        onCreate={(cl) => cl._quoteForClient && setCreateFor(cl._quoteForClient)}
                        onStartPrep={onStartPrep} onMaterials={setMaterialsFor}
                        startingPrep={startPrep.isPending}
                        inviting={invitingId === c.id} navigate={navigate}
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
      <OnboardingMaterialsDialog
        order={materialsOrder}
        title={materialsClient?.company_name}
        onClose={() => setMaterialsFor(null)}
        onSend={() => {
          // Gate is groen: door naar de bestaande handoff-dialog (adres/contact).
          const client = materialsClient;
          setMaterialsFor(null);
          if (client) setHandoffFor(client);
        }}
      />
      <OnboardingHandoffDialog client={handoffFor} onClose={() => setHandoffFor(null)} />
      <OnboardingInvoiceDialog client={invoiceFor} onClose={() => setInvoiceFor(null)} />
      <CreateClientFromQuoteDialog quote={createFor} open={!!createFor} onClose={() => setCreateFor(null)} onCreated={(id) => navigate(`/beheer/klanten/${id}`)} />
    </div>
  );
}
