import { describe, it, expect } from "vitest";
import {
  DEFAULT_ECHARGING_FEE_PER_KWH as APP_FEE,
  calculateSettlement,
} from "./calculations";
// De Deno edge-module (aggregate-settlements gebruikt deze). Plain TS, geen Deno-globals.
import {
  DEFAULT_ECHARGING_FEE_PER_KWH as EDGE_FEE,
  computeSettlement,
} from "../../../../supabase/functions/_shared/settlement-math";

// ============================================================================
// Cross-runtime GOLDEN-VECTOR + PARITY test voor de per-kWh service-fee.
// Pint de fee-constante en de afrekenformule vast over (a) de app-side
// calculations.ts en (b) de Deno-module die de echte settlement-writer gebruikt.
// Voorheen bewaakte alleen de app-constante; de schrijvende kant was ongetest.
// ============================================================================

// Golden vectors: [kwh, gross, feePerKwh] -> [echargingRevenue, clientPayout]
const GOLDEN: Array<{ kwh: number; gross: number; fee: number; rev: number; payout: number }> = [
  { kwh: 100, gross: 50, fee: 0.10, rev: 10, payout: 40 },
  { kwh: 0, gross: 0, fee: 0.10, rev: 0, payout: 0 },
  { kwh: 1234.567, gross: 500, fee: 0.10, rev: 123.4567, payout: 376.5433 },
  { kwh: 250, gross: 12.5, fee: 0.05, rev: 12.5, payout: 0 },        // override-tarief
  { kwh: 80, gross: 4, fee: 0.12, rev: 9.6, payout: -5.6 },          // negatieve afrekening
];

describe("service-fee constante", () => {
  it("is 0.10 (tien cent per kWh, NIET 0.001) in beide runtimes", () => {
    expect(APP_FEE).toBe(0.10);
    expect(EDGE_FEE).toBe(0.10);
    expect(APP_FEE).toBe(EDGE_FEE);
  });
});

describe("computeSettlement golden vectors", () => {
  for (const g of GOLDEN) {
    it(`kwh=${g.kwh} gross=${g.gross} fee=${g.fee} -> rev=${g.rev} payout=${g.payout}`, () => {
      const r = computeSettlement({ totalKwh: g.kwh, grossRevenue: g.gross, feePerKwh: g.fee });
      expect(r.feePerKwh).toBe(g.fee);
      expect(r.echargingRevenue).toBeCloseTo(g.rev, 9);
      expect(r.clientPayout).toBeCloseTo(g.payout, 9);
    });
  }

  it("feeWaived nult de fee en betaalt de volledige bruto uit", () => {
    const r = computeSettlement({ totalKwh: 100, grossRevenue: 50, feePerKwh: 0.10, feeWaived: true });
    expect(r.feePerKwh).toBe(0);
    expect(r.echargingRevenue).toBe(0);
    expect(r.clientPayout).toBe(50);
  });

  it("zonder feePerKwh valt terug op de default", () => {
    const r = computeSettlement({ totalKwh: 100, grossRevenue: 50 });
    expect(r.feePerKwh).toBe(EDGE_FEE);
    expect(r.echargingRevenue).toBeCloseTo(10, 9);
  });
});

describe("app calculateSettlement <-> edge computeSettlement pariteit", () => {
  for (const g of GOLDEN) {
    it(`identiek voor kwh=${g.kwh} gross=${g.gross} fee=${g.fee}`, () => {
      const app = calculateSettlement({ totalKwh: g.kwh, grossRevenue: g.gross, feePerKwh: g.fee });
      const edge = computeSettlement({ totalKwh: g.kwh, grossRevenue: g.gross, feePerKwh: g.fee });
      expect(edge.feePerKwh).toBe(app.echargingFeePerKwh);
      expect(edge.echargingRevenue).toBeCloseTo(app.echargingRevenue, 12);
      expect(edge.clientPayout).toBeCloseTo(app.clientPayout, 12);
    });
  }
});
