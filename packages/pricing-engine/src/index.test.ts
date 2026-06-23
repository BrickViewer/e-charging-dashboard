import { describe, expect, it } from "vitest";

import {
  calculatePricing,
  configuratorSettingsSchema,
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
    // referentie, maar billing gebruikt de instelbare gem. (180). Iedereen betaalt na de grace.
    closeTo(result.derivedIdleMinutesPerSession, 235);
    closeTo(result.idleMinutesPerSession, 180);
    closeTo(result.billableIdleMinutesPerSession, 120); // 180 − 60 grace
    closeTo(result.billableIdleMinutesPerChargePointMonth, 1440); // × 12 sessies
    closeTo(result.idleFeeRevenuePerChargePointMonth, 72); // × €0,05
    closeTo(result.perHourFeeRevenuePerChargePointMonth, 0); // uurtarief standaard uit

    // netto rendement = 116 (laden) − 50 (stroom) + 6 (start) + 72 (blokkeer).
    closeTo(result.netReturnPerChargePointMonth, 144);

    // marge = 0,05 €/kWh × 200 kWh = 10; klant houdt 144 − 10 = 134 over.
    closeTo(result.echargingMarginPerKwh, 0.05);
    closeTo(result.echargingMarginPerChargePointMonth, 10);
    closeTo(result.customerNetPerChargePointMonth, 134);
    closeTo(result.echargingNetPerChargePointMonth, 10);

    closeTo(result.serviceFeePct, 10 / 144);

    // totalen schalen met 10 laadpunten.
    closeTo(result.totals.customerPerMonth, 1340);
    closeTo(result.totals.echargingNetPerMonth, 100);
    closeTo(result.totals.netReturnPerMonth, 1440);
    expect(result.status).toBe("ok");
  });

  it("baseert blokkeertarief op de gemiddelde stilstaande minuten, niet op de naïeve sessieduur − laadtijd", () => {
    const result = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);
    // Naïef (alle stilstand uit sessieduur − laadtijd): (235 − 60) × 12 × €0,05 = €105/paal.
    const naiveRevenue = Math.max(0, result.derivedIdleMinutesPerSession - 60) * 12 * 0.05;
    closeTo(naiveRevenue, 105);
    // Wij rekenen op de instelbare gem. stilstand (180): (180 − 60) × 12 × €0,05 = €72/paal —
    // lager dan naïef én zonder verwarrend "% dat betaalt".
    expect(result.idleFeeRevenuePerChargePointMonth).toBeLessThan(naiveRevenue);
    closeTo(result.idleFeeRevenuePerChargePointMonth, 72);
  });

  it("grace en aan/uit zijn de hefbomen voor het blokkeertarief (geen '% dat betaalt' meer)", () => {
    const base = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);

    // Hogere grace → minder belaste minuten → lagere opbrengst.
    const higherGrace = calculatePricing(
      { ...excelDefaultPricingInput, tariffs: { ...excelDefaultPricingInput.tariffs, idleGraceMinutes: 180 } },
      defaultConfiguratorSettings,
    );
    expect(higherGrace.idleFeeRevenuePerChargePointMonth)
      .toBeLessThan(base.idleFeeRevenuePerChargePointMonth);

    // Lagere gem. stilstand (90) → (90 − 60) × 12 × €0,05 = €18.
    const lowerIdle = calculatePricing(
      { ...excelDefaultPricingInput, usage: { ...excelDefaultPricingInput.usage, idleMinutesPerSession: 90 } },
      defaultConfiguratorSettings,
    );
    closeTo(lowerIdle.idleFeeRevenuePerChargePointMonth, 18);

    // Uitgeschakeld → géén idle-opbrengst.
    const off = calculatePricing(
      { ...excelDefaultPricingInput, tariffs: { ...excelDefaultPricingInput.tariffs, idleFeeEnabled: false } },
      defaultConfiguratorSettings,
    );
    closeTo(off.idleFeeRevenuePerChargePointMonth, 0);
  });

  it("rekent het uurtarief per uur aan de paal (sessies × sessieduur × tarief), additief", () => {
    const base = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);
    closeTo(base.perHourFeeRevenuePerChargePointMonth, 0); // standaard uit

    const withHourly = calculatePricing(
      { ...excelDefaultPricingInput, tariffs: { ...excelDefaultPricingInput.tariffs, perHourFeeEnabled: true, perHourFeePerHour: 2 } },
      defaultConfiguratorSettings,
    );
    // 12 sessies × 6 uur × €2 = €144/paal/maand.
    closeTo(withHourly.perHourFeeRevenuePerChargePointMonth, 144);
    // Additief op het netto rendement.
    closeTo(withHourly.netReturnPerChargePointMonth, base.netReturnPerChargePointMonth + 144);
    // Volledig naar de klant (e-charging-marge blijft vast per kWh): delta = 144 × 10 laadpunten.
    closeTo(withHourly.deltas.perHourFeeCustomerPerMonth, 1440);
  });

  it("scales the e-charging margin with the configured rate", () => {
    const result = calculatePricing(excelDefaultPricingInput, {
      ...defaultConfiguratorSettings,
      echargingMarginPerKwh: 0.08,
    });

    closeTo(result.echargingMarginPerChargePointMonth, 16); // 0,08 × 200
    closeTo(result.customerNetPerChargePointMonth, 128); // 144 − 16
    closeTo(result.serviceFeePct, 16 / 144);
    expect(result.status).toBe("ok");
  });

  it("attributes the start fee to the customer in the deltas", () => {
    const result = calculatePricing(excelDefaultPricingInput, defaultConfiguratorSettings);
    // Start fee = 12 sessies × €0,50 = €6 per laadpunt → €60 over 10 laadpunten.
    closeTo(result.deltas.startFeeCustomerPerMonth, 60);
  });

  it("levert default demo-presets: 1/2/3 locaties, kleinste 5 palen", () => {
    const presets = defaultConfiguratorSettings.demoPresets;
    expect(presets.length).toBe(3);
    expect(presets[0].locations.length).toBe(1);
    expect(presets[0].locations.reduce((a, l) => a + l.chargePoints, 0)).toBe(5);
    expect(presets[2].locations.length).toBe(3);
  });

  it("schema vult demoPresets aan als ze ontbreken (oude settings-rows)", () => {
    const parsed = configuratorSettingsSchema.parse({
      locationTypeDefaults: defaultConfiguratorSettings.locationTypeDefaults,
    });
    expect(parsed.demoPresets.length).toBe(3);
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
