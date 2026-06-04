// ============================================================================
// Service-fee model (vervangt de oude revenue-share split, die per 2026 is
// afgeschaft). E-Charging rekent een vaste fee per geladen kWh; de rest gaat
// naar de klant. Geen minimum, geen energie-doorbelasting, geen 75/25-split.
//
// LET OP: de fee is 0.10 = TIEN CENT per kWh. NIET 0.001 (= 0,10 cent).
// calculations.test.ts faalt expliciet als deze constante verkeerd staat.
// ============================================================================
export const DEFAULT_ECHARGING_FEE_PER_KWH = 0.10;

export interface SettlementInput {
  totalKwh: number;
  grossRevenue: number;       // som reimbursement_amount (excl BTW) = bron van waarheid
  feePerKwh?: number;         // optioneel; valt terug op DEFAULT_ECHARGING_FEE_PER_KWH
}

export interface SettlementResult {
  echargingFeePerKwh: number; // toegepast tarief (voor snapshot)
  echargingRevenue: number;   // = feePerKwh * totalKwh (GEEN minimum)
  clientPayout: number;       // = grossRevenue - echargingRevenue
}

// Eén bron van waarheid voor de afreken-formule (gebruikt door admin- en portal-UI).
// De edge function aggregate-settlements houdt een identieke Deno-kopie aan.
export function calculateSettlement(input: SettlementInput): SettlementResult {
  const echargingFeePerKwh = input.feePerKwh ?? DEFAULT_ECHARGING_FEE_PER_KWH;
  const echargingRevenue = echargingFeePerKwh * input.totalKwh;
  const clientPayout = input.grossRevenue - echargingRevenue;
  return { echargingFeePerKwh, echargingRevenue, clientPayout };
}

// ============================================================================
// BTW op de zelf-billing vergoeding. Alleen voor BTW-plichtige klanten (vat_rate
// 0.21); anders 0. inclVat = wat E-Charging daadwerkelijk overboekt aan de klant.
// Centronding zodat netto + BTW == incl exact klopt (boekhouding).
// ============================================================================
export const DEFAULT_VAT_RATE = 0.21;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface SettlementVatInput {
  clientPayout: number;   // netto vergoeding (excl BTW)
  vatRate?: number;       // 0.21 (BTW-plichtig) of 0; default 0.21
}

export interface SettlementVatResult {
  vatRate: number;
  net: number;            // netto, op centen afgerond
  vatAmount: number;      // = round(net * vatRate)
  inclVat: number;        // = net + vatAmount = het over te boeken bedrag
}

export function settlementVat(input: SettlementVatInput): SettlementVatResult {
  const vatRate = input.vatRate ?? DEFAULT_VAT_RATE;
  const net = round2(input.clientPayout || 0);
  const vatAmount = round2(net * vatRate);
  const inclVat = round2(net + vatAmount);
  return { vatRate, net, vatAmount, inclVat };
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number, decimals = 0): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
