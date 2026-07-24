// HET onboarding-model: één geordende ladder van stappen die IEDEREEN afloopt.
//
// Er is geen aparte flow per scope meer. Elke stap zegt zelf of hij van toepassing
// is (`applies`), of hij klaar is (`done`) en of hij nú uitvoerbaar is (`blockedBy`).
// Een klant "stroomt in" op de eerste stap die voor hem openstaat — een getekende
// alleen-beheer-offerte begint bij 'klant aanmaken', een alleen-installatie-order
// bij 'werkvoorbereiding', een bestaande klant die erbij koopt bij 'locaties
// koppelen'. Recordtype (offerte / clientloze order / echte klant) is daarmee een
// vóórwaarde geworden, geen aparte tak.
//
// Puur en framework-vrij (zelfde stijl als onboardingOverview.ts): geen react-query,
// geen supabase-client. Daardoor volledig unit-testbaar.
import type { MaterialStatus } from "@/services/installationHandoff";
import type { QuoteForClient } from "@/components/sales/CreateClientFromQuoteDialog";

// --- Types (wonen hier zodat dit bestand geen imports uit de hooks nodig heeft) ---

export type OnbOrder = {
  id: string;
  quote_id: string | null;
  status: string | null;
  egroup_order_id: string | null;
  egroup_order_number: string | null;
  external_status: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  wefact_invoice_code: string | null;
  wefact_invoice_id: string | null;
  scheduled_date: string | null;
  work_prep_started_at: string | null;
  materials_expected_at: string | null;
  preparation_notes: string | null;
  materials_synced_at: string | null;
  last_sync_error: string | null;
  site_street: string | null;
  site_house_number: string | null;
  site_postal: string | null;
  site_city: string | null;
  site_contact_name: string | null;
  site_contact_email: string | null;
  site_contact_phone: string | null;
  service_summary: string | null;
  notes: string | null;
  created_at?: string | null;
  /** Alleen de statussen — voedt de voortgangsteller op de kaart. */
  installation_order_materials?: { status: MaterialStatus }[] | null;
};

export type OnbLocation = { id: string; archived_at?: string | null };
export type OnbInvite = { id: string; status: string | null };

/** Waar een kaart vandaan komt. Bepaalt niet de flow, wél welke stappen al kunnen. */
export type OnboardingKind = "client" | "order" | "quote";

export type OnboardingClient = {
  id: string;
  company_name: string;
  client_number: number | null;
  status: string | null;
  portal_user_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  payment_onboarding_status: string | null;
  needs_installation: boolean | null;
  managed: boolean | null;
  vat_status: string | null;
  kvk: string | null;
  btw_number: string | null;
  billing_address_street: string | null;
  billing_address_postal: string | null;
  billing_address_city: string | null;
  /** Eenmalige activatiekosten uit de getekende offerte (excl. BTW). */
  activation_fee_total?: number | null;
  /** Al gefactureerd deel (trigger-cache op clients, nooit met de hand schrijven). */
  activation_invoiced_total?: number | null;
  installation_orders: OnbOrder[] | null;
  locations: OnbLocation[] | null;
  client_invitations: OnbInvite[] | null;
  /** Herkomst van de kaart; ontbreekt = echte klant (zo blijven bestaande fixtures geldig). */
  kind?: OnboardingKind;
  // True voor het "order-only" pad (installatie zonder klantaccount): de kaart is geen echte client.
  is_order_only?: boolean;
  /** Offertenummer voor de kaart/zoekfunctie (order- en offerte-kaarten). */
  quote_number?: string | null;
  // Voor order-/offerte-kaarten: de offerte om het klantaccount mee aan te maken.
  _quoteForClient?: QuoteForClient;
};

// --- Overgeslagen stappen -------------------------------------------------------

export type StepAnchor = "client" | "order" | "quote";

export type OnboardingStepSkip = {
  step_key: string;
  client_id: string | null;
  installation_order_id: string | null;
  quote_id: string | null;
  reason: string;
};

/** Snelle opzoektabel `${ankerId}:${stapKey}` → reden. */
export type SkipIndex = Map<string, string>;

export function buildSkipIndex(rows: readonly OnboardingStepSkip[] | null | undefined): SkipIndex {
  const map: SkipIndex = new Map();
  for (const r of rows ?? []) {
    const anchorId = r.client_id ?? r.installation_order_id ?? r.quote_id;
    if (anchorId) map.set(`${anchorId}:${r.step_key}`, r.reason);
  }
  return map;
}

// --- Feiten ---------------------------------------------------------------------

