export interface CalculationParams {
  numChargePoints: number;
  kwhPerPointPerMonth: number;
  chargeRatePerKwh: number;
  energyCostPerKwh: number;
  revenueSharePct: number; // klant percentage
  efluxCostPerSocket: number;
  ereRatePerKwh: number;
  hasSolar: boolean;
  solarPercentage: number;
}

export interface CalculationResult {
  totalKwh: number;
  grossRevenue: number;
  energyCost: number;
  efluxCost: number;
  netMargin: number;
  clientShare: number;
  echargingShare: number;
  ereEstimate: number;
  totalClientIncome: number;
  totalEchargingIncome: number;
}

export function calculateMonthly(params: CalculationParams): CalculationResult {
  const totalKwh = params.numChargePoints * params.kwhPerPointPerMonth;
  const grossRevenue = totalKwh * params.chargeRatePerKwh;
  const energyCost = totalKwh * params.energyCostPerKwh;
  const efluxCost = params.numChargePoints * params.efluxCostPerSocket;
  const netMargin = grossRevenue - energyCost - efluxCost;
  const clientShare = netMargin * (params.revenueSharePct / 100);
  const echargingShare = netMargin - clientShare;

  // ERE: standaard hernieuwbaar aandeel 50.5%
  let ereMultiplier = 0.505;
  if (params.hasSolar && params.solarPercentage > 0) {
    ereMultiplier = Math.min(1, 0.505 + (params.solarPercentage / 100) * 0.495);
  }
  const ereEstimate = totalKwh * params.ereRatePerKwh;

  return {
    totalKwh,
    grossRevenue,
    energyCost,
    efluxCost,
    netMargin,
    clientShare,
    echargingShare,
    ereEstimate,
    totalClientIncome: clientShare + ereEstimate,
    totalEchargingIncome: echargingShare + efluxCost,
  };
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
