export type ConfiguratorSettings = {
  baseTargetNetEchargingPerChargePointMonth: number;
  maxServiceFeePct: number;
  useTieredTarget: boolean;
  tiers: Array<{
    minNetReturnPerChargePointMonth: number;
    maxNetReturnPerChargePointMonth: number | null;
    targetNetEchargingPerChargePointMonth: number;
  }>;
  efluxSubscriptionPerSocketMonth: number;
  efluxSetupPerSocket: number;
  efluxSetupAmortizationMonths: number;
  defaultContractDurationMonths: number;
  defaultNoticePeriodMonths: number;
  defaultChargeTariffPerKwh: number;
  defaultEnergyCostPerKwh: number;
  defaultStartFeeEnabled: boolean;
  defaultStartFeePerSession: number;
  defaultIdleFeeEnabled: boolean;
  defaultIdleFeePerMinute: number;
  defaultIdleGraceMinutes: number;
  ereSubsidyPerKwh: number;
  ereEnabledByDefault: boolean;
  investmentPerSocketLow: number;
  investmentPerSocketHigh: number;
  investmentPerSocketMax: number;
  defaultSocketCount: number;
  inputRanges: {
    chargeTariffMin: number;
    chargeTariffMax: number;
    chargeTariffStep: number;
    kwhMin: number;
    kwhMax: number;
    kwhStep: number;
    sessionsMin: number;
    sessionsMax: number;
    sessionsStep: number;
    socketsMin: number;
    socketsMax: number;
    investmentSliderFloor: number;
    investmentSliderStep: number;
    intensityDivisor: number;
  };
  locationTypes: Array<{ key: string; label: string }>;
  locationTypeDefaults: Record<string, {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
  }>;
};

export type PricingInput = {
  customer: {
    companyName: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    locationAddress?: string;
    postalCode?: string;
    city?: string;
    locationType: string;
  };
  hardware: {
    chargePoints: number;
    socketsPerChargePoint: number;
    hardwareInvestment?: number;
  };
  usage: {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
  };
  contract: {
    durationMonths: number;
    noticePeriodMonths: number;
  };
  tariffs: {
    chargeTariffPerKwh: number;
    energyCostPerKwh: number;
    startFeeEnabled: boolean;
    startFeePerSession: number;
    idleFeeEnabled: boolean;
    idleFeePerMinute: number;
    idleGraceMinutes: number;
  };
  targetMode?: { type: "tieredTarget" } | { type: "fixedTarget"; targetNetEchargingPerChargePointMonth: number };
};

