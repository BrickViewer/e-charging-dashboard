import { describe, expect, it } from "vitest";
import { estimateGaugeTextEm, fitGaugeFontSize, niceQuarterMax } from "./gaugeUtils";

// Budgetten zoals CockpitGauge ze afleidt uit de geometrie:
// 2·(tickInner·cos(11,25°) − 6) met tickInner = 159 (xl) / 90 (md)
const XL_MAX = 2 * (159 * Math.cos((11.25 * Math.PI) / 180) - 6); // ≈ 299,9
const MD_MAX = 2 * (90 * Math.cos((11.25 * Math.PI) / 180) - 6); // ≈ 164,5

describe("estimateGaugeTextEm", () => {
  it("rekent met de tnum-cijferbreedte van Outfit bold", () => {
    expect(estimateGaugeTextEm("0")).toBeCloseTo(0.59, 5);
    expect(estimateGaugeTextEm("0,0", 0.01)).toBeCloseTo(2 * 0.59 + 0.283 + 2 * 0.01, 5);
  });

  it("lege string is 0", () => {
    expect(estimateGaugeTextEm("")).toBe(0);
  });
});

describe("fitGaugeFontSize", () => {
  it("korte strings blijven op de basisgrootte", () => {
    expect(fitGaugeFontSize("561,00", 38, MD_MAX, 0.01)).toBe(38);
    expect(fitGaugeFontSize("1.717", 38, MD_MAX, 0.01)).toBe(38);
  });

  it("27.388,34 (md) krimpt en past binnen het budget", () => {
    const size = fitGaugeFontSize("27.388,34", 38, MD_MAX, 0.01);
    expect(size).toBeLessThan(38);
    expect(size).toBeGreaterThanOrEqual(38 * 0.55);
    expect(estimateGaugeTextEm("27.388,34", 0.01) * size).toBeLessThanOrEqual(MD_MAX + 0.5);
  });

  it("xl: 12.345,67 krimpt verder dan 3.259,41", () => {
    const kort = fitGaugeFontSize("3.259,41", 72, XL_MAX, 0.02);
    const lang = fitGaugeFontSize("12.345,67", 72, XL_MAX, 0.02);
    expect(kort).toBeGreaterThan(65);
    expect(kort).toBeLessThanOrEqual(72);
    expect(lang).toBeLessThan(kort);
    expect(estimateGaugeTextEm("12.345,67", 0.02) * lang).toBeLessThanOrEqual(XL_MAX + 0.5);
  });

  it("is monotoon niet-stijgend als er cijfers bijkomen", () => {
    let text = "1";
    let prev = fitGaugeFontSize(text, 38, MD_MAX, 0.01);
    for (let i = 0; i < 12; i++) {
      text += "9";
      const next = fitGaugeFontSize(text, 38, MD_MAX, 0.01);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });

  it("respecteert de ondergrens van 55% bij absurde lengtes", () => {
    const size = fitGaugeFontSize("9".repeat(30), 38, MD_MAX, 0.01);
    expect(size).toBe(Math.round(38 * 0.55 * 10) / 10);
  });

  it("lege string blijft op de basisgrootte", () => {
    expect(fitGaugeFontSize("", 38, MD_MAX, 0.01)).toBe(38);
  });
});

describe("niceQuarterMax (gedocumenteerde voorbeelden)", () => {
  it("volgt de voorbeelden uit het headercommentaar", () => {
    expect(niceQuarterMax(97.55)).toBe(200);
    expect(niceQuarterMax(775.06)).toBe(1000);
    expect(niceQuarterMax(1614)).toBe(2000);
    expect(niceQuarterMax(0)).toBe(100);
  });
});
