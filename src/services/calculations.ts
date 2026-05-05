// ERE-stroom: Laadbeloning boekt ERE's in en betaalt direct aan klant.
// Loopt NIET via E-Charging cashflow. Wij rekenen alleen een schatting voor
// transparantie naar de klant — geen onderdeel van clientPayout/echargingRevenue.
export interface CalculationParams {
  numChargePoints: number;
  kwhPerPointPerMonth: number;
  chargeRatePerKwh: number;
  energyCostPerKwh: number;
  revenueSharePct: number;
  efluxCostPerSocket: number;
  ereRatePerKwh: number;
  transactionFeePct?: number;
  transactionFeeFixed?: number;
  averageSessionsPerMonth?: number;
  hasSolar?: boolean;
  solarPercentage?: number;
}

export interface CalculationResult {
  totalKwh: number;
  grossRevenue: number;
  energyCost: number;
  efluxPlatformFee: number;
  transactionFees: number;
  netMargin: number;          // alleen laad-margin, ERE telt NIET mee
  clientPayout: number;       // 75% × netMargin (E-Charging stroom naar klant)
  echargingRevenue: number;   // 25% × netMargin (onze 25% fee)
  ereEstimate: number;        // schatting wat klant via Laadbeloning krijgt — informatief
}

export function calculateMonthly(params: CalculationParams): CalculationResult {
  const totalKwh = params.numChargePoints * params.kwhPerPointPerMonth;

  const grossRevenue = totalKwh * params.chargeRatePerKwh;
  const energyCost = totalKwh * params.energyCostPerKwh;
  const efluxPlatformFee = params.numChargePoints * params.efluxCostPerSocket;

  const transactionFeePct = params.transactionFeePct ?? 0;
  const transactionFeeFixed = params.transactionFeeFixed ?? 0;
  const sessions = params.averageSessionsPerMonth ?? 0;
  const transactionFees = (grossRevenue * transactionFeePct) + (sessions * transactionFeeFixed);

  // Netto laadmarge — ERE telt NIET mee in onze cashflow.
  const netMargin = grossRevenue - energyCost - efluxPlatformFee - transactionFees;

  const clientShareRatio = params.revenueSharePct / 100;
  const clientPayout = netMargin * clientShareRatio;
  const echargingRevenue = netMargin - clientPayout;

  // Indicatieve ERE-opbrengst voor klant — Laadbeloning regelt uitbetaling separaat.
  const ereEstimate = totalKwh * params.ereRatePerKwh;

  return {
    totalKwh,
    grossRevenue,
    energyCost,
    efluxPlatformFee,
    transactionFees,
    netMargin,
    clientPayout,
    echargingRevenue,
    ereEstimate,
  };
}

function scaleResult(result: CalculationResult, factor: number): CalculationResult {
  return {
    totalKwh: result.totalKwh * factor,
    grossRevenue: result.grossRevenue * factor,
    energyCost: result.energyCost * factor,
    efluxPlatformFee: result.efluxPlatformFee * factor,
    transactionFees: result.transactionFees * factor,
    netMargin: result.netMargin * factor,
    clientPayout: result.clientPayout * factor,
    echargingRevenue: result.echargingRevenue * factor,
    ereEstimate: result.ereEstimate * factor,
  };
}

export function calculateQuarterly(params: CalculationParams): CalculationResult {
  return scaleResult(calculateMonthly(params), 3);
}

export function calculateYearly(params: CalculationParams): CalculationResult {
  return scaleResult(calculateMonthly(params), 12);
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
