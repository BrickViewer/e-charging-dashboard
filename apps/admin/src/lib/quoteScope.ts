// Offerte-scope = twee orthogonale assen (installatie × beheer) → 3 geldige keuzes.
// with_management = beheer-as (settlements/dashboard); with_installation = levering & installatie-as.

export type QuoteScope = "installatie_beheer" | "alleen_installatie" | "alleen_beheer";

export const SCOPE_LABEL: Record<QuoteScope, string> = {
  installatie_beheer: "Installatie + beheer",
  alleen_installatie: "Alleen installatie",
  alleen_beheer: "Alleen beheer",
};

export const SCOPE_HINT: Record<QuoteScope, string> = {
  // "opbrengstdeling" is handboek-verboden taal (en een dood concept sinds het afname-model).
  installatie_beheer: "Levering & installatie + e-Charging dashboard/maandelijkse afrekening.",
  alleen_installatie: "Alleen levering & installatie, geen beheer.",
  alleen_beheer: "Alleen beheer van bestaande laadpalen (geen installatie).",
};

export const SCOPES: QuoteScope[] = ["installatie_beheer", "alleen_installatie", "alleen_beheer"];

export function scopeFromFlags(withInstallation: boolean, withManagement: boolean): QuoteScope {
  if (withInstallation && withManagement) return "installatie_beheer";
  if (withInstallation && !withManagement) return "alleen_installatie";
  return "alleen_beheer"; // !installation && management (de enige overgebleven geldige combo)
}

export function flagsFromScope(scope: QuoteScope): { withInstallation: boolean; withManagement: boolean } {
  switch (scope) {
    case "installatie_beheer": return { withInstallation: true, withManagement: true };
    case "alleen_installatie": return { withInstallation: true, withManagement: false };
    case "alleen_beheer": return { withInstallation: false, withManagement: true };
  }
}

// Compacte labels + badge-kleuren voor de lead-/onboarding-kaarten.
export const SCOPE_SHORT: Record<QuoteScope, string> = {
  installatie_beheer: "Inst. + beheer",
  alleen_installatie: "Installatie",
  alleen_beheer: "Beheer",
};

export const SCOPE_BADGE_CLASS: Record<QuoteScope, string> = {
  installatie_beheer: "bg-indigo-100 text-indigo-700",
  alleen_installatie: "bg-amber-100 text-amber-700",
  alleen_beheer: "bg-emerald-100 text-emerald-700",
};

// Scope van een KLANT (onboarding) afgeleid uit needs_installation/managed (null = aan, conform de DB-default).
export function clientScope(needsInstallation: boolean | null | undefined, managed: boolean | null | undefined): QuoteScope {
  return scopeFromFlags(needsInstallation !== false, managed !== false);
}
