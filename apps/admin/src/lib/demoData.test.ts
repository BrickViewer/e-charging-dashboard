import { describe, expect, it } from "vitest";
import {
  DEMO_CLIENT,
  DEMO_INVOICE_CONTEXT,
  DEMO_KPI_ROWS,
  DEMO_LOCATIONS,
  DEMO_SETTLEMENTS,
  getDemoMonthBounds,
  getDemoSessions,
} from "./demoData";
import { INVOICE_NUMBER_RE, validateSelfBillingInvoiceData } from "@/services/invoiceValidation";
import { buildSelfBillingInvoicePdf } from "@/services/invoicePdf";

const CO2_KG_PER_KWH = 0.306; // moet gelijk zijn aan de echte dashboard-RPC

describe("demoData — factuur-compliance", () => {
  it("elke demo-settlement passeert de Wet OB-validatie (factuur-download werkt)", () => {
    for (const settlement of DEMO_SETTLEMENTS) {
      const result = validateSelfBillingInvoiceData({
        settlement,
        client: DEMO_CLIENT,
        org: DEMO_INVOICE_CONTEXT.org,
        paymentDetails: DEMO_INVOICE_CONTEXT.paymentDetails,
      });
      expect(result.missing).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("alle factuurnummers volgen de doorlopende reeks", () => {
    for (const s of DEMO_SETTLEMENTS) {
      expect(s.invoice_number).toMatch(INVOICE_NUMBER_RE);
    }
    // Uniek
    const nrs = DEMO_SETTLEMENTS.map((s) => s.invoice_number);
    expect(new Set(nrs).size).toBe(nrs.length);
  });

  it("rendert een echte PDF voor de nieuwste demo-maand", async () => {
    const newest = DEMO_SETTLEMENTS[0];
    const { start, end } = getDemoMonthBounds(newest.year, newest.month);
    const lines = getDemoSessions({ from: start, to: end, limit: 5000 });
    expect(lines.length).toBeGreaterThan(100);
    const doc = await buildSelfBillingInvoicePdf(
      newest,
      DEMO_CLIENT,
      DEMO_INVOICE_CONTEXT.org,
      DEMO_INVOICE_CONTEXT.paymentDetails,
      lines,
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

describe("demoData — interne consistentie", () => {
  it("sessie-generator is deterministisch", () => {
    const a = getDemoSessions({ limit: 5000 });
    const b = getDemoSessions({ limit: 5000 });
    expect(a).toEqual(b);
  });

  it("sessie-sommen per maand kloppen met de settlements (±1 kWh)", () => {
    for (const s of DEMO_SETTLEMENTS) {
      const { start, end } = getDemoMonthBounds(s.year, s.month);
      const sessions = getDemoSessions({ from: start, to: end, limit: 5000 });
      const kwhSum = sessions.reduce((acc, x) => acc + Number(x.kwh_delivered || 0), 0);
      expect(Math.abs(kwhSum - Number(s.total_kwh))).toBeLessThan(1);
      expect(sessions.length).toBe(s.total_sessions);
    }
  });

  it("KPI-rijen spiegelen de settlements (kWh, yield, CO₂-factor)", () => {
    expect(DEMO_KPI_ROWS.length).toBe(DEMO_SETTLEMENTS.length);
    for (const kpi of DEMO_KPI_ROWS) {
      const s = DEMO_SETTLEMENTS.find((x) => x.year === kpi.year && x.month === kpi.month)!;
      expect(s).toBeDefined();
      expect(kpi.total_kwh).toBe(Number(s.total_kwh));
      expect(kpi.estimated_client_yield).toBe(Number(s.client_payout));
      expect(kpi.total_customer_cashflow).toBe(kpi.estimated_client_yield);
      expect(Math.abs(kpi.co2_kg_avoided - kpi.total_kwh * CO2_KG_PER_KWH)).toBeLessThan(0.01);
    }
  });

  it("settlements: 12 uitbetaald + 2 onderweg, betaaldatums consistent", () => {
    const paid = DEMO_SETTLEMENTS.filter((s) => s.status === "paid");
    const approved = DEMO_SETTLEMENTS.filter((s) => s.status === "approved");
    expect(paid.length).toBe(12);
    expect(approved.length).toBe(2);
    for (const s of paid) expect(s.paid_at).toBeTruthy();
    for (const s of approved) expect(s.paid_at).toBeNull();
  });

  it("vloot: 12 laadpunten, geen storingen", () => {
    const cps = DEMO_LOCATIONS.flatMap((l) => l.charge_points ?? []);
    expect(cps.length).toBe(12);
    expect(cps.every((cp) => cp.status === "online" || cp.status === "in_use")).toBe(true);
  });

  it("sessie-filters werken (locatie en laadpunt)", () => {
    const loc1 = getDemoSessions({ locationId: "demo-loc-1", limit: 5000 });
    expect(loc1.length).toBeGreaterThan(0);
    expect(loc1.every((s) => s.location_name === "Hofstede Huis")).toBe(true);

    const cp = getDemoSessions({ chargePointId: "demo-cp-201", limit: 5000 });
    expect(cp.length).toBeGreaterThan(0);
    expect(cp.every((s) => s.charge_point_id === "demo-cp-201")).toBe(true);
  });
});