export const defaultConfiguratorSettings: ConfiguratorSettings = {
  baseTargetNetEchargingPerChargePointMonth: 20,
  maxServiceFeePct: 0.4,
  useTieredTarget: true,
  tiers: [
    { minNetReturnPerChargePointMonth: 0, maxNetReturnPerChargePointMonth: 75, targetNetEchargingPerChargePointMonth: 20 },
    { minNetReturnPerChargePointMonth: 75, maxNetReturnPerChargePointMonth: 150, targetNetEchargingPerChargePointMonth: 30 },
    { minNetReturnPerChargePointMonth: 150, maxNetReturnPerChargePointMonth: 250, targetNetEchargingPerChargePointMonth: 40 },
    { minNetReturnPerChargePointMonth: 250, maxNetReturnPerChargePointMonth: 400, targetNetEchargingPerChargePointMonth: 55 },
    { minNetReturnPerChargePointMonth: 400, maxNetReturnPerChargePointMonth: 600, targetNetEchargingPerChargePointMonth: 70 },
    { minNetReturnPerChargePointMonth: 600, maxNetReturnPerChargePointMonth: null, targetNetEchargingPerChargePointMonth: 85 },
  ],
  efluxSubscriptionPerSocketMonth: 5.5,
  efluxSetupPerSocket: 16.5,
  efluxSetupAmortizationMonths: 12,
  defaultContractDurationMonths: 12,
  defaultNoticePeriodMonths: 3,
  defaultChargeTariffPerKwh: 0.58,
  defaultEnergyCostPerKwh: 0.25,
  defaultStartFeeEnabled: true,
  defaultStartFeePerSession: 0.5,
  defaultIdleFeeEnabled: true,
  defaultIdleFeePerMinute: 0.05,
  defaultIdleGraceMinutes: 60,
  ereSubsidyPerKwh: 0.10,
  ereEnabledByDefault: false,
  investmentPerSocketLow: 1500,
  investmentPerSocketHigh: 3000,
  investmentPerSocketMax: 4500,
  defaultSocketCount: 8,
  inputRanges: {
    chargeTariffMin: 0.39, chargeTariffMax: 0.79, chargeTariffStep: 0.01,
    kwhMin: 0, kwhMax: 900, kwhStep: 10,
    sessionsMin: 0, sessionsMax: 90, sessionsStep: 1,
    socketsMin: 1, socketsMax: 200,
    investmentSliderFloor: 6000, investmentSliderStep: 500,
    intensityDivisor: 650,
  },
  locationTypes: [
    { key: "workplace", label: "Werkplek" },
    { key: "destination", label: "Bestemming" },
    { key: "fleet", label: "Vloot" },
    { key: "public", label: "Publiek" },
    { key: "other", label: "Anders" },
  ],
  locationTypeDefaults: {
    workplace: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8 },
    destination: { sessionsPerChargePointMonth: 35, kwhPerChargePointMonth: 420, averageSessionDurationHours: 2.5, effectiveChargingPowerKw: 10 },
    fleet: { sessionsPerChargePointMonth: 24, kwhPerChargePointMonth: 650, averageSessionDurationHours: 8, effectiveChargingPowerKw: 11 },
    public: { sessionsPerChargePointMonth: 50, kwhPerChargePointMonth: 520, averageSessionDurationHours: 1.8, effectiveChargingPowerKw: 11 },
    other: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8 },
  },
};

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSettings(value: unknown): ConfiguratorSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ConfiguratorSettings>;
  return {
    ...defaultConfiguratorSettings,
    ...raw,
    tiers: Array.isArray(raw.tiers) && raw.tiers.length > 0 ? raw.tiers : defaultConfiguratorSettings.tiers,
    locationTypes: Array.isArray(raw.locationTypes) && raw.locationTypes.length > 0
      ? raw.locationTypes
      : defaultConfiguratorSettings.locationTypes,
    inputRanges: { ...defaultConfiguratorSettings.inputRanges, ...(raw.inputRanges ?? {}) },
    locationTypeDefaults: {
      ...defaultConfiguratorSettings.locationTypeDefaults,
      ...(raw.locationTypeDefaults ?? {}),
    },
  };
}

