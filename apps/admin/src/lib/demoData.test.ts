import { describe, expect, it } from "vitest";
import { buildDemoDataset, type DemoDataset } from "./demoData";
import { DEMO_SCENARIOS, SCENARIO_KEYS, demoParamsFromConfiguration } from "./demoScenarios";
import { INVOICE_NUMBER_RE, validateSelfBillingInvoiceData } from "@/services/invoiceValidation";
import { buildSelfBillingInvoicePdf } from "@/services/invoicePdf";

const CO2_KG_PER_KWH = 0.306; // moet gelijk zijn aan de echte dashboard-RPC

const datasets: Array<{ key: number; ds: DemoDataset }> = SCENARIO_KEYS.map((key) => ({
  key,
  ds: buildDemoDataset(DEMO_SCENARIOS[key]),
}));

describe.each(datasets)("demoData scenario $key", ({ key, ds }) => {
  const params = DEMO_SCENARIOS[key];

  it("schaalt naar het juiste aantal laadpalen, 0 storingen", () => {
    const cps = ds.locations.flatMap((l) => l.charge_points ?? []);
    expect(cps.length).toBe(key);
    expect(cps.every((cp) => cp.status === "online" || cp.status === "in_use")).toBe(true);
  });

  it("opbouw is realistisch: lage start, groei naar de piek, en schommeling (geen rechte lijn)", () => {
    // settlements zijn newest-first → chronologisch = omgekeerd (oudste eerst).
    const chrono = [...ds.settlements].reverse().map((s) => Number(s.total_kwh));
    const peak = key * params.kwhPerCpMonth; // volwassen niveau = laadpalen × kWh/paal
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    // (a) lage start: de eerste maand ligt ruim onder de piek (~20% + ruis).
    expect(chrono[0]).toBeLessThan(peak * 0.45);
    // (b) groei: de laatste 3 maanden gemiddeld rond de piek en duidelijk boven de eerste 3.
    const early = avg(chrono.slice(0, 3));
    const mature = avg(chrono.slice(-3));
    expect(mature).toBeGreaterThan(early * 1.8);
    expect(mature).toBeGreaterThan(peak * 0.8);
    expect(mature).toBeLessThan(peak * 1.15);
    // (c) schommeling: niet alle maanden gelijk en niet op een perfect rechte ramp-lijn.
    expect(new Set(chrono).size).toBeGreaterThan(1);
    const rampExp = chrono.map((_, j) => peak * (0.20 + 0.80 * (j / (chrono.length - 1))));
    const maxDeviation = Math.max(...chrono.map((v, j) => Math.abs(v - rampExp[j]) / peak));
    expect(maxDeviation).toBeGreaterThan(0.02); // minstens één maand wijkt >2% van de rechte lijn af
  });

  it("elke settlement passeert de Wet OB-validatie", () => {
    for (const settlement of ds.settlements) {
      const result = validateSelfBillingInvoiceData({
        settlement,
        client: ds.client,
        org: ds.invoiceContext.org,
        paymentDetails: ds.invoiceContext.paymentDetails,
      });
      expect(result.missing).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("factuurnummers: geldig formaat + uniek", () => {
    for (const s of ds.settlements) expect(s.invoice_number).toMatch(INVOICE_NUMBER_RE);
    const nrs = ds.settlements.map((s) => s.invoice_number);
    expect(new Set(nrs).size).toBe(nrs.length);
  });

  it("sessie-generator is deterministisch", () => {
    expect(ds.getSessions({ limit: 5000 })).toEqual(ds.getSessions({ limit: 5000 }));
    expect(buildDemoDataset(DEMO_SCENARIOS[key]).getSessions({ limit: 5000 })).toEqual(ds.getSessions({ limit: 5000 }));
  });

  it("sessie-sommen per maand kloppen met de settlements (±1 kWh, exact aantal)", () => {
    for (const s of ds.settlements) {
      const { start, end } = ds.getMonthBounds(s.year, s.month);
      const sessions = ds.getSessions({ from: start, to: end, limit: 5000 });
      const kwhSum = sessions.reduce((acc, x) => acc + Number(x.kwh_delivered || 0), 0);
      expect(Math.abs(kwhSum - Number(s.total_kwh))).toBeLessThan(1);
      expect(sessions.length).toBe(s.total_sessions);
    }
  });

  it("KPI-rijen spiegelen de settlements (kWh, yield, CO₂-factor)", () => {
    expect(ds.kpiRows.length).toBe(ds.settlements.length);
    for (const kpi of ds.kpiRows) {
      const s = ds.settlements.find((x) => x.year === kpi.year && x.month === kpi.month)!;
      expect(s).toBeDefined();
      expect(kpi.total_kwh).toBe(Number(s.total_kwh));
      expect(kpi.estimated_client_yield).toBe(Number(s.client_payout));
      expect(kpi.total_customer_cashflow).toBe(kpi.estimated_client_yield);
      expect(Math.abs(kpi.co2_kg_avoided - kpi.total_kwh * CO2_KG_PER_KWH)).toBeLessThan(0.01);
    }
  });

  it("14 maanden: 12 uitbetaald + 2 onderweg", () => {
    expect(ds.settlements.length).toBe(14);
    expect(ds.settlements.filter((s) => s.status === "paid").length).toBe(12);
    expect(ds.settlements.filter((s) => s.status === "approved").length).toBe(2);
    for (const s of ds.settlements) {
      if (s.status === "paid") expect(s.paid_at).toBeTruthy();
      else expect(s.paid_at).toBeNull();
    }
  });

  it("sessie-filters werken (locatie en laadpunt)", () => {
    const loc = ds.locations[0];
    const byLoc = ds.getSessions({ locationId: loc.id, limit: 5000 });
    expect(byLoc.length).toBeGreaterThan(0);
    expect(byLoc.every((s) => s.location_name === loc.name)).toBe(true);

    const cpId = (loc.charge_points ?? [])[0].id;
    const byCp = ds.getSessions({ chargePointId: cpId, limit: 5000 });
    expect(byCp.length).toBeGreaterThan(0);
    expect(byCp.every((s) => s.charge_point_id === cpId)).toBe(true);
  });
});

describe("demoData — factuur-PDF", () => {
  it("rendert een echte PDF (≥2 pagina's) voor de 10-palen demo", async () => {
    const ds = buildDemoDataset(DEMO_SCENARIOS[10]);
    const newest = ds.settlements[0];
    const { start, end } = ds.getMonthBounds(newest.year, newest.month);
    const lines = ds.getSessions({ from: start, to: end, limit: 5000 });
    expect(lines.length).toBeGreaterThan(100);
    const doc = await buildSelfBillingInvoicePdf(
      newest, ds.client, ds.invoiceContext.org, ds.invoiceContext.paymentDetails, lines,
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

describe("demoParamsFromConfiguration", () => {
  it("mapt een volledige configuratie naar parameters", () => {
    const p = demoParamsFromConfiguration("lead-123", {
      pricing_input: {
        hardware: { chargePoints: 8, hardwareInvestment: 22500 },
        usage: { kwhPerChargePointMonth: 460, sessionsPerChargePointMonth: 24, effectiveChargingPowerKw: 22 },
        customer: { companyName: "Acme BV", contactName: "Jan", contactEmail: "jan@acme.nl", locationAddress: "Industrieweg 5", postalCode: "1234 AB", city: "Utrecht" },
      },
      pricing_result: { customerNetPerChargePointMonth: 267.26 }, // 267.26/460 ≈ 0,581
    });
    expect(p.chargePoints).toBe(8);
    expect(p.kwhPerCpMonth).toBe(460);
    expect(p.customer.companyName).toBe("Acme BV");
    expect(p.customer.city).toBe("Utrecht");
    expect(p.netRatePerKwh).toBeCloseTo(0.581, 2);
    expect(p.chargerPowerKw).toBe(22);
    expect(p.id).toBe("lead-lead-123");
    // Bouwt een geldige, consistente dataset (single-site op het klantadres).
    const ds = buildDemoDataset(p);
    expect(ds.locations.length).toBe(1);
    expect(ds.locations[0].charge_points?.length).toBe(8);
    expect(ds.locations[0].address).toBe("Industrieweg 5");
  });

  it("valt veilig terug bij lege configuratie", () => {
    const p = demoParamsFromConfiguration("x", {}, "Lege Lead BV");
    expect(p.chargePoints).toBeGreaterThanOrEqual(1);
    expect(p.netRatePerKwh).toBeGreaterThan(0);
    expect(Number.isFinite(p.kwhPerCpMonth)).toBe(true);
    expect(p.customer.companyName).toBe("Lege Lead BV");
    // determinisme: zelfde lead → zelfde params
    expect(demoParamsFromConfiguration("x", {}, "Lege Lead BV")).toEqual(p);
  });
});
