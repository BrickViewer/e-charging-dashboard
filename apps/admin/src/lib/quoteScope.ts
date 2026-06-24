// Offerte-scope = twee orthogonale assen (installatie × beheer) → 3 geldige keuzes.
// with_management = beheer-as (settlements/dashboard); with_installation = levering & installatie-as.

export type QuoteScope = "installatie_beheer" | "alleen_installatie" | "alleen_beheer";

export const SCOPE_LABEL: Record<QuoteScope, string> = {
  installatie_beheer: "Installatie + beheer",
  alleen_installatie: "Alleen installatie",
  alleen_beheer: "Alleen beheer",
};

export const SCOPE_HINT: Record<QuoteScope, string> = {
  installatie_beheer: "Levering & installatie + e-Charging dashboard/opbrengstdeling.",
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
