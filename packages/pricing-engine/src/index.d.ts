import { z } from "zod";
export declare const locationTypeSchema: z.ZodEnum<["workplace", "destination", "fleet", "public", "other"]>;
export declare const targetTierSchema: z.ZodObject<{
    minNetReturnPerChargePointMonth: z.ZodNumber;
    maxNetReturnPerChargePointMonth: z.ZodNullable<z.ZodNumber>;
    targetNetEchargingPerChargePointMonth: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    minNetReturnPerChargePointMonth: number;
    maxNetReturnPerChargePointMonth: number | null;
    targetNetEchargingPerChargePointMonth: number;
}, {
    minNetReturnPerChargePointMonth: number;
    maxNetReturnPerChargePointMonth: number | null;
    targetNetEchargingPerChargePointMonth: number;
}>;
export declare const locationTypeDefaultsSchema: z.ZodObject<{
    sessionsPerChargePointMonth: z.ZodNumber;
    kwhPerChargePointMonth: z.ZodNumber;
    averageSessionDurationHours: z.ZodNumber;
    effectiveChargingPowerKw: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
}, {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
}>;
export declare const configuratorSettingsSchema: z.ZodObject<{
    baseTargetNetEchargingPerChargePointMonth: z.ZodDefault<z.ZodNumber>;
    maxServiceFeePct: z.ZodDefault<z.ZodNumber>;
    useTieredTarget: z.ZodDefault<z.ZodBoolean>;
    tiers: z.ZodArray<z.ZodObject<{
        minNetReturnPerChargePointMonth: z.ZodNumber;
        maxNetReturnPerChargePointMonth: z.ZodNullable<z.ZodNumber>;
        targetNetEchargingPerChargePointMonth: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minNetReturnPerChargePointMonth: number;
        maxNetReturnPerChargePointMonth: number | null;
        targetNetEchargingPerChargePointMonth: number;
    }, {
        minNetReturnPerChargePointMonth: number;
        maxNetReturnPerChargePointMonth: number | null;
        targetNetEchargingPerChargePointMonth: number;
    }>, "many">;
    efluxSubscriptionPerSocketMonth: z.ZodDefault<z.ZodNumber>;
    efluxSetupPerSocket: z.ZodDefault<z.ZodNumber>;
    efluxSetupAmortizationMonths: z.ZodDefault<z.ZodNumber>;
    defaultContractDurationMonths: z.ZodDefault<z.ZodNumber>;
    defaultNoticePeriodMonths: z.ZodDefault<z.ZodNumber>;
    defaultChargeTariffPerKwh: z.ZodDefault<z.ZodNumber>;
    defaultEnergyCostPerKwh: z.ZodDefault<z.ZodNumber>;
    defaultStartFeeEnabled: z.ZodDefault<z.ZodBoolean>;
    defaultStartFeePerSession: z.ZodDefault<z.ZodNumber>;
    defaultIdleFeeEnabled: z.ZodDefault<z.ZodBoolean>;
    defaultIdleFeePerMinute: z.ZodDefault<z.ZodNumber>;
    defaultIdleGraceMinutes: z.ZodDefault<z.ZodNumber>;
    locationTypeDefaults: z.ZodRecord<z.ZodEnum<["workplace", "destination", "fleet", "public", "other"]>, z.ZodObject<{
        sessionsPerChargePointMonth: z.ZodNumber;
        kwhPerChargePointMonth: z.ZodNumber;
        averageSessionDurationHours: z.ZodNumber;
        effectiveChargingPowerKw: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }, {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    baseTargetNetEchargingPerChargePointMonth: number;
    maxServiceFeePct: number;
    useTieredTarget: boolean;
    tiers: {
        minNetReturnPerChargePointMonth: number;
        maxNetReturnPerChargePointMonth: number | null;
        targetNetEchargingPerChargePointMonth: number;
    }[];
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
    locationTypeDefaults: Partial<Record<"workplace" | "destination" | "fleet" | "public" | "other", {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }>>;
}, {
    tiers: {
        minNetReturnPerChargePointMonth: number;
        maxNetReturnPerChargePointMonth: number | null;
        targetNetEchargingPerChargePointMonth: number;
    }[];
    locationTypeDefaults: Partial<Record<"workplace" | "destination" | "fleet" | "public" | "other", {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }>>;
    baseTargetNetEchargingPerChargePointMonth?: number | undefined;
    maxServiceFeePct?: number | undefined;
    useTieredTarget?: boolean | undefined;
    efluxSubscriptionPerSocketMonth?: number | undefined;
    efluxSetupPerSocket?: number | undefined;
    efluxSetupAmortizationMonths?: number | undefined;
    defaultContractDurationMonths?: number | undefined;
    defaultNoticePeriodMonths?: number | undefined;
    defaultChargeTariffPerKwh?: number | undefined;
    defaultEnergyCostPerKwh?: number | undefined;
    defaultStartFeeEnabled?: boolean | undefined;
    defaultStartFeePerSession?: number | undefined;
    defaultIdleFeeEnabled?: boolean | undefined;
    defaultIdleFeePerMinute?: number | undefined;
    defaultIdleGraceMinutes?: number | undefined;
}>;
export declare const pricingInputSchema: z.ZodObject<{
    customer: z.ZodObject<{
        companyName: z.ZodDefault<z.ZodString>;
        contactName: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        contactEmail: z.ZodDefault<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
        contactPhone: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        locationAddress: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        postalCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        city: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        locationType: z.ZodEnum<["workplace", "destination", "fleet", "public", "other"]>;
    }, "strip", z.ZodTypeAny, {
        companyName: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string;
        locationAddress: string;
        postalCode: string;
        city: string;
        locationType: "workplace" | "destination" | "fleet" | "public" | "other";
    }, {
        locationType: "workplace" | "destination" | "fleet" | "public" | "other";
        companyName?: string | undefined;
        contactName?: string | undefined;
        contactEmail?: string | undefined;
        contactPhone?: string | undefined;
        locationAddress?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
    }>;
    hardware: z.ZodObject<{
        chargePoints: z.ZodNumber;
        socketsPerChargePoint: z.ZodNumber;
        hardwareInvestment: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        chargePoints: number;
        socketsPerChargePoint: number;
        hardwareInvestment: number;
    }, {
        chargePoints: number;
        socketsPerChargePoint: number;
        hardwareInvestment?: number | undefined;
    }>;
    usage: z.ZodObject<{
        sessionsPerChargePointMonth: z.ZodNumber;
        kwhPerChargePointMonth: z.ZodNumber;
        averageSessionDurationHours: z.ZodNumber;
        effectiveChargingPowerKw: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }, {
        sessionsPerChargePointMonth: number;
        kwhPerChargePointMonth: number;
        averageSessionDurationHours: number;
        effectiveChargingPowerKw: number;
    }>;
    contract: z.ZodObject<{
        durationMonths: z.ZodNumber;
        noticePeriodMonths: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        durationMonths: number;
        noticePeriodMonths: number;
    }, {
        durationMonths: number;
        noticePeriodMonths: number;
    }>;
    tariffs: z.ZodObject<{
        chargeTariffPerKwh: z.ZodNumber;
        energyCostPerKwh: z.ZodNumber;
        startFeeEnabled: z.ZodBoolean;
        startFeePerSession: z.ZodNumber;
        idleFeeEnabled: z.ZodBoolean;
        idleFeePerMinute: z.ZodNumber;
        idleGraceMinutes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        chargeTariffPerKwh: number;
        energyCostPerKwh: number;
        startFeeEnabled: boolean;
        startFeePerSession: number;
        idleFeeEnabled: boolean;
        idleFeePerMinute: number;
        idleGraceMinutes: number;
    }, {
        chargeTariffPerKwh: number;
        energyCostPerKwh: number;
        startFeeEnabled: boolean;
        startFeePerSession: number;
        idleFeeEnabled: boolean;
        idleFeePerMinute: number;
        idleGraceMinutes: number;
    }>;
    targetMode: z.ZodDefault<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"tieredTarget">;
    }, "strip", z.ZodTypeAny, {
        type: "tieredTarget";
    }, {
        type: "tieredTarget";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"fixedTarget">;
        targetNetEchargingPerChargePointMonth: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        targetNetEchargingPerChargePointMonth: number;
        type: "fixedTarget";
    }, {
        targetNetEchargingPerChargePointMonth: number;
        type: "fixedTarget";
    }>]>>;
}, "strip", z.ZodTypeAny, {
    customer: {
        companyName: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string;
        locationAddress: string;
        postalCode: string;
        city: string;
        locationType: "workplace" | "destination" | "fleet" | "public" | "other";
    };
    hardware: {
        chargePoints: number;
        socketsPerChargePoint: number;
        hardwareInvestment: number;
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
    targetMode: {
        type: "tieredTarget";
    } | {
        targetNetEchargingPerChargePointMonth: number;
        type: "fixedTarget";
    };
}, {
    customer: {
        locationType: "workplace" | "destination" | "fleet" | "public" | "other";
        companyName?: string | undefined;
        contactName?: string | undefined;
        contactEmail?: string | undefined;
        contactPhone?: string | undefined;
        locationAddress?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
    };
    hardware: {
        chargePoints: number;
        socketsPerChargePoint: number;
        hardwareInvestment?: number | undefined;
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
    targetMode?: {
        type: "tieredTarget";
    } | {
        targetNetEchargingPerChargePointMonth: number;
        type: "fixedTarget";
    } | undefined;
}>;
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
export declare const defaultConfiguratorSettings: ConfiguratorSettings;
export declare const excelDefaultPricingInput: PricingInput;
export declare function calculatePricing(rawInput: PricingInput, rawSettings?: ConfiguratorSettings): PricingResult;
//# sourceMappingURL=index.d.ts.map