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
  it("computes the customer net via a fixed e-charging margin per kWh", () => {
    const result = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);

    // Sessie- en blokkeertijd-rekenwijze blijft ongewijzigd.
    closeTo(result.kwhPerSession, 200 / 12);
    closeTo(result.chargingMinutesPerSession, 125);
    closeTo(result.idleMinutesPerSession, 235);
    closeTo(result.billableIdleMinutesPerSession, 175);
    closeTo(result.billableIdleMinutesPerChargePointMonth, 2100);

    // netto rendement = 116 (laden) − 50 (stroom) + 6 (start) + 105 (blokkeer).
    closeTo(result.netReturnPerChargePointMonth, 177);

    // marge = 0,05 €/kWh × 200 kWh = 10; klant houdt 177 − 10 = 167 over.
    closeTo(result.echargingMarginPerKwh, 0.05);
    closeTo(result.echargingMarginPerChargePointMonth, 10);
    closeTo(result.customerNetPerChargePointMonth, 167);
    closeTo(result.echargingNetPerChargePointMonth, 10);

    // afgeleid effectief fee-percentage = marge / netto rendement.
    closeTo(result.serviceFeePct, 10 / 177);

    // totalen schalen met 10 laadpunten.
    closeTo(result.totals.customerPerMonth, 1670);
    closeTo(result.totals.echargingNetPerMonth, 100);
    closeTo(result.totals.netReturnPerMonth, 1770);
    expect(result.status).toBe("ok");
  });

  it("scales the e-charging margin with the configured rate", () => {
    const result = calculatePricing(excelDefaultPricingInput, {
      ...defaultConfiguratorSettings,
      echargingMarginPerKwh: 0.08,
    });

    closeTo(result.echargingMarginPerChargePointMonth, 16); // 0,08 × 200
    closeTo(result.customerNetPerChargePointMonth, 161); // 177 − 16
    closeTo(result.serviceFeePct, 16 / 177);
    expect(result.status).toBe("ok");
  });

  it("attributes the start fee to the customer in the deltas", () => {
    const result = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);
    // Start fee = 12 sessies × €0,50 = €6 per laadpunt → €60 over 10 laadpunten.
    closeTo(result.deltas.startFeeCustomerPerMonth, 60);
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
    });
    const result = calculatePricing(input, defaultConfiguratorSettings);

    expect(result.status).toBe("blocked");
    expect(result.blockingReasons.some((reason) => reason.includes("nul of negatief"))).toBe(true);
  });
});
