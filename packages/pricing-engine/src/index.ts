import { z } from "zod";

export const locationTypeSchema = z.enum([
  "workplace",
  "destination",
  "fleet",
  "public",
  "other",
]);

export const targetTierSchema = z.object({
  minNetReturnPerChargePointMonth: z.number().min(0),
  maxNetReturnPerChargePointMonth: z.number().min(0).nullable(),
  targetNetEchargingPerChargePointMonth: z.number().min(0),
});

export const locationTypeDefaultsSchema = z.object({
  sessionsPerChargePointMonth: z.number().min(0),
  kwhPerChargePointMonth: z.number().min(0),
  averageSessionDurationHours: z.number().min(0),
  effectiveChargingPowerKw: z.number().positive(),
});

export const configuratorSettingsSchema = z.object({
  baseTargetNetEchargingPerChargePointMonth: z.number().min(0).default(20),
  maxServiceFeePct: z.number().min(0).max(1).default(0.4),
  useTieredTarget: z.boolean().default(true),
  tiers: z.array(targetTierSchema).min(1),
  efluxSubscriptionPerSocketMonth: z.number().min(0).default(5.5),
  efluxSetupPerSocket: z.number().min(0).default(16.5),
  efluxSetupAmortizationMonths: z.number().positive().default(12),
  defaultContractDurationMonths: z.number().int().positive().default(12),
  defaultNoticePeriodMonths: z.number().int().min(0).default(3),
  defaultChargeTariffPerKwh: z.number().min(0).default(0.58),
  defaultEnergyCostPerKwh: z.number().min(0).default(0.25),
  defaultStartFeeEnabled: z.boolean().default(true),
  defaultStartFeePerSession: z.number().min(0).default(0.5),
  defaultIdleFeeEnabled: z.boolean().default(true),
  defaultIdleFeePerMinute: z.number().min(0).default(0.05),
  defaultIdleGraceMinutes: z.number().min(0).default(60),
  locationTypeDefaults: z.record(locationTypeSchema, locationTypeDefaultsSchema),
});

export const pricingInputSchema = z.object({
  customer: z.object({
    companyName: z.string().trim().default(""),
    contactName: z.string().trim().optional().default(""),
    contactEmail: z.string().trim().email().optional().or(z.literal("")).default(""),
    contactPhone: z.string().trim().optional().default(""),
    locationAddress: z.string().trim().optional().default(""),
    postalCode: z.string().trim().optional().default(""),
    city: z.string().trim().optional().default(""),
    locationType: locationTypeSchema,
  }),
  hardware: z.object({
    chargePoints: z.number().int().positive(),
    socketsPerChargePoint: z.number().positive(),
    hardwareInvestment: z.number().min(0).optional().default(0),
  }),
  usage: locationTypeDefaultsSchema,
  contract: z.object({
    durationMonths: z.number().int().positive(),
    noticePeriodMonths: z.number().int().min(0),
  }),
  tariffs: z.object({
    chargeTariffPerKwh: z.number().min(0),
    energyCostPerKwh: z.number().min(0),
    startFeeEnabled: z.boolean(),
    startFeePerSession: z.number().min(0),
    idleFeeEnabled: z.boolean(),
    idleFeePerMinute: z.number().min(0),
    idleGraceMinutes: z.number().min(0),
  }),
  targetMode: z.discriminatedUnion("type", [
    z.object({ type: z.literal("tieredTarget") }),
    z.object({ type: z.literal("fixedTarget"), targetNetEchargingPerChargePointMonth: z.number().min(0) }),
  ]).default({ type: "tieredTarget" }),
});

export type LocationType = z.infer<typeof locationTypeSchema>;
export type TargetTier = z.infer<typeof targetTierSchema>;
export type ConfiguratorSettings = z.infer<typeof configuratorSettingsSchema>;
export type PricingInput = z.infer<typeof pricingInputSchema>;

export type PricingStatus = "ok" | "blocked";

