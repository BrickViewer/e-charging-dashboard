import { describe, it, expect } from "vitest";
import { DEFAULT_ECHARGING_FEE_PER_KWH, calculateSettlement, settlementVat } from "./calculations";

describe("E-Charging service-fee model", () => {
  it("fee-constante is tien cent per kWh (0.10), niet 0.001 (= 0,10 cent)", () => {
    // Guardrail: deze test valt om als de constante per ongeluk 0.001 wordt.
    expect(DEFAULT_ECHARGING_FEE_PER_KWH).toBe(0.10);
  });

  it("100 kWh levert 10,00 fee op (faalt bij 0.001 -> 0,10)", () => {
    const r = calculateSettlement({ totalKwh: 100, grossRevenue: 58 });
    expect(r.echargingFeePerKwh).toBe(0.10);
    expect(r.echargingRevenue).toBeCloseTo(10.0, 10);
    expect(r.clientPayout).toBeCloseTo(48.0, 10);
  });

  it("geen minimum: 0 kWh levert 0 fee en client_payout gelijk aan gross", () => {
    const r = calculateSettlement({ totalKwh: 0, grossRevenue: 0 });
    expect(r.echargingRevenue).toBe(0);
    expect(r.clientPayout).toBe(0);
  });

  it("respecteert per-klant override van het tarief", () => {
    const r = calculateSettlement({ totalKwh: 100, grossRevenue: 58, feePerKwh: 0.12 });
    expect(r.echargingFeePerKwh).toBe(0.12);
    expect(r.echargingRevenue).toBeCloseTo(12.0, 10);
    expect(r.clientPayout).toBeCloseTo(46.0, 10);
  });

  it("realistische maand (Tester-achtig): 1575,225 kWh", () => {
    const r = calculateSettlement({ totalKwh: 1575.225, grossRevenue: 913.6305 });
    expect(r.echargingRevenue).toBeCloseTo(157.5225, 6);
    expect(r.clientPayout).toBeCloseTo(756.108, 6);
  });
});

describe("BTW op de vergoeding (settlementVat)", () => {
  it("BTW-plichtig (21%): april Van de berg €540,7416 -> btw €113,56, incl €654,30", () => {
    const v = settlementVat({ clientPayout: 540.7416, vatRate: 0.21 });
    expect(v.net).toBe(540.74);
    expect(v.vatAmount).toBe(113.56);
    expect(v.inclVat).toBe(654.30);
    // netto + btw moet exact het incl-bedrag zijn (boekhouding)
    expect(v.net + v.vatAmount).toBeCloseTo(v.inclVat, 10);
  });

  it("niet-BTW-plichtig (0%): geen BTW, incl = netto", () => {
    const v = settlementVat({ clientPayout: 540.7416, vatRate: 0 });
    expect(v.vatAmount).toBe(0);
    expect(v.inclVat).toBe(540.74);
  });

  it("default-tarief is 21%", () => {
    const v = settlementVat({ clientPayout: 100 });
    expect(v.vatRate).toBe(0.21);
    expect(v.vatAmount).toBe(21);
    expect(v.inclVat).toBe(121);
  });
});
