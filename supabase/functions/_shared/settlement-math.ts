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
