import { describe, expect, it } from "vitest";
import { cumulativeActual, monthTarget, progressPct, rawPct, yearTarget, type KpiTargetRow } from "./kpiTargets";

const rows: KpiTargetRow[] = [
  { metric: "omzet", year: 2026, month: null, target_value: 120000 },
  { metric: "omzet", year: 2026, month: 7, target_value: 15000 },
  { metric: "kwh", year: 2026, month: 1, target_value: 1000 },
  { metric: "kwh", year: 2026, month: 2, target_value: 2000 },
];

describe("monthTarget", () => {
  it("expliciet maanddoel wint van jaardoel/12", () => {
    expect(monthTarget(rows, "omzet", 7)).toBe(15000);
  });
  it("valt terug op jaardoel/12 zonder maanddoel", () => {
    expect(monthTarget(rows, "omzet", 3)).toBe(10000);
  });
  it("null zonder enig doel", () => {
    expect(monthTarget(rows, "marge", 5)).toBeNull();
  });
});

describe("yearTarget", () => {
  it("expliciet jaardoel wint", () => {
    expect(yearTarget(rows, "omzet")).toBe(120000);
  });
  it("som van maanddoelen als er geen jaardoel is", () => {
    expect(yearTarget(rows, "kwh")).toBe(3000);
  });
  it("null zonder enig doel", () => {
    expect(yearTarget(rows, "gewonnen_leads")).toBeNull();
  });
});

describe("cumulativeActual", () => {
  it("telt t/m de gegeven maand", () => {
    expect(cumulativeActual([10, 20, 30, 40, 0, 0, 0, 0, 0, 0, 0, 0], 3)).toBe(60);
  });
  it("kapt af op 12 en negeert lege waarden", () => {
    expect(cumulativeActual([1, 2, 3], 15)).toBe(6);
  });
});

describe("progressPct", () => {
  it("berekent en kapt af op 100", () => {
    expect(progressPct(50, 100)).toBe(50);
    expect(progressPct(150, 100)).toBe(100);
  });
  it("null zonder (positief) doel", () => {
    expect(progressPct(50, null)).toBeNull();
    expect(progressPct(50, 0)).toBeNull();
  });
});

describe("rawPct", () => {
  it("toont boven 100% zonder afkappen", () => {
    expect(rawPct(150, 100)).toBe(150);
    expect(rawPct(50, 100)).toBe(50);
  });
  it("null zonder (positief) doel", () => {
    expect(rawPct(50, null)).toBeNull();
    expect(rawPct(50, 0)).toBeNull();
  });
});
