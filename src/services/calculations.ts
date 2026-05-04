export interface CalculationParams {
  numChargePoints: number;
  kwhPerPointPerMonth: number;
  chargeRatePerKwh: number;
  energyCostPerKwh: number;
  revenueSharePct: number;
  efluxCostPerSocket: number;
  ereRatePerKwh: number;
  ereCommissionRate?: number;
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
  netLaadmarge: number;
  grossEre: number;
  ereCommission: number;
  netEre: number;
  netMargin: number;
  clientPayout: number;
  echargingRevenue: number;
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

  const netLaadmarge = grossRevenue - energyCost - efluxPlatformFee - transactionFees;

  const grossEre = totalKwh * params.ereRatePerKwh;
  const ereCommissionRate = params.ereCommissionRate ?? 0.10;
  const ereCommission = grossEre * ereCommissionRate;
  const netEre = grossEre - ereCommission;

  const netMargin = netLaadmarge + netEre;

  const clientShareRatio = params.revenueSharePct / 100;
  const clientPayout = netMargin * clientShareRatio;
  const echargingRevenue = netMargin - clientPayout;

  return {
    totalKwh,
    grossRevenue,
    energyCost,
    efluxPlatformFee,
    transactionFees,
    netLaadmarge,
    grossEre,
    ereCommission,
    netEre,
    netMargin,
    clientPayout,
    echargingRevenue,
  };
}

function scaleResult(result: CalculationResult, factor: number): CalculationResult {
  return {
    totalKwh: result.totalKwh * factor,
    grossRevenue: result.grossRevenue * factor,
    energyCost: result.energyCost * factor,
    efluxPlatformFee: result.efluxPlatformFee * factor,
    transactionFees: result.transactionFees * factor,
    netLaadmarge: result.netLaadmarge * factor,
    grossEre: result.grossEre * factor,
    ereCommission: result.ereCommission * factor,
    netEre: result.netEre * factor,
    netMargin: result.netMargin * factor,
    clientPayout: result.clientPayout * factor,
    echargingRevenue: result.echargingRevenue * factor,
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
