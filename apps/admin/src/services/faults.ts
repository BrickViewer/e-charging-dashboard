// Pure, framework-vrije logica voor de storingen-module. Unit-testbaar.
// classifyFault/isStaleHeartbeat hebben een Deno-tweeling in
// supabase/functions/eflux-sync/faults.ts — houd beide in sync.

export type FaultReason = "connectivity" | "operational" | "heartbeat";
export type FaultClass = { isFault: boolean; reason: FaultReason | null };

// Connectivity-states die een storing zijn.
const FAULT_CONNECTIVITY = new Set(["disconnected", "access-denied"]);
// Operational-status set: deze provider levert alleen 'live'/'archived', dus leeg.
// Staat klaar als config-punt mocht de provider OCPP-statussen gaan leveren.
const FAULT_OPERATIONAL = new Set<string>([]);
// Lifecycle-status die NOOIT een storing is (paal is uitgefaseerd, geen fout).
const HEALTHY_LIFECYCLE_GUARD = new Set(["archived"]);

export function classifyFault(input: {
  connectivityState?: string | null;
  operationalStatus?: string | null;
  isDisabled?: boolean | null;
}): FaultClass {
  if (input.isDisabled) return { isFault: false, reason: null };
  if (input.connectivityState === "pending-first-connection") return { isFault: false, reason: null };
  if (input.operationalStatus && HEALTHY_LIFECYCLE_GUARD.has(input.operationalStatus)) {
    return { isFault: false, reason: null };
  }
  if (input.connectivityState && FAULT_CONNECTIVITY.has(input.connectivityState)) {
    return { isFault: true, reason: "connectivity" };
  }
  if (input.operationalStatus && FAULT_OPERATIONAL.has(input.operationalStatus)) {
    return { isFault: true, reason: "operational" };
  }
  return { isFault: false, reason: null };
}

// Zacht 'verdacht'-signaal: paal lijkt verbonden maar stuurde lang geen hartslag.
export function isStaleHeartbeat(
  lastHeartbeatAt: string | null | undefined,
  graceMinutes: number,
  now: number = Date.now(),
): boolean {
  if (!lastHeartbeatAt) return false;
  const t = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > graceMinutes * 60_000;
}

// ── Workflow ────────────────────────────────────────────────────────────────
export type FaultStatus =
  | "nieuw"
  | "eflux_gemeld"
  | "klant_gecontacteerd"
  | "bezoek_ingepland"
  | "opgelost"
  | "automatisch_hersteld"
  | "vals_alarm";

export const FAULT_STATUS_LABELS: Record<FaultStatus, string> = {
  nieuw: "Nieuw",
  eflux_gemeld: "e-Flux gemeld",
  klant_gecontacteerd: "Klant gecontacteerd",
  bezoek_ingepland: "Bezoek ingepland",
  opgelost: "Opgelost",
  automatisch_hersteld: "Automatisch hersteld",
  vals_alarm: "Vals alarm",
};

export const CLOSED_STATUSES: FaultStatus[] = ["opgelost", "automatisch_hersteld", "vals_alarm"];

export function isOpenStatus(status: FaultStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

export const FAULT_REASON_LABELS: Record<FaultReason, string> = {
  connectivity: "Geen verbinding",
  operational: "Operationele fout",
  heartbeat: "Geen hartslag",
};

// Acties die de monteur kan uitvoeren; bepaalt status + tijdstempelveld.
export type FaultAction = {
  key: string;
  label: string;
  toStatus: FaultStatus;
  stampField?: "eflux_reported_at" | "customer_contacted_at" | "visit_scheduled_at" | "resolved_at";
  needsDate?: boolean; // bezoekdatum
};

export const FAULT_ACTIONS: FaultAction[] = [
  { key: "eflux", label: "e-Flux gemeld", toStatus: "eflux_gemeld", stampField: "eflux_reported_at" },
  { key: "klant", label: "Klant gecontacteerd", toStatus: "klant_gecontacteerd", stampField: "customer_contacted_at" },
  { key: "bezoek", label: "Bezoek inplannen", toStatus: "bezoek_ingepland", stampField: "visit_scheduled_at", needsDate: true },
  { key: "opgelost", label: "Markeer opgelost", toStatus: "opgelost", stampField: "resolved_at" },
  { key: "vals", label: "Vals alarm", toStatus: "vals_alarm", stampField: "resolved_at" },
];

// Beschikbare acties voor een storing met de gegeven status: open storingen
// kunnen altijd vooruit en kunnen altijd worden afgesloten.
export function availableActions(status: FaultStatus): FaultAction[] {
  if (!isOpenStatus(status)) return [];
  return FAULT_ACTIONS;
}

// ── Beste contact om te bellen ───────────────────────────────────────────────
export interface ContactCandidate {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
}

// Voorkeur: primaire persoon uit company_persons; anders de gedenormaliseerde
// contactvelden op de klant.
export function resolveBestContact(
  client: { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null } | null | undefined,
  companyPersons?: { is_primary: boolean; role?: string | null; person?: { full_name?: string | null; email?: string | null; phone?: string | null; role?: string | null } | null }[] | null,
): ContactCandidate {
  const primary = (companyPersons ?? []).find((cp) => cp.is_primary && cp.person)
    ?? (companyPersons ?? []).find((cp) => cp.person);
  if (primary?.person) {
    return {
      name: primary.person.full_name ?? null,
      email: primary.person.email ?? null,
      phone: primary.person.phone ?? null,
      role: primary.role ?? primary.person.role ?? null,
    };
  }
  return {
    name: client?.contact_name ?? null,
    email: client?.contact_email ?? null,
    phone: client?.contact_phone ?? null,
    role: null,
  };
}
