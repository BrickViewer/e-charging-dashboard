import { describe, expect, it } from "vitest";

import {
  calculatePricing,
  defaultConfiguratorSettings,
  excelDefaultPricingInput,
  pricingInputSchema,
} from "./index";

const closeTo = (received: number, expected: number, precision = 6) => {
  expect(received).toBeCloseTo(expected, precision);
};

describe("pricing engine", () => {
  it("matches the Excel default calculator output in fixed-target mode", () => {
    const result = calculatePricing(excelDefaultPricingInput, {
      ...defaultConfiguratorSettings,
      useTieredTarget: false,
    });

    closeTo(result.kwhPerSession, 200 / 12);
    closeTo(result.chargingMinutesPerSession, 125);
    closeTo(result.idleMinutesPerSession, 235);
    closeTo(result.billableIdleMinutesPerSession, 175);
    closeTo(result.billableIdleMinutesPerChargePointMonth, 2100);
    closeTo(result.netReturnPerChargePointMonth, 177);
    closeTo(result.efluxCostPerSocketMonth, 6.875);
    closeTo(result.requiredGrossEchargingPerChargePointMonth, 26.875);
    closeTo(result.serviceFeePct, 0.1518361581920904);
    closeTo(result.customerNetPerChargePointMonth, 150.125);
    closeTo(result.totals.customerPerMonth, 1501.25);
    closeTo(result.echargingNetPerChargePointMonth, 20);
    closeTo(result.totals.echargingNetPerMonth, 200);
    expect(result.status).toBe("ok");
  });

  it("uses the configured tier target in tiered-target mode", () => {
    const input = pricingInputSchema.parse({
      ...excelDefaultPricingInput,
      targetMode: { type: "tieredTarget" },
    });
    const result = calculatePricing(input, defaultConfiguratorSettings);

    closeTo(result.netReturnPerChargePointMonth, 177);
    closeTo(result.targetNetEchargingPerChargePointMonth, 40);
    closeTo(result.serviceFeePct, 46.875 / 177);
    closeTo(result.echargingNetPerChargePointMonth, 40);
    closeTo(result.totals.echargingNetPerMonth, 400);
    expect(result.currentTier?.minNetReturnPerChargePointMonth).toBe(150);
    expect(result.currentTier?.maxNetReturnPerChargePointMonth).toBe(250);
    expect(result.status).toBe("ok");
  });

  it("blocks finalization when the fee exceeds max fee percentage", () => {
    const input = pricingInputSchema.parse({
      ...excelDefaultPricingInput,
      usage: {
        ...excelDefaultPricingInput.usage,
        kwhPerChargePointMonth: 60,
        averageSessionDurationHours: 1,
      },
      tariffs: {
        ...excelDefaultPricingInput.tariffs,
        idleFeeEnabled: false,
      },
      targetMode: { type: "tieredTarget" },
    });
    const result = calculatePricing(input, defaultConfiguratorSettings);

    expect(result.status).toBe("blocked");
    expect(result.blockingReasons.some((reason) => reason.includes("maximumgrens"))).toBe(true);
  });

  it("blocks finalization when net return is zero or negative", () => {
    const input = pricingInputSchema.parse({
      ...excelDefaultPricingInput,
      tariffs: {
        ...excelDefaultPricingInput.tariffs,
        chargeTariffPerKwh: 0.2,
        energyCostPerKwh: 0.35,
        startFeeEnabled: false,
        idleFeeEnabled: false,
      },
      targetMode: { type: "tieredTarget" },
    });
    const result = calculatePricing(input, defaultConfiguratorSettings);

    expect(result.status).toBe("blocked");
    expect(result.blockingReasons.some((reason) => reason.includes("nul of negatief"))).toBe(true);
  });
});
