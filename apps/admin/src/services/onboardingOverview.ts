// Puur en framework-vrij: vat de onboarding-pijplijn samen voor het directie-
// dashboard. Bepaalt per onboarding de fase, of er actie/aandacht nodig is en
// hoe dringend (priority), zodat de CEO in één oogopslag ziet wat er nog moet
// gebeuren en niets vergeten wordt. Leunt op HET stappenmodel in
// services/onboardingPipeline.ts — bord en dashboard delen dus één waarheid.
import {
  ONBOARDING_STEPS, activeOrder, currentStep, onboardingFacts, stepStates,
  type OnboardingClient, type OnboardingStage, type SkipIndex,
} from "@/services/onboardingPipeline";
import { materialsGate } from "@/services/workPreparation";

export type AttentionTone = "red" | "amber" | "green" | "muted";

export interface OnboardingAttention {
  item: OnboardingClient;
  stage: OnboardingStage;
  /** Actie/aandacht vereist van ons? Passieve "wacht op extern"-fases = false. */
  actionable: boolean;
  tone: AttentionTone;
  /** Korte vlag, bv. "Te factureren", "Nog in te plannen", "Sync-fout". */
  label: string;
  /** Lager = dringender (sortering van de aandachtslijst). */
  priority: number;
}

// Naam voor in de lijst: bedrijfsnaam, of het e-portal-ordernummer bij een
// clientloze order-only onboarding zonder naam.
export function onboardingName(item: OnboardingClient): string {
  const name = (item.company_name ?? "").trim();
  if (name) return name;
  const nr = activeOrder(item)?.egroup_order_number;
  return nr ? `Order ${nr}` : "Naamloze onboarding";
}

/** Lokale dag als YYYY-MM-DD — vergelijkbaar met de date-string van scheduled_date. */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Bepaal fase + aandacht voor één onboarding. De volgorde hieronder bepaalt de
// prioriteit: sync-fout eerst (er ging iets echt mis), dan een ontbrekende order,
// dan een verstreken installatiedatum, dan geld dat blijft liggen (te factureren),
// planning, materialen en overige acties.
export function attentionFor(
  item: OnboardingClient,
  todayStr: string = todayISO(),
  skips?: SkipIndex,
): OnboardingAttention {
  const states = stepStates(item, skips);
  const stage = currentStep(states)?.step.key ?? "archief";
  const f = onboardingFacts(item);
  const order = f.order;
  const base = { item, stage };

  // Sync-fout op de e-portal-koppeling — hoogste urgentie, ongeacht fase.
  if (order?.last_sync_error) {
    return { ...base, actionable: true, tone: "red", label: "Sync-fout — opnieuw syncen", priority: 0 };
  }
  // Getekende installatie-offerte zonder installatie-order: de sign-trigger heeft
  // niet gedraaid. Dat is een storing, geen scope-keuze — en anders onzichtbaar.
  if (stage !== "archief" && f.needsInstall && f.hasQuote && !f.hasOrder) {
    return { ...base, actionable: true, tone: "red", label: "Installatie-order ontbreekt", priority: 0 };
  }

  switch (stage) {
    case "bij_installateur": {
      // Overgedragen aan de installateur.
      const date = order?.scheduled_date;
      if (!date) return { ...base, actionable: true, tone: "amber", label: "Nog in te plannen", priority: 3 };
      if (date < todayStr) return { ...base, actionable: true, tone: "red", label: `Installatiedatum verstreken · ${formatPlan(date)}`, priority: 1 };
      // Ingepland voor vandaag/later → op koers (niet in de aandachtslijst; wél in de Ingepland-lijst).
      return { ...base, actionable: false, tone: "green", label: `Ingepland · ${formatPlan(date)}`, priority: 90 };
    }
    case "opgeleverd":
      return { ...base, actionable: true, tone: "amber", label: "Te factureren", priority: 2 };
    // Klant-onboarding komt vroeg (direct na tekenen), uitnodigen vóór koppelen.
    case "klant_aanmaken":
      return { ...base, actionable: true, tone: "amber", label: "Klantaccount aanmaken", priority: 4 };
    case "klant_uitnodigen":
      return hasPendingInviteFlag(item)
        ? { ...base, actionable: false, tone: "muted", label: "Uitnodiging verstuurd", priority: 91 }
        : { ...base, actionable: true, tone: "amber", label: "Klant uitnodigen", priority: 5 };
    case "werkvoorbereiding": {
      if (!order?.work_prep_started_at) {
        return { ...base, actionable: true, tone: "amber", label: "Werkvoorbereiding starten", priority: 7 };
      }
      const open = materialsGate(order?.installation_order_materials ?? []).open;
      return open > 0
        ? { ...base, actionable: true, tone: "amber", label: `Materialen: ${open} te bestellen`, priority: 6 }
        : { ...base, actionable: true, tone: "green", label: "Klaar om te versturen", priority: 7 };
    }
    case "locaties_koppelen":
      return { ...base, actionable: true, tone: "amber", label: "Locaties koppelen", priority: 8 };
    case "gegevens":
      return { ...base, actionable: false, tone: "muted", label: "Wacht op klantgegevens", priority: 92 };
    case "archief":
    default:
      return { ...base, actionable: false, tone: "muted", label: "Afgerond", priority: 99 };
  }
}

function hasPendingInviteFlag(item: OnboardingClient): boolean {
  return (item.client_invitations ?? []).some((i) => i.status === "pending");
}

export interface PlannedInstallation {
  item: OnboardingClient;
  /** Geplande installatiedatum (YYYY-MM-DD). */
  date: string;
}

export interface OnboardingSummary {
  /** Aantal lopende onboardings (alle fases behalve archief). */
  total: number;
  archived: number;
  stageCounts: Record<OnboardingStage, number>;
  /** Onboardings die actie/aandacht vragen, dringendste eerst. */
  attention: OnboardingAttention[];
  /** Aankomende geplande installaties (datum ≥ vandaag), oplopend op datum. */
  planned: PlannedInstallation[];
}

export function summarizeOnboarding(
  items: readonly OnboardingClient[],
  todayStr: string = todayISO(),
  skips?: SkipIndex,
): OnboardingSummary {
  const stageCounts = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.key, 0])) as Record<OnboardingStage, number>;
  const attention: OnboardingAttention[] = [];
  const planned: PlannedInstallation[] = [];

  for (const item of items) {
    const a = attentionFor(item, todayStr, skips);
    stageCounts[a.stage] += 1;
    if (a.actionable) attention.push(a);
    // Ingepland = de actieve order heeft een datum en is nog niet opgeleverd/gefactureerd.
    // (Niet op de fase gekoppeld: een installatie+beheer-order die nog op zijn klantaccount
    // wacht staat in 'klant_aanmaken' maar is wél gewoon ingepland.)
    const order = activeOrder(item);
    const date = order?.scheduled_date;
    if (date && date >= todayStr && !order?.completed_at && !order?.invoiced_at) planned.push({ item, date });
  }
  attention.sort((x, y) => x.priority - y.priority);
  planned.sort((x, y) => x.date.localeCompare(y.date));

  const archived = stageCounts.archief;
  const total = items.length - archived;
  return { total, archived, stageCounts, attention, planned };
}

function formatPlan(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}