export interface OnboardingFacts {
  kind: OnboardingKind;
  /** Er is een echt klantaccount (clients-rij). */
  hasClient: boolean;
  /** Er is een offerte om het klantaccount uit te maken. */
  hasQuote: boolean;
  managed: boolean;
  needsInstall: boolean;
  order: OnbOrder | null;
  hasOrder: boolean;
  hasEmail: boolean;
  invited: boolean;
  prepStarted: boolean;
  handedOff: boolean;
  delivered: boolean;
  invoiced: boolean;
  hasLocation: boolean;
  detailsComplete: boolean;
  /** Verkochte activatiekosten (excl. BTW). */
  activationFee: number;
  /** Al gefactureerd (verstuurd, niet gecrediteerd). */
  activationInvoiced: number;
  /** Nog te factureren activatiekosten. */
  activationOpen: number;
  syncError: string | null;
  scheduledDate: string | null;
  /** Id's van de drie mogelijke skip-ankers. */
  clientId: string | null;
  orderId: string | null;
  quoteId: string | null;
}

/** Klant heeft betaal- (IBAN) + bedrijfsgegevens compleet → onboarding klaar. */
export function isDetailsComplete(c: OnboardingClient): boolean {
  const company =
    !!c.company_name && !!c.vat_status &&
    !!c.billing_address_street && !!c.billing_address_postal && !!c.billing_address_city;
  const kvkOk = c.vat_status === "private" || !!c.kvk;
  const btwOk = c.vat_status !== "vat_liable" || !!c.btw_number;
  const bankOk = ["saved", "needs_review"].includes(c.payment_onboarding_status ?? "");
  return company && kvkOk && btwOk && bankOk;
}

export function hasPendingInvite(c: OnboardingClient): boolean {
  return (c.client_invitations ?? []).some((i) => i.status === "pending");
}

/**
 * De order waar de kaart nú over gaat. Vervangt zowel `installation_orders[0]` als
 * de oude `.some()`-aggregatie over álle orders — die liet één oude gefactureerde
 * order een nieuwe installatie meteen als afgerond gelden.
 *
 * Geannuleerde orders tellen NIET mee (die status is met de hand instelbaar via
 * InstallationOrdersCard); anders zet een geannuleerde order de kaart permanent vast.
 * De query levert nieuwste-eerst, dus de eerste treffer is de juiste.
 */
export function activeOrder(c: OnboardingClient): OnbOrder | null {
  const orders = (c.installation_orders ?? []).filter(Boolean);
  if (orders.length === 0) return null;
  // Alles geannuleerd = er is niets te installeren. Bewust GEEN terugval op de geannuleerde
  // order: die gaf een dode "Werkvoorbereiding starten"-knop en hield de kaart vast, terwijl de
  // klant misschien nog wél openstaande activatiekosten heeft.
  const levend = orders.filter((o) => o.status !== "geannuleerd");
  return levend.find((o) => !o.invoiced_at) ?? levend[0] ?? null;
}

export function onboardingFacts(c: OnboardingClient): OnboardingFacts {
  const kind: OnboardingKind = c.kind ?? (c.is_order_only ? "order" : "client");
  const order = activeOrder(c);
  const hasClient = kind === "client";
  // Een clientloze order zonder offerte-join weten we níets van: dan is 'beheer'
  // niet aan te tonen en is het per definitie een losse installatie-opdracht.
  const managed = c.managed !== false;
  // Order- en offertekaarten hebben geen clients-rij → 0, dus gedrag exact als voorheen.
  const activationFee = Number(c.activation_fee_total ?? 0);
  const activationInvoiced = Number(c.activation_invoiced_total ?? 0);
  return {
    kind,
    hasClient,
    hasQuote: !!(order?.quote_id || c._quoteForClient?.id),
    managed,
    needsInstall: c.needs_installation !== false,
    order,
    hasOrder: !!order,
    hasEmail: !!(c.contact_email ?? "").trim(),
    invited: hasPendingInvite(c) || !!c.portal_user_id,
    prepStarted: !!order?.work_prep_started_at,
    handedOff: !!order?.egroup_order_id,
    delivered: !!order?.completed_at || order?.status === "afgerond",
    invoiced: !!order?.invoiced_at,
    hasLocation: (c.locations ?? []).filter((l) => !l.archived_at).length > 0,
    detailsComplete: isDetailsComplete(c),
    activationFee,
    activationInvoiced,
    activationOpen: Math.round((activationFee - activationInvoiced) * 100) / 100,
    syncError: order?.last_sync_error ?? null,
    scheduledDate: order?.scheduled_date ?? null,
    clientId: hasClient ? c.id : null,
    orderId: order?.id ?? null,
    quoteId: order?.quote_id ?? c._quoteForClient?.id ?? (kind === "quote" ? c.id : null),
  };
}

// --- De stappentabel ------------------------------------------------------------

export type OnboardingStage =
  | "klant_aanmaken"
  | "klant_uitnodigen"
  | "werkvoorbereiding"
  | "bij_installateur"
  | "locaties_koppelen"
  | "opgeleverd"
  | "gegevens"
  | "archief";

