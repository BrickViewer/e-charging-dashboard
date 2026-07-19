// Puur en framework-vrij: vat de onboarding-pijplijn samen voor het directie-
// dashboard. Bepaalt per onboarding de fase, of er actie/aandacht nodig is en
// hoe dringend (priority), zodat de CEO in één oogopslag ziet wat er nog moet
// gebeuren en niets vergeten wordt. Hergebruikt de afgeleide-fase-logica van de
// onboardingmodule; geen backend nodig.
import {
  ONBOARDING_STAGES, deriveStage, hasPendingInvite, primaryOrder,
  type OnboardingClient, type OnboardingStage,
} from "@/hooks/useOnboarding";
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
  const nr = primaryOrder(item)?.egroup_order_number;
  return nr ? `Order ${nr}` : "Naamloze onboarding";
}

// Bepaal fase + aandacht voor één onboarding. De volgorde hieronder bepaalt de
// prioriteit: sync-fout eerst (er ging iets echt mis), dan geld dat blijft
// liggen (te factureren), dan planning, materialen en overige acties.
export function attentionFor(item: OnboardingClient): OnboardingAttention {
  const stage = deriveStage(item);
  const order = primaryOrder(item);
  const base = { item, stage };

  // Sync-fout op de e-portal-koppeling — hoogste urgentie, ongeacht fase.
  if (order?.last_sync_error) {
    return { ...base, actionable: true, tone: "red", label: "Sync-fout — opnieuw syncen", priority: 0 };
  }

  switch (stage) {
    case "opgeleverd":
      return { ...base, actionable: true, tone: "amber", label: "Te factureren", priority: 1 };
    case "bij_installateur":
      // Wél overgedragen maar nog geen plandatum terug van de installateur.
      return order?.scheduled_date
        ? { ...base, actionable: false, tone: "green", label: `Ingepland · ${formatPlan(order.scheduled_date)}`, priority: 90 }
        : { ...base, actionable: true, tone: "amber", label: "Nog in te plannen", priority: 2 };
    case "werkvoorbereiding": {
      const open = materialsGate(order?.installation_order_materials ?? []).open;
      return open > 0
        ? { ...base, actionable: true, tone: "amber", label: `Materialen: ${open} te bestellen`, priority: 3 }
        : { ...base, actionable: true, tone: "green", label: "Klaar om te versturen", priority: 4 };
    }
    case "getekend":
      return { ...base, actionable: true, tone: "amber", label: "Werkvoorbereiding starten", priority: 5 };
    case "klant_aanmaken":
      return { ...base, actionable: true, tone: "amber", label: "Klantaccount aanmaken", priority: 6 };
    case "locaties_koppelen":
      return { ...base, actionable: true, tone: "amber", label: "Locaties koppelen", priority: 7 };
    case "klant_uitnodigen":
      return hasPendingInvite(item)
        ? { ...base, actionable: false, tone: "muted", label: "Uitnodiging verstuurd", priority: 91 }
        : { ...base, actionable: true, tone: "amber", label: "Klant uitnodigen", priority: 8 };
    case "gegevens":
      return { ...base, actionable: false, tone: "muted", label: "Wacht op klantgegevens", priority: 92 };
    case "archief":
    default:
      return { ...base, actionable: false, tone: "muted", label: "Afgerond", priority: 99 };
  }
}

export interface OnboardingSummary {
  /** Aantal lopende onboardings (alle fases behalve archief). */
  total: number;
  archived: number;
  stageCounts: Record<OnboardingStage, number>;
  /** Onboardings die actie/aandacht vragen, dringendste eerst. */
  attention: OnboardingAttention[];
}

export function summarizeOnboarding(items: readonly OnboardingClient[]): OnboardingSummary {
  const stageCounts = Object.fromEntries(ONBOARDING_STAGES.map((s) => [s.key, 0])) as Record<OnboardingStage, number>;
  const attention: OnboardingAttention[] = [];

  for (const item of items) {
    const a = attentionFor(item);
    stageCounts[a.stage] += 1;
    if (a.actionable) attention.push(a);
  }
  attention.sort((x, y) => x.priority - y.priority);

  const archived = stageCounts.archief;
  const total = items.length - archived;
  return { total, archived, stageCounts, attention };
}

function formatPlan(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}
