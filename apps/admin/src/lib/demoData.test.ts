import { describe, expect, it } from "vitest";
import { buildDemoDataset, type DemoDataset } from "./demoData";
import { DEMO_SCENARIOS, SCENARIO_KEYS, demoParamsFromConfiguration } from "./demoScenarios";
import { INVOICE_NUMBER_RE, validateSelfBillingInvoiceData } from "@/services/invoiceValidation";
import { buildSelfBillingInvoicePdf } from "@/services/invoicePdf";
import { getCurrentMonth, shiftMonth } from "@/lib/period";

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

  it("verbruik ligt conform de inschatting met een lichte stijging (geen rechte lijn)", () => {
    // settlements zijn newest-first → chronologisch = omgekeerd (oudste eerst).
    const chrono = [...ds.settlements].reverse().map((s) => Number(s.total_kwh));
    const estimate = key * params.kwhPerCpMonth; // de inschatting (laadpalen × kWh/paal)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    // (a) conform inschatting: elke maand binnen een realistische band rond de inschatting
    //     (dus geen opbouw vanaf ~0; de palen worden vanaf de oplevering gebruikt).
    expect(chrono.every((v) => v > estimate * 0.7 && v < estimate * 1.35)).toBe(true);
    // (b) lichte stijging: de laatste maanden gemiddeld hoger dan de eerste.
    expect(avg(chrono.slice(-4))).toBeGreaterThan(avg(chrono.slice(0, 4)));
    // (c) schommeling: niet alle maanden gelijk (geen rechte lijn).
    expect(new Set(chrono).size).toBeGreaterThan(1);
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

  it("tijdlijn: historie t/m de aankomende maand; deel al uitbetaald, lopende + aankomende onderweg", () => {
    expect(ds.settlements.length).toBe(14);
    const cur = getCurrentMonth();
    const upcoming = shiftMonth(cur, 1);
    const keys = ds.settlements.map((s) => s.year * 100 + s.month).sort((a, b) => a - b);
    // Nieuwste maand = de aankomende maand (waar het dashboard op opent).
    expect(keys[keys.length - 1]).toBe(upcoming.year * 100 + upcoming.month);
    // 12 afgeronde maanden al uitbetaald (met uitbetaaldatum), 2 onderweg (lopend + aankomend).
    const paid = ds.settlements.filter((s) => s.status === "paid");
    const approved = ds.settlements.filter((s) => s.status === "approved");
    expect(paid.length).toBe(12);
    expect(approved.length).toBe(2);
    expect(paid.every((s) => s.paid_at !== null && s.eflux_reimbursed_at !== null)).toBe(true);
    expect(approved.every((s) => s.paid_at === null)).toBe(true);
    // De aankomende + lopende maand zijn de twee 'approved'-maanden.
    const approvedKeys = approved.map((s) => s.year * 100 + s.month).sort((a, b) => a - b);
    expect(approvedKeys).toEqual([cur.year * 100 + cur.month, upcoming.year * 100 + upcoming.month]);
  });

  it("ERE: scenario toont de indicatieve ERE-schatting (default aan)", () => {
    expect(ds.client.calculate_ere_enabled).toBe(true);
    expect(ds.kpiRows.every((k) => Number(k.ere_estimate) > 0)).toBe(true);
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
  it("neemt instellingen + inschatting over, maar NIET de klantgegevens", () => {
    const p = demoParamsFromConfiguration("lead-123", {
      pricing_input: {
        hardware: { chargePoints: 8, hardwareInvestment: 22500 },
        usage: { kwhPerChargePointMonth: 460, sessionsPerChargePointMonth: 24, effectiveChargingPowerKw: 22 },
        customer: { companyName: "Acme BV", contactName: "Jan", contactEmail: "jan@acme.nl", locationAddress: "Industrieweg 5", postalCode: "1234 AB", city: "Utrecht" },
      },
      pricing_result: { customerNetPerChargePointMonth: 267.26 }, // 267.26/460 ≈ 0,581
    });
    // Instellingen + inschatting overgenomen:
    expect(p.chargePoints).toBe(8);
    expect(p.kwhPerCpMonth).toBe(460);
    expect(p.netRatePerKwh).toBeCloseTo(0.581, 2);
    expect(p.chargerPowerKw).toBe(22);
    expect(p.id).toBe("lead-lead-123");
    // Klantgegevens NIET overgenomen → vaste demo-naam, niet "Acme BV"/"Industrieweg 5".
    expect(p.customer.companyName).not.toBe("Acme BV");
    expect(p.customer.companyName.length).toBeGreaterThan(0);
    const ds = buildDemoDataset(p);
    expect(ds.locations.length).toBe(1);
    expect(ds.locations[0].charge_points?.length).toBe(8);
    expect(ds.locations[0].address).not.toBe("Industrieweg 5");
  });

  it("valt veilig terug bij lege configuratie", () => {
    const p = demoParamsFromConfiguration("x", {});
    expect(p.chargePoints).toBeGreaterThanOrEqual(1);
    expect(p.netRatePerKwh).toBeGreaterThan(0);
    expect(Number.isFinite(p.kwhPerCpMonth)).toBe(true);
    expect(p.customer.companyName.length).toBeGreaterThan(0); // vaste demo-naam
    // determinisme: zelfde lead → zelfde params
    expect(demoParamsFromConfiguration("x", {})).toEqual(p);
  });

  it("neemt ERE over uit de configuratie (aan/uit)", () => {
    const on = demoParamsFromConfiguration("e1", { ere: true });
    expect(on.ereEnabled).toBe(true);
    const dsOn = buildDemoDataset(on);
    expect(dsOn.client.calculate_ere_enabled).toBe(true);
    expect(dsOn.kpiRows.every((k) => Number(k.ere_estimate) > 0)).toBe(true);

    const off = demoParamsFromConfiguration("e2", { ere: false });
    expect(off.ereEnabled).toBe(false);
    const dsOff = buildDemoDataset(off);
    expect(dsOff.client.calculate_ere_enabled).toBe(false);
    expect(dsOff.kpiRows.every((k) => Number(k.ere_estimate) === 0)).toBe(true);
  });
});