export interface OnboardingStep {
  key: OnboardingStage;
  label: string;
  color: string;
  hint: string;
  /** Eindstation: nooit de "volgende actie", alleen een kolom. */
  terminal?: boolean;
  /**
   * Waar een handmatige 'overslaan' aan hangt (zodat hij de order→klant-overgang overleeft).
   * Mag scope-afhankelijk zijn: de factuurstap hangt aan de ORDER bij een installatie en aan de
   * KLANT bij een losse activatiefactuur — onboarding_step_skips.installation_order_id heeft een
   * FK naar installation_orders, dus daar een client-id in zetten geeft een 23503.
   */
  anchor?: StepAnchor | ((f: OnboardingFacts) => StepAnchor);
  applies: (f: OnboardingFacts) => boolean;
  done: (f: OnboardingFacts) => boolean;
  /** Niet uitvoerbaar? Geef de reden. Geblokkeerde stappen worden nooit de knop. */
  blockedBy?: (f: OnboardingFacts) => string | null;
  /** Passief: wij wachten op iemand anders (installateur/klant), er is geen actie voor ons. */
  passive?: (f: OnboardingFacts) => boolean;
}

// ⚠️ DEZE ARRAYVOLGORDE BEPAALT DE KNOP. De huidige stap is de eerste openstaande
// stap in deze volgorde — verschuif je een regel, dan verschuift de gate mee
// (bv. uitnodigen vóór de installateur-track, bewust zo sinds commit 87059d1).
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "klant_aanmaken",
    label: "Klant account aanmaken",
    color: "#a855f7",
    hint: "Maak het beheer-klantaccount aan",
    anchor: "quote",
    applies: (f) => f.managed,
    done: (f) => f.hasClient,
    blockedBy: (f) => (f.hasClient || f.hasQuote ? null : "Order zonder offerte — account handmatig aanmaken"),
  },
  {
    key: "klant_uitnodigen",
    label: "Klant uitnodigen",
    color: "#ec4899",
    hint: "Portaal-uitnodiging versturen",
    anchor: "client",
    applies: (f) => f.managed,
    done: (f) => f.invited,
    blockedBy: (f) =>
      !f.hasClient ? "Wacht op klantaccount" : !f.hasEmail ? "Geen e-mailadres bekend" : null,
  },
  {
    key: "werkvoorbereiding",
    label: "Werkvoorbereiding",
    color: "#0ea5e9",
    hint: "Materialen bestellen",
    anchor: "order",
    applies: (f) => f.needsInstall,
    // Doorgestuurd = klaar. Opgeleverd/gefactureerd telt óók, zodat een order die
    // buiten de e-portal om is afgehandeld de kaart niet terugtrekt.
    done: (f) => f.handedOff || f.delivered || f.invoiced,
    blockedBy: (f) => (f.hasOrder ? null : "Geen installatie-order"),
  },
  {
    key: "bij_installateur",
    label: "Bij installateur",
    color: "#f59e0b",
    hint: "Wacht op oplevering",
    anchor: "order",
    applies: (f) => f.needsInstall,
    done: (f) => f.delivered || f.invoiced,
    blockedBy: (f) => (!f.hasOrder ? "Geen installatie-order" : !f.handedOff ? "Nog niet doorgestuurd" : null),
    passive: () => true,
  },
  {
    key: "locaties_koppelen",
    label: "Locaties koppelen",
    color: "#8b5cf6",
    hint: "Laadlocatie koppelen",
    anchor: "client",
    applies: (f) => f.managed,
    done: (f) => f.hasLocation,
    blockedBy: (f) => (f.hasClient ? null : "Wacht op klantaccount"),
  },
  {
    // KEY blijft 'opgeleverd' (skip-ankers, twee testsuites en drie switches hangen eraan, en
    // 'opgeleverd' is óók een echte installation_orders.status). Het LABEL is 'Factureren',
    // want de stap geldt nu ook voor beheer-klanten waar niets is opgeleverd.
    key: "opgeleverd",
    label: "Factureren",
    color: "#06b6d4",
    hint: "Eenmalige kosten factureren",
    anchor: (f) => (f.needsInstall && f.hasOrder ? "order" : "client"),
    // Installatie-order factureren, óf openstaande activatiekosten innen. Is er niets te
    // factureren (activatie 0 bij alleen-beheer), dan bestaat de stap niet eens.
    applies: (f) => f.needsInstall || f.activationOpen > 0,
    done: (f) => (f.needsInstall && f.hasOrder ? f.invoiced : f.activationOpen <= 0.005),
    // De schakelaar is 'needsInstall && hasOrder', niet 'needsInstall': anders staat een
    // installatie+beheer-klant met een geannuleerde order permanent op 'blocked' en schuift
    // currentStep() hem door terwijl de activatie openstaat.
    blockedBy: (f) =>
      f.needsInstall && f.hasOrder
        ? (!f.delivered ? "Wacht op oplevering" : null)
        : f.needsInstall && f.activationOpen <= 0
          ? "Geen installatie-order"
          : !f.hasClient
            ? "Wacht op klantaccount"
            : null,
  },
  {
    key: "gegevens",
    label: "Gegevens toevoegen",
    color: "#14b8a6",
    hint: "Wacht op gegevens van klant",
    anchor: "client",
    applies: (f) => f.managed,
    done: (f) => f.detailsComplete,
    blockedBy: (f) => (f.hasClient ? null : "Wacht op klantaccount"),
    passive: () => true,
  },
  {
    key: "archief",
    label: "Archief",
    color: "#22c55e",
    hint: "Onboarding afgerond",
    terminal: true,
    applies: () => true,
    done: () => false,
  },
];