export type PricingResult = {
  status: PricingStatus;
  blockingReasons: string[];
  targetNetEchargingPerChargePointMonth: number;
  currentTier: TargetTier | null;
  nextTier: TargetTier | null;
  kwhPerSession: number;
  chargingMinutesPerSession: number;
  sessionDurationMinutes: number;
  idleMinutesPerSession: number;
  billableIdleMinutesPerSession: number;
  billableIdleMinutesPerChargePointMonth: number;
  grossChargingRevenuePerChargePointMonth: number;
  energyCostPerChargePointMonth: number;
  startFeeRevenuePerChargePointMonth: number;
  idleFeeRevenuePerChargePointMonth: number;
  netReturnPerChargePointMonth: number;
  efluxCostPerSocketMonth: number;
  efluxCostPerChargePointMonth: number;
  requiredGrossEchargingPerChargePointMonth: number;
  serviceFeePct: number;
  customerNetPerChargePointMonth: number;
  echargingGrossPerChargePointMonth: number;
  echargingNetPerChargePointMonth: number;
  totals: {
    customerPerMonth: number;
    customerPerYear: number;
    customerOverContract: number;
    echargingGrossPerMonth: number;
    echargingNetPerMonth: number;
    echargingNetPerYear: number;
    efluxCostPerMonth: number;
    netReturnPerMonth: number;
  };
  deltas: {
    startFeeCustomerPerMonth: number;
    idleFeeCustomerPerMonth: number;
    lowerTariffLossPerYear: number;
  };
};

export const defaultConfiguratorSettings: ConfiguratorSettings = configuratorSettingsSchema.parse({
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
  locationTypeDefaults: {
    workplace: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8 },
    destination: { sessionsPerChargePointMonth: 35, kwhPerChargePointMonth: 420, averageSessionDurationHours: 2.5, effectiveChargingPowerKw: 10 },
    fleet: { sessionsPerChargePointMonth: 24, kwhPerChargePointMonth: 650, averageSessionDurationHours: 8, effectiveChargingPowerKw: 11 },
    public: { sessionsPerChargePointMonth: 50, kwhPerChargePointMonth: 520, averageSessionDurationHours: 1.8, effectiveChargingPowerKw: 11 },
    other: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8 },
  },
});

export const excelDefaultPricingInput: PricingInput = pricingInputSchema.parse({
  customer: {
    companyName: "[Naam organisatie]",
    locationType: "workplace",
  },
  hardware: {
    chargePoints: 10,
    socketsPerChargePoint: 1,
  },
  usage: {
    kwhPerChargePointMonth: 200,
    sessionsPerChargePointMonth: 12,
    averageSessionDurationHours: 6,
    effectiveChargingPowerKw: 8,
  },
  contract: {
    durationMonths: 12,
    noticePeriodMonths: 3,
  },
  tariffs: {
    chargeTariffPerKwh: 0.58,
    energyCostPerKwh: 0.25,
    startFeeEnabled: true,
    startFeePerSession: 0.5,
    idleFeeEnabled: true,
    idleFeePerMinute: 0.05,
    idleGraceMinutes: 60,
  },
  targetMode: {
    type: "fixedTarget",
    targetNetEchargingPerChargePointMonth: 20,
  },
});

function findTier(tiers: TargetTier[], netReturn: number) {
  const sorted = [...tiers].sort((a, b) => a.minNetReturnPerChargePointMonth - b.minNetReturnPerChargePointMonth);
  const current = sorted.find((tier) => {
    const aboveMin = netReturn >= tier.minNetReturnPerChargePointMonth;
    const belowMax = tier.maxNetReturnPerChargePointMonth === null || netReturn < tier.maxNetReturnPerChargePointMonth;
    return aboveMin && belowMax;
  }) ?? sorted[0] ?? null;
  const next = current
    ? sorted.find((tier) => tier.minNetReturnPerChargePointMonth > current.minNetReturnPerChargePointMonth) ?? null
    : null;
  return { current, next };
}

function calculateWith(input: PricingInput, settings: ConfiguratorSettings, override?: Partial<PricingInput["tariffs"]>) {
  const tariffs = { ...input.tariffs, ...override };
  const kwh = input.usage.kwhPerChargePointMonth;
  const sessions = input.usage.sessionsPerChargePointMonth;
  const kwhPerSession = sessions > 0 ? kwh / sessions : 0;
  const chargingMinutesPerSession = input.usage.effectiveChargingPowerKw > 0
    ? (kwhPerSession / input.usage.effectiveChargingPowerKw) * 60
    : 0;
  const sessionDurationMinutes = input.usage.averageSessionDurationHours * 60;
  const idleMinutesPerSession = Math.max(0, sessionDurationMinutes - chargingMinutesPerSession);
  const billableIdleMinutesPerSession = tariffs.idleFeeEnabled
    ? Math.max(0, idleMinutesPerSession - tariffs.idleGraceMinutes)
    : 0;
  const billableIdleMinutesPerChargePointMonth = billableIdleMinutesPerSession * sessions;
  const grossChargingRevenuePerChargePointMonth = kwh * tariffs.chargeTariffPerKwh;
  const energyCostPerChargePointMonth = -(kwh * tariffs.energyCostPerKwh);
  const startFeeRevenuePerChargePointMonth = tariffs.startFeeEnabled ? sessions * tariffs.startFeePerSession : 0;
  const idleFeeRevenuePerChargePointMonth = tariffs.idleFeeEnabled
    ? billableIdleMinutesPerChargePointMonth * tariffs.idleFeePerMinute
    : 0;
  const netReturnPerChargePointMonth =
    grossChargingRevenuePerChargePointMonth +
    energyCostPerChargePointMonth +
    startFeeRevenuePerChargePointMonth +
    idleFeeRevenuePerChargePointMonth;

  const { current, next } = findTier(settings.tiers, netReturnPerChargePointMonth);
  const targetNetEchargingPerChargePointMonth = input.targetMode.type === "fixedTarget"
    ? input.targetMode.targetNetEchargingPerChargePointMonth
    : current?.targetNetEchargingPerChargePointMonth ?? settings.baseTargetNetEchargingPerChargePointMonth;

  const efluxCostPerSocketMonth =
    settings.efluxSubscriptionPerSocketMonth +
    settings.efluxSetupPerSocket / settings.efluxSetupAmortizationMonths;
  const efluxCostPerChargePointMonth = input.hardware.socketsPerChargePoint * efluxCostPerSocketMonth;
  const requiredGrossEchargingPerChargePointMonth =
    targetNetEchargingPerChargePointMonth + efluxCostPerChargePointMonth;
  const serviceFeePct = netReturnPerChargePointMonth > 0
    ? requiredGrossEchargingPerChargePointMonth / netReturnPerChargePointMonth
    : 0;
  const customerNetPerChargePointMonth = netReturnPerChargePointMonth * (1 - serviceFeePct);
  const echargingGrossPerChargePointMonth = netReturnPerChargePointMonth * serviceFeePct;
  const echargingNetPerChargePointMonth = echargingGrossPerChargePointMonth - efluxCostPerChargePointMonth;
  const chargePoints = input.hardware.chargePoints;

  return {
    currentTier: current,
    nextTier: next,
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

export function calculatePricing(rawInput: PricingInput, rawSettings: ConfiguratorSettings = defaultConfiguratorSettings): PricingResult {
  const input = pricingInputSchema.parse(rawInput);
  const settings = configuratorSettingsSchema.parse(rawSettings);
  const base = calculateWith(input, settings);
  const withoutStart = calculateWith(input, settings, { startFeeEnabled: false });
  const withoutIdle = calculateWith(input, settings, { idleFeeEnabled: false });
  const friendlyTariff = calculateWith(input, settings, { chargeTariffPerKwh: Math.min(0.49, input.tariffs.chargeTariffPerKwh) });

  const blockingReasons: string[] = [];
  if (base.netReturnPerChargePointMonth <= 0) {
    blockingReasons.push("Netto rendement is nul of negatief. Verhoog tarief of verwacht gebruik voordat u kunt finaliseren.");
  }
  if (base.serviceFeePct > settings.maxServiceFeePct) {
    blockingReasons.push("Service-fee ligt boven de ingestelde maximumgrens. Pas tariefstructuur of gebruiksverwachting aan.");
  }

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ok",
    blockingReasons,
    ...base,
    deltas: {
      startFeeCustomerPerMonth: base.totals.customerPerMonth - withoutStart.totals.customerPerMonth,
      idleFeeCustomerPerMonth: base.totals.customerPerMonth - withoutIdle.totals.customerPerMonth,
      lowerTariffLossPerYear: Math.max(0, base.totals.customerPerYear - friendlyTariff.totals.customerPerYear),
    },
  };
}