export function normalizePricingInput(value: unknown, settings: ConfiguratorSettings): PricingInput {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<PricingInput>;
  const customer = (raw.customer ?? {}) as Partial<PricingInput["customer"]>;
  const hardware = (raw.hardware ?? {}) as Partial<PricingInput["hardware"]>;
  const usage = (raw.usage ?? {}) as Partial<PricingInput["usage"]>;
  const contract = (raw.contract ?? {}) as Partial<PricingInput["contract"]>;
  const tariffs = (raw.tariffs ?? {}) as Partial<PricingInput["tariffs"]>;
  const defaults = settings.locationTypeDefaults[customer.locationType ?? "workplace"] ?? settings.locationTypeDefaults.workplace;

  return {
    customer: {
      companyName: String(customer.companyName ?? "").trim(),
      contactName: String(customer.contactName ?? "").trim(),
      contactEmail: String(customer.contactEmail ?? "").trim(),
      contactPhone: String(customer.contactPhone ?? "").trim(),
      locationAddress: String(customer.locationAddress ?? "").trim(),
      postalCode: String(customer.postalCode ?? "").trim(),
      city: String(customer.city ?? "").trim(),
      locationType: String(customer.locationType ?? "workplace"),
    },
    hardware: {
      chargePoints: Math.max(1, Math.round(numberOr(hardware.chargePoints, 1))),
      socketsPerChargePoint: Math.max(1, numberOr(hardware.socketsPerChargePoint, 1)),
      hardwareInvestment: Math.max(0, numberOr(hardware.hardwareInvestment, 0)),
    },
    usage: {
      sessionsPerChargePointMonth: Math.max(0, numberOr(usage.sessionsPerChargePointMonth, defaults.sessionsPerChargePointMonth)),
      kwhPerChargePointMonth: Math.max(0, numberOr(usage.kwhPerChargePointMonth, defaults.kwhPerChargePointMonth)),
      averageSessionDurationHours: Math.max(0, numberOr(usage.averageSessionDurationHours, defaults.averageSessionDurationHours)),
      effectiveChargingPowerKw: Math.max(0.1, numberOr(usage.effectiveChargingPowerKw, defaults.effectiveChargingPowerKw)),
    },
    contract: {
      durationMonths: Math.max(1, Math.round(numberOr(contract.durationMonths, settings.defaultContractDurationMonths))),
      noticePeriodMonths: Math.max(0, Math.round(numberOr(contract.noticePeriodMonths, settings.defaultNoticePeriodMonths))),
    },
    tariffs: {
      chargeTariffPerKwh: Math.max(0, numberOr(tariffs.chargeTariffPerKwh, settings.defaultChargeTariffPerKwh)),
      energyCostPerKwh: Math.max(0, numberOr(tariffs.energyCostPerKwh, settings.defaultEnergyCostPerKwh)),
      startFeeEnabled: typeof tariffs.startFeeEnabled === "boolean" ? tariffs.startFeeEnabled : settings.defaultStartFeeEnabled,
      startFeePerSession: Math.max(0, numberOr(tariffs.startFeePerSession, settings.defaultStartFeePerSession)),
      idleFeeEnabled: typeof tariffs.idleFeeEnabled === "boolean" ? tariffs.idleFeeEnabled : settings.defaultIdleFeeEnabled,
      idleFeePerMinute: Math.max(0, numberOr(tariffs.idleFeePerMinute, settings.defaultIdleFeePerMinute)),
      idleGraceMinutes: Math.max(0, numberOr(tariffs.idleGraceMinutes, settings.defaultIdleGraceMinutes)),
    },
    targetMode: raw.targetMode ?? { type: "tieredTarget" },
  };
}

export function calculatePricing(input: PricingInput, settings: ConfiguratorSettings) {
  const sessions = input.usage.sessionsPerChargePointMonth;
  const kwh = input.usage.kwhPerChargePointMonth;
  const kwhPerSession = sessions > 0 ? kwh / sessions : 0;
  const chargingMinutesPerSession = input.usage.effectiveChargingPowerKw > 0
    ? (kwhPerSession / input.usage.effectiveChargingPowerKw) * 60
    : 0;
  const sessionDurationMinutes = input.usage.averageSessionDurationHours * 60;
  const idleMinutesPerSession = Math.max(0, sessionDurationMinutes - chargingMinutesPerSession);
  const billableIdleMinutesPerSession = input.tariffs.idleFeeEnabled
    ? Math.max(0, idleMinutesPerSession - input.tariffs.idleGraceMinutes)
    : 0;
  const billableIdleMinutesPerChargePointMonth = billableIdleMinutesPerSession * sessions;
  const grossChargingRevenuePerChargePointMonth = kwh * input.tariffs.chargeTariffPerKwh;
  const energyCostPerChargePointMonth = -(kwh * input.tariffs.energyCostPerKwh);
  const startFeeRevenuePerChargePointMonth = input.tariffs.startFeeEnabled ? sessions * input.tariffs.startFeePerSession : 0;
  const idleFeeRevenuePerChargePointMonth = input.tariffs.idleFeeEnabled
    ? billableIdleMinutesPerChargePointMonth * input.tariffs.idleFeePerMinute
    : 0;
  const netReturnPerChargePointMonth =
    grossChargingRevenuePerChargePointMonth +
    energyCostPerChargePointMonth +
    startFeeRevenuePerChargePointMonth +
    idleFeeRevenuePerChargePointMonth;

  const sortedTiers = [...settings.tiers].sort((a, b) => a.minNetReturnPerChargePointMonth - b.minNetReturnPerChargePointMonth);
  const currentTier = sortedTiers.find((tier) => {
    const aboveMin = netReturnPerChargePointMonth >= tier.minNetReturnPerChargePointMonth;
    const belowMax = tier.maxNetReturnPerChargePointMonth === null || netReturnPerChargePointMonth < tier.maxNetReturnPerChargePointMonth;
    return aboveMin && belowMax;
  }) ?? sortedTiers[0] ?? null;
  const targetNetEchargingPerChargePointMonth = input.targetMode?.type === "fixedTarget"
    ? input.targetMode.targetNetEchargingPerChargePointMonth
    : currentTier?.targetNetEchargingPerChargePointMonth ?? settings.baseTargetNetEchargingPerChargePointMonth;
  const efluxCostPerSocketMonth =
    settings.efluxSubscriptionPerSocketMonth +
    settings.efluxSetupPerSocket / settings.efluxSetupAmortizationMonths;
  const efluxCostPerChargePointMonth = input.hardware.socketsPerChargePoint * efluxCostPerSocketMonth;
  const requiredGrossEchargingPerChargePointMonth = targetNetEchargingPerChargePointMonth + efluxCostPerChargePointMonth;
  const serviceFeePct = netReturnPerChargePointMonth > 0
    ? requiredGrossEchargingPerChargePointMonth / netReturnPerChargePointMonth
    : 0;
  const customerNetPerChargePointMonth = netReturnPerChargePointMonth * (1 - serviceFeePct);
  const echargingGrossPerChargePointMonth = netReturnPerChargePointMonth * serviceFeePct;
  const echargingNetPerChargePointMonth = echargingGrossPerChargePointMonth - efluxCostPerChargePointMonth;
  const chargePoints = input.hardware.chargePoints;
  const blockingReasons: string[] = [];

  if (netReturnPerChargePointMonth <= 0) {
    blockingReasons.push("Netto rendement is nul of negatief.");
  }
  if (serviceFeePct > settings.maxServiceFeePct) {
    blockingReasons.push("Service-fee ligt boven de ingestelde maximumgrens.");
  }

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ok",
    blockingReasons,
    currentTier,
    kwhPerSession,
    chargingMinutesPerSession,
    sessionDurationMinutes,
    idleMinutesPerSession,
    billableIdleMinutesPerSession,
    billableIdleMinutesPerChargePointMonth,
    grossChargingRevenuePerChargePointMonth,
    energyCostPerChargePointMonth,
    startFeeRevenuePerChargePointMonth,
    idleFeeRevenuePerChargePointMonth,
    netReturnPerChargePointMonth,
    targetNetEchargingPerChargePointMonth,
    efluxCostPerSocketMonth,
    efluxCostPerChargePointMonth,
    requiredGrossEchargingPerChargePointMonth,
    serviceFeePct,
    customerNetPerChargePointMonth,
    echargingGrossPerChargePointMonth,
    echargingNetPerChargePointMonth,
    totals: {
      customerPerMonth: customerNetPerChargePointMonth * chargePoints,
      customerPerYear: customerNetPerChargePointMonth * chargePoints * 12,
      customerOverContract: customerNetPerChargePointMonth * chargePoints * input.contract.durationMonths,
      echargingGrossPerMonth: echargingGrossPerChargePointMonth * chargePoints,
      echargingNetPerMonth: echargingNetPerChargePointMonth * chargePoints,
      echargingNetPerYear: echargingNetPerChargePointMonth * chargePoints * 12,
      efluxCostPerMonth: efluxCostPerChargePointMonth * chargePoints,
      netReturnPerMonth: netReturnPerChargePointMonth * chargePoints,
    },
  };
}