export const STEP_BY_KEY = new Map(ONBOARDING_STEPS.map((s) => [s.key, s]));

// --- Afgeleide toestand per kaart -----------------------------------------------

export type StepStatus =
  | "done"       // afgerond
  | "todo"       // wij zijn aan zet
  | "waiting"    // loopt, maar wij wachten op iemand anders
  | "blocked"    // kan nog niet (voorwaarde niet gehaald)
  | "skipped"    // handmatig overgeslagen
  | "na";        // niet van toepassing voor deze klant

export interface StepState {
  step: OnboardingStep;
  status: StepStatus;
  /** Reden bij 'blocked' of 'skipped'. */
  reason: string | null;
  /** Het OPGELOSTE skip-anker (step.anchor mag een functie van de feiten zijn). */
  anchor: StepAnchor | undefined;
  /** Het skip-anker-id voor deze stap op deze kaart (null = niet over te slaan). */
  anchorId: string | null;
}

function resolveAnchor(step: OnboardingStep, f: OnboardingFacts): StepAnchor | undefined {
  return typeof step.anchor === "function" ? step.anchor(f) : step.anchor;
}

function anchorIdFor(anchor: StepAnchor | undefined, f: OnboardingFacts): string | null {
  switch (anchor) {
    case "client": return f.clientId;
    case "order": return f.orderId;
    // Zonder offerte valt 'klant aanmaken' terug op de order, zodat je hem tóch kunt overslaan.
    case "quote": return f.quoteId ?? f.orderId ?? f.clientId;
    default: return null;
  }
}

export function stepStates(c: OnboardingClient, skips?: SkipIndex): StepState[] {
  const f = onboardingFacts(c);
  return ONBOARDING_STEPS.map((step) => {
    const anchor = resolveAnchor(step, f);
    const anchorId = anchorIdFor(anchor, f);
    const base = { step, anchor, anchorId };
    if (step.terminal) return { ...base, status: "na" as StepStatus, reason: null };
    if (!step.applies(f)) return { ...base, status: "na" as StepStatus, reason: null };
    if (step.done(f)) return { ...base, status: "done" as StepStatus, reason: null };

    const skipReason = anchorId ? skips?.get(`${anchorId}:${step.key}`) : undefined;
    if (skipReason) return { ...base, status: "skipped" as StepStatus, reason: skipReason };

    const blocked = step.blockedBy?.(f) ?? null;
    if (blocked) return { ...base, status: "blocked" as StepStatus, reason: blocked };

    return { ...base, status: (step.passive?.(f) ? "waiting" : "todo") as StepStatus, reason: null };
  });
}

/**
 * De stap waar de kaart nú staat: de EERSTE stap in tabelvolgorde die nog open
 * staat. De ladder is sequentieel — een latere stap dringt niet voor zolang een
 * eerdere nog loopt (een klant die bij de installateur ligt springt dus niet
 * alvast naar 'locaties koppelen').
 *
 * Geblokkeerde stappen worden bewust overgeslagen: anders krijgt bv. een klant
 * zonder installatie-order een dode "Werkvoorbereiding starten"-knop in plaats
 * van het wél uitvoerbare "Locaties koppelen".
 */
export function currentStep(states: readonly StepState[]): StepState | null {
  return states.find((s) => s.status === "todo" || s.status === "waiting") ?? null;
}

/** Niets meer te doen (alles klaar, overgeslagen of n.v.t.) → archief. */
export function isOnboardingDone(states: readonly StepState[]): boolean {
  return currentStep(states) === null;
}

/** De huidige fase van een kaart; 'archief' als er niets meer openstaat. */
export function deriveStage(c: OnboardingClient, skips?: SkipIndex): OnboardingStage {
  return currentStep(stepStates(c, skips))?.step.key ?? "archief";
}
