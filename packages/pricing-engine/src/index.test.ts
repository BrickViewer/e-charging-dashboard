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

    closeTo(result.kwhPerSession, 200 / 12);
    closeTo(result.chargingMinutesPerSession, 125);

    // Stilstaande minuten: de afgeleide waarde (sessieduur − laadtijd = 235) blijft als
    // referentie, maar billing gebruikt de instelbare gem. (180) × keten.
    closeTo(result.derivedIdleMinutesPerSession, 235);
    closeTo(result.idleMinutesPerSession, 180);
    closeTo(result.idleBillableSharePct, 10);
    closeTo(result.billableIdleMinutesPerSession, 120); // 180 − 60 grace
    closeTo(result.effectiveBillableIdleMinutesPerSession, 12); // × 10%
    closeTo(result.billableIdleMinutesPerChargePointMonth, 144); // × 12 sessies
    closeTo(result.idleFeeRevenuePerChargePointMonth, 7.2); // × €0,05

    // netto rendement = 116 (laden) − 50 (stroom) + 6 (start) + 7,2 (blokkeer).
    closeTo(result.netReturnPerChargePointMonth, 79.2);

    // marge = 0,05 €/kWh × 200 kWh = 10; klant houdt 79,2 − 10 = 69,2 over.
    closeTo(result.echargingMarginPerKwh, 0.05);
    closeTo(result.echargingMarginPerChargePointMonth, 10);
    closeTo(result.customerNetPerChargePointMonth, 69.2);
    closeTo(result.echargingNetPerChargePointMonth, 10);

    closeTo(result.serviceFeePct, 10 / 79.2);

    // totalen schalen met 10 laadpunten.
    closeTo(result.totals.customerPerMonth, 692);
    closeTo(result.totals.echargingNetPerMonth, 100);
    closeTo(result.totals.netReturnPerMonth, 792);
    expect(result.status).toBe("ok");
  });

  it("keeps idle revenue far below the old naive (sessieduur − laadtijd) derivation", () => {
    const result = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);
    // Oude model belastte ALLE sessies op de afgeleide idle: (235 − 60) × 12 × €0,05 = €105/paal.
    const naiveOldRevenue = Math.max(0, result.derivedIdleMinutesPerSession - 60) * 12 * 0.05;
    closeTo(naiveOldRevenue, 105);
    // Nieuw, realistisch: €7,2/paal — een orde lager, niet-misleidend.
    expect(result.idleFeeRevenuePerChargePointMonth).toBeLessThan(naiveOldRevenue);
    closeTo(result.idleFeeRevenuePerChargePointMonth, 7.2);
    // De share-factor verlaagt de belaste minuten t.o.v. enkel grace.
    expect(result.effectiveBillableIdleMinutesPerSession)
      .toBeLessThan(result.billableIdleMinutesPerSession);
  });

  it("idle grace and billable-share are the levers that lower the projection", () => {
    const base = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);

    // Hogere grace → minder belaste minuten → lagere opbrengst.
    const higherGrace = calculatePricing(
      { ...excelDefaultPricingInput, tariffs: { ...excelDefaultPricingInput.tariffs, idleGraceMinutes: 180 } },
      defaultConfiguratorSettings,
    );
    expect(higherGrace.idleFeeRevenuePerChargePointMonth)
      .toBeLessThan(base.idleFeeRevenuePerChargePointMonth);

    // Lagere share → lagere opbrengst (lineair).
    const lowerShare = calculatePricing(
      { ...excelDefaultPricingInput, usage: { ...excelDefaultPricingInput.usage, idleBillableSharePct: 5 } },
      defaultConfiguratorSettings,
    );
    closeTo(lowerShare.idleFeeRevenuePerChargePointMonth, base.idleFeeRevenuePerChargePointMonth / 2);

    // Uitgeschakeld → géén idle-opbrengst.
    const off = calculatePricing(
      { ...excelDefaultPricingInput, tariffs: { ...excelDefaultPricingInput.tariffs, idleFeeEnabled: false } },
      defaultConfiguratorSettings,
    );
    closeTo(off.idleFeeRevenuePerChargePointMonth, 0);
  });

  it("scales the e-charging margin with the configured rate", () => {
    const result = calculatePricing(excelDefaultPricingInput, {
      ...defaultConfiguratorSettings,
      echargingMarginPerKwh: 0.08,
    });

    closeTo(result.echargingMarginPerChargePointMonth, 16); // 0,08 × 200
    closeTo(result.customerNetPerChargePointMonth, 63.2); // 79,2 − 16
    closeTo(result.serviceFeePct, 16 / 79.2);
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
