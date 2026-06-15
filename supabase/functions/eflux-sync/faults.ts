// Deno-tweeling van apps/admin/src/services/faults.ts (alleen detectie-logica).
// De app-versie is de unit-geteste bron; houd beide in sync.

export type FaultReason = "connectivity" | "operational" | "heartbeat";
export type FaultClass = { isFault: boolean; reason: FaultReason | null };

const FAULT_CONNECTIVITY = new Set(["disconnected", "access-denied"]);
const FAULT_OPERATIONAL = new Set<string>([]); // provider levert nu geen OCPP-statussen
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
