// Eén bron van waarheid voor de per-kWh service-fee afrekenformule. Bewust ZONDER
// Deno-globals, zodat zowel de edge function aggregate-settlements (Deno) als de
// vitest-parity-test dit kunnen importeren. De app-side spiegel staat in
// apps/admin/src/services/calculations.ts (calculateSettlement) en wordt door
// settlement-math.parity.test.ts aan deze module vastgepind — drift faalt luid.
//
// LET OP: de fee is 0.10 = TIEN CENT per kWh. NIET 0.001 (= 0,10 cent).
export const DEFAULT_ECHARGING_FEE_PER_KWH = 0.10;

export interface ComputeSettlementInput {
  totalKwh: number;
  grossRevenue: number; // som reimbursement_amount (excl BTW) = bron van waarheid
  feePerKwh?: number;   // per-klant/org tarief; valt terug op de default
  feeWaived?: boolean;  // maand kwijtgescholden → fee 0
}

export interface ComputeSettlementResult {
  feePerKwh: number;        // toegepast tarief (snapshot)
  echargingRevenue: number; // = feePerKwh * totalKwh (GEEN minimum)
  clientPayout: number;     // = grossRevenue - echargingRevenue
}

export function computeSettlement(i: ComputeSettlementInput): ComputeSettlementResult {
  const feePerKwh = i.feeWaived ? 0 : (i.feePerKwh ?? DEFAULT_ECHARGING_FEE_PER_KWH);
  const echargingRevenue = feePerKwh * i.totalKwh; // GEEN minimum
  return { feePerKwh, echargingRevenue, clientPayout: i.grossRevenue - echargingRevenue };
}

// ── Activatiekosten verrekenen met de eerste vergoedingsfactuur(en) ──────────
// Activatie is E-Charging's verkoop aan de klant → ALTIJD 21% output-BTW, de
// tegengestelde BTW-richting van de vergoeding (self-billing). Daarom wordt de
// aftrek gecapt op de INCL-BTW-grondslag, zodat "netto over te boeken" =
// vergoeding incl − activatie incl nooit onder 0 komt — óók voor niet-BTW-klanten
// (vergoeding 0%, activatie 21%). De rest schuift door naar de volgende maand.
// Puur afgeleid van activation_fee_total + reeds-verrekend + deze payout →
// idempotent (herruns geven exact hetzelfde). Getest in activation-netting.test.ts.
export const ACTIVATION_VAT_RATE = 0.21;

export interface ActivationCostInput {
  activationTotal: number;   // clients.activation_fee_total (excl BTW), totale te verrekenen activatie
  alreadyNetted: number;     // Σ activation_cost van eerdere maanden (excl BTW)
  clientPayout: number;      // bruto vergoeding van deze maand (excl BTW)
  vatRate: number;           // BTW-tarief van de VERGOEDING (0.21 BTW-plichtig, 0 anders)
}

export function computeActivationCost(i: ActivationCostInput): number {
  const remaining = Math.max(0, i.activationTotal - i.alreadyNetted);
  const cap = (Math.max(0, i.clientPayout) * (1 + i.vatRate)) / (1 + ACTIVATION_VAT_RATE);
  return Math.max(0, Math.min(remaining, cap));
}
