import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plug, MailPlus, ExternalLink, Clock, ArrowRight, Receipt, UserPlus, PackageOpen, CalendarCheck,
  MoreVertical, SkipForward, Undo2, Search, Send, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ONBOARDING_STEPS, currentStep, stepStates, primaryOrder,
  useOnboardingPipeline, useUnlinkedLocations, useLinkLocationToClient, useSendOnboardingInvite,
  useSkipSteps, useUnskipSteps,
  type OnboardingClient, type OnboardingStage, type OnbOrder, type SkipIndex, type StepState, type SkipTarget,
  type OpenConcept,
} from "@/hooks/useOnboarding";
import { attentionFor } from "@/services/onboardingOverview";
import { clientScope, SCOPE_SHORT, SCOPE_BADGE_CLASS } from "@/lib/quoteScope";
import { OnboardingHandoffDialog } from "@/components/sales/OnboardingHandoffDialog";
import { OnboardingInvoiceDialog } from "@/components/sales/OnboardingInvoiceDialog";
import { OnboardingMaterialsDialog } from "@/components/sales/OnboardingMaterialsDialog";
import { CreateClientFromQuoteDialog, type QuoteForClient } from "@/components/sales/CreateClientFromQuoteDialog";
import { useStartWorkPreparation } from "@/hooks/useOrderMaterials";
import { materialsGate, materialsTrafficLight } from "@/services/workPreparation";

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

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

// De volledige ladder als streepjes onder elkaar: in één oogopslag zie je waar een
// klant vandaan komt en wat er nog moet. Niet-van-toepassing en overgeslagen stappen
// blijven zichtbaar (doorgestreept), zodat er nooit iets stilletjes verdwijnt.
const RAIL_CLASS: Record<StepState["status"], string> = {
  done: "bg-emerald-500",
  todo: "bg-primary",
  waiting: "bg-amber-400",
  blocked: "bg-muted-foreground/25",
  skipped: "bg-muted-foreground/25",
  na: "bg-muted-foreground/15",
};

function StepRail({ states }: { states: StepState[] }) {
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {states.filter((s) => !s.step.terminal).map((s) => (
        <span
          key={s.step.key}
          title={`${s.step.label}${s.reason ? ` — ${s.reason}` : ""}`}
          className={`h-1 flex-1 rounded-full ${RAIL_CLASS[s.status]} ${s.status === "skipped" ? "opacity-60" : ""}`}
        />
      ))}
    </div>
  );
}

