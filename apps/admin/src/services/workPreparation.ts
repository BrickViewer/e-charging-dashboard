// Puur en framework-vrij: de werkvoorbereidings-gate en het voortgangslabel.
// De gate bepaalt of een order naar de installateur mag (geen enkel materiaal
// mag nog op 'te_bestellen' staan); de edge function order-handoff handhaaft
// dezelfde regel server-side.

import { aggregatePreparationStatus, type MaterialStatus } from "./installationHandoff";

export interface MaterialsGate {
  ok: boolean;
  /** Aantal regels dat nog besteld moet worden. */
  open: number;
  total: number;
}

export function materialsGate(materials: readonly { status: MaterialStatus }[]): MaterialsGate {
  const open = materials.filter((m) => m.status === "te_bestellen").length;
  return { ok: open === 0, open, total: materials.length };
}

/**
 * Stoplicht voor het onboarding-bord — de afgesproken kleurcode:
 * rood = niet (alles) besteld, oranje = besteld maar nog niet alles binnen,
 * groen = alles binnen. Grijs = geen (relevante) materialen.
 */
export interface MaterialsTrafficLight {
  tone: "red" | "amber" | "green" | "muted";
  label: string;
}

export function materialsTrafficLight(materials: readonly { status: MaterialStatus }[]): MaterialsTrafficLight {
  const aggregate = aggregatePreparationStatus(materials.map((m) => m.status));
  switch (aggregate) {
    case "te_bestellen": {
      const open = materials.filter((m) => m.status === "te_bestellen").length;
      return { tone: "red", label: `${open} te bestellen` };
    }
    case "besteld": {
      const relevant = materials.filter((m) => m.status !== "niet_nodig");
      const received = relevant.filter((m) => m.status === "binnen").length;
      return {
        tone: "amber",
        label: received > 0 ? `Besteld · ${received}/${relevant.length} binnen` : "Besteld · wacht op levering",
      };
    }
    case "binnen":
      return { tone: "green", label: "Alle materialen binnen" };
    default:
      return { tone: "muted", label: "Geen materialen" };
  }
}

/**
 * Compacte voortgang voor op de onboarding-kaart en in de dialog:
 * "3/5 besteld · 1 binnen". Teller/noemer gaan over de relevante regels
 * (niet_nodig telt niet mee); besteld én binnen tellen als "besteld".
 */
export function materialsProgressLabel(materials: readonly { status: MaterialStatus }[]): string {
  const relevant = materials.filter((m) => m.status !== "niet_nodig");
  if (materials.length === 0) return "Geen materialen";
  if (relevant.length === 0) return "Geen materialen nodig";
  const ordered = relevant.filter((m) => m.status === "besteld" || m.status === "binnen").length;
  const received = relevant.filter((m) => m.status === "binnen").length;
  const base = `${ordered}/${relevant.length} besteld`;
  return received > 0 ? `${base} · ${received} binnen` : base;
}