function NextAction({
  client, stage, blockedReason, concept, onLink, onInvite, onInvoice, onCreate, onStartPrep, onMaterials, onHandoff,
  startingPrep, inviting, navigate,
}: {
  client: OnboardingClient;
  stage: OnboardingStage;
  blockedReason: string | null;
  /** Klaarstaand, nog niet verstuurd WeFact-concept voor deze kaart. */
  concept: OpenConcept | null;
  onLink: (c: OnboardingClient) => void;
  onInvite: (c: OnboardingClient) => void;
  onInvoice: (c: OnboardingClient) => void;
  onCreate: (c: OnboardingClient) => void;
  onStartPrep: (c: OnboardingClient) => void;
  onMaterials: (c: OnboardingClient) => void;
  onHandoff: (c: OnboardingClient) => void;
  startingPrep: boolean;
  inviting: boolean;
  navigate: (to: string) => void;
}) {
  const order = primaryOrder(client);
  // Compacte, niet-overlopende actieknop: smalle kolom-proof (mag desnoods afbreken i.p.v. buiten de kaart vallen).
  const btn = "h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs leading-tight";
  const ico = "mr-1.5 h-3.5 w-3.5 shrink-0";

  // Kan de stap niet uitgevoerd worden? Dan geen dode knop maar de reden.
  if (blockedReason) {
    return (
      <div className="flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground">
        <Ban className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{blockedReason}</span>
      </div>
    );
  }

  switch (stage) {
    case "werkvoorbereiding": {
      // Nog niet gestart → checklist uit de calculatie seeden. Wél gestart en de
      // materialen zijn binnen → direct doorsturen (scheelde eerst een omweg via
      // de materialendialog).
      if (!order?.work_prep_started_at)
        return (
          <Button size="sm" className={btn} disabled={!order || startingPrep} onClick={() => onStartPrep(client)}>
            <PackageOpen className={ico} /> Werkvoorbereiding starten
          </Button>
        );
      const gate = materialsGate(order.installation_order_materials ?? []);
      return (
        <div className="space-y-1.5">
          <MaterialsStatusLine order={order} />
          {gate.ok ? (
            <Button size="sm" className={btn} onClick={() => onHandoff(client)}>
              <Send className={ico} /> Doorsturen naar installateur
            </Button>
          ) : null}
          <Button size="sm" variant={gate.ok ? "ghost" : "default"} className={btn} onClick={() => onMaterials(client)}>
            <PackageOpen className={ico} /> Materialen
          </Button>
        </div>
      );
    }
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
      // BEWUST geen `disabled={!order}`: de stap geldt óók voor een beheer-klant zonder
      // installatie-order (openstaande activatiekosten). Of hij uitvoerbaar is, bepaalt
      // het model al — is er geen order én geen klant, dan vangt de blockedReason-tak
      // hierboven het af. De oude order-gate maakte de knop dood voor alleen-beheer.
      //
      // Staat er al een concept klaar, dan zegt de knop dat: anders is een kaart met een
      // klaargezette factuur niet te onderscheiden van een kaart waar nog niets is gebeurd.
      return (
        <div className="space-y-1.5">
          {concept && (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <span className="truncate">
                Concept{concept.invoiceCode ? ` ${concept.invoiceCode}` : ""} — nog niet verstuurd
                {concept.amountIncl != null ? ` · ${euro(concept.amountIncl)}` : ""}
              </span>
            </p>
          )}
          <Button size="sm" className={btn} onClick={() => onInvoice(client)}>
            <Receipt className={ico} /> {concept ? "Concept klaar — versturen" : "Factureren"}
          </Button>
        </div>
      );
    case "klant_aanmaken":
      return <Button size="sm" className={btn} onClick={() => onCreate(client)}><UserPlus className={ico} /> Klant account aanmaken</Button>;
    case "locaties_koppelen":
      return <Button size="sm" className={btn} onClick={() => onLink(client)}><Plug className={ico} /> Locaties koppelen</Button>;
    case "klant_uitnodigen": {
      const pending = (client.client_invitations ?? []).some((i) => i.status === "pending");
      return (
        <Button size="sm" variant={pending ? "outline" : "default"} className={btn} disabled={inviting} onClick={() => onInvite(client)}>
          <MailPlus className={ico} /> {pending ? "Opnieuw uitnodigen" : "Uitnodigen"}
        </Button>
      );
    }
    case "gegevens":
      return <div className="flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /> Wacht op gegevens</div>;
    case "archief":
      if (client.kind !== "client")
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

/** Eén stap overslaan, of alles wat nog openstaat (= onboarding afsluiten). Reden verplicht. */
function SkipDialog({
  target, onClose,
}: {
  target: { client: OnboardingClient; states: StepState[]; mode: "step" | "close" } | null;
  onClose: () => void;
}) {
  const skip = useSkipSteps();
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [target?.client.id, target?.mode]);

  const open = target?.states.filter((s) => s.status === "todo" || s.status === "waiting" || s.status === "blocked") ?? [];
  const targets: SkipTarget[] = (target?.mode === "close" ? open : open.slice(0, 1))
    .filter((s) => !!s.anchorId)
    .map((s) => ({ stepKey: s.step.key, anchor: s.anchor, anchorId: s.anchorId! }));

  const submit = async () => {
    if (!target || !reason.trim() || targets.length === 0) return;
    try {
      await skip.mutateAsync({ targets, reason: reason.trim() });
      toast.success(target.mode === "close" ? "Onboarding afgesloten" : "Stap overgeslagen");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Overslaan mislukt");
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.mode === "close" ? "Onboarding afsluiten" : "Stap overslaan"}</DialogTitle>
          <DialogDescription>
            {target?.mode === "close"
              ? `Alle resterende stappen van ${target?.client.company_name} worden overgeslagen; de onboarding gaat naar Archief. Je kunt dit altijd heropenen.`
              : `De stap "${targets[0] ? target?.states.find((s) => s.step.key === targets[0].stepKey)?.step.label : "—"}" wordt overgeslagen en de kaart schuift door. De fase blijft verder gewoon de werkelijkheid volgen.`}
          </DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Er staat niets meer open om over te slaan.</p>
        ) : (
          <div className="space-y-2">
            {target?.mode === "close" && (
              <p className="text-xs text-muted-foreground">Wordt overgeslagen: {targets.map((t) => ONBOARDING_STEPS.find((s) => s.key === t.stepKey)?.label).join(" · ")}</p>
            )}
            <Textarea
              autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Waarom? Bijv. 'klant heeft geen laadpalen bij ons' of 'materiaal lag er al'"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={!reason.trim() || targets.length === 0 || skip.isPending}>
            {target?.mode === "close" ? "Afsluiten" : "Overslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Naam, klantnummer, offertenummer of e-portal-ordernummer. */
function matchesSearch(c: OnboardingClient, q: string): boolean {
  if (!q) return true;
  const order = primaryOrder(c);
  const haystack = [
    c.company_name, c.contact_name, c.contact_email, c.quote_number,
    c.client_number != null ? `#${c.client_number}` : null,
    order?.egroup_order_number,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default function SalesOnboarding() {
  const navigate = useNavigate();
  const { items, skips, concepts, isLoading } = useOnboardingPipeline();
  const sendInvite = useSendOnboardingInvite();
  const startPrep = useStartWorkPreparation();
  const unskip = useUnskipSteps();
  const [linkFor, setLinkFor] = useState<OnboardingClient | null>(null);
  const [handoffFor, setHandoffFor] = useState<OnboardingClient | null>(null);
  const [materialsFor, setMaterialsFor] = useState<OnboardingClient | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<OnboardingClient | null>(null);
  const [createFor, setCreateFor] = useState<QuoteForClient | null>(null);
  const [skipFor, setSkipFor] = useState<{ client: OnboardingClient; states: StepState[]; mode: "step" | "close" } | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState("");

  // Eén ladder voor iedereen: per kaart de stapstatussen + de huidige stap. Geen
  // scope-tabs meer — de scope bepaalt alleen wélke stappen van toepassing zijn.
  const cards = useMemo(() => {
    return items
      .filter((c) => matchesSearch(c, search))
      .map((c) => {
        const states = stepStates(c, skips as SkipIndex);
        const cur = currentStep(states);
        return {
          client: c,
          states,
          stage: (cur?.step.key ?? "archief") as OnboardingStage,
          blockedReason: null as string | null,
          priority: attentionFor(c, undefined, skips as SkipIndex).priority,
          skipped: states.filter((s) => s.status === "skipped"),
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }, [items, skips, search]);

  const byStage = useMemo(() => {
    const map = new Map<OnboardingStage, typeof cards>();
    for (const s of ONBOARDING_STEPS) map.set(s.key, []);
    for (const c of cards) map.get(c.stage)?.push(c);
    return map;
  }, [cards]);

  // De dialog leest de VERSE kaart uit de query-data (statussen/teller bewegen
  // mee); de state houdt alleen vast wélke kaart open is.
  const materialsClient = materialsFor ? (items.find((c) => c.id === materialsFor.id) ?? materialsFor) : null;
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

  const onReopen = async (states: StepState[]) => {
    const targets: SkipTarget[] = states
      .filter((s) => s.status === "skipped" && s.anchorId)
      .map((s) => ({ stepKey: s.step.key, anchor: s.anchor, anchorId: s.anchorId! }));
    if (targets.length === 0) return;
    try {
      await unskip.mutateAsync(targets);
      toast.success("Onboarding heropend");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Heropenen mislukt");
    }
  };

  const stages = ONBOARDING_STEPS.filter((s) => showArchive || s.key !== "archief");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Eén proces voor iedereen — elke klant loopt dezelfde stappen, alleen niet allemaal vanaf hetzelfde punt.
            De fase volgt automatisch de echte status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek klant, offerte- of ordernummer…"
              className="h-9 w-full pl-8 sm:w-64"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? "Verberg archief" : "Toon archief"}
          </Button>
          <Button size="sm" onClick={() => navigate("/beheer/klanten/nieuw")}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Onboarding starten
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 flex-shrink-0 rounded-xl" />)}
        </div>
      ) : (
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => {
            const columnCards = byStage.get(s.key) ?? [];
            // Een kolom die voor niemand van toepassing is dimmen we, in plaats van
            // hem te verbergen: zo blijft de volledige ladder altijd zichtbaar.
            const relevant = columnCards.length > 0;
            return (
              <div
                key={s.key}
                className={`flex flex-col rounded-xl border bg-muted/20 ${relevant ? "min-w-[210px] max-w-[300px] flex-1" : "min-w-[130px] max-w-[160px] opacity-60"}`}
              >
                <div className="border-b px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="truncate text-sm font-semibold">{s.label}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{columnCards.length}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.hint}</p>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  {columnCards.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground/60">—</p>}
                  {columnCards.map(({ client: c, states, stage, skipped }) => {
                    const cur = states.find((st) => st.step.key === stage);
                    return (
                      <div key={`${c.kind ?? "client"}:${c.id}`} className="space-y-2 rounded-lg border bg-card p-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.company_name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {c.client_number != null ? `Klant #${c.client_number}` : c.quote_number ?? (c.kind === "order" ? "Losse opdracht" : "")}
                            </p>
                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${SCOPE_BADGE_CLASS[clientScope(c.needs_installation, c.managed)]}`}>
                              {SCOPE_SHORT[clientScope(c.needs_installation, c.managed)]}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center">
                            {c.kind === "client" && (
                              <button type="button" onClick={() => navigate(`/beheer/klanten/${c.id}`)} aria-label="Open klant" className="text-muted-foreground hover:text-foreground">
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" aria-label="Meer acties" className="ml-0.5 text-muted-foreground hover:text-foreground">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem disabled={stage === "archief"} onClick={() => setSkipFor({ client: c, states, mode: "step" })}>
                                  <SkipForward className="mr-2 h-3.5 w-3.5" /> Stap overslaan…
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={stage === "archief"} onClick={() => setSkipFor({ client: c, states, mode: "close" })}>
                                  <Ban className="mr-2 h-3.5 w-3.5" /> Onboarding afsluiten…
                                </DropdownMenuItem>
                                {skipped.length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onReopen(states)}>
                                      <Undo2 className="mr-2 h-3.5 w-3.5" /> Heropenen ({skipped.length})
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <StepRail states={states} />

                        <NextAction
                          client={c} stage={stage} blockedReason={cur?.status === "blocked" ? cur.reason : null}
                          // Installatie hangt het concept aan de order, activatie aan de klant.
                          concept={
                            concepts.byOrder.get(primaryOrder(c)?.id ?? "")
                            ?? concepts.byClient.get(c.id)
                            ?? null
                          }
                          onLink={setLinkFor} onInvite={onInvite} onInvoice={setInvoiceFor}
                          onCreate={(cl) => cl._quoteForClient && setCreateFor(cl._quoteForClient)}
                          onStartPrep={onStartPrep} onMaterials={setMaterialsFor} onHandoff={setHandoffFor}
                          startingPrep={startPrep.isPending}
                          inviting={invitingId === c.id} navigate={navigate}
                        />

                        {skipped.length > 0 && (
                          <p className="truncate text-[10px] italic text-muted-foreground" title={skipped.map((s) => `${s.step.label}: ${s.reason}`).join("\n")}>
                            Overgeslagen: {skipped.map((s) => s.step.label).join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
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
      <SkipDialog target={skipFor} onClose={() => setSkipFor(null)} />
    </div>
  );
}
