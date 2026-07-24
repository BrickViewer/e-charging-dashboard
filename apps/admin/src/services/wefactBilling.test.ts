import { describe, it, expect } from "vitest";
import { summarizeWefactInvoices, type WefactInvoiceRow } from "./wefactBilling";

const row = (o: Partial<WefactInvoiceRow>): WefactInvoiceRow => ({
  id: "i", invoice_code: "F1", debtor_name: "X", kind: "installatie",
  status: "verzonden", amount_incl: 121, amount_paid: 0, amount_outstanding: 121, invoice_date: "2026-01-10", ...o,
});

describe("summarizeWefactInvoices", () => {
  it("telt gefactureerd/betaald/openstaand op basis van bedragen", () => {
    const s = summarizeWefactInvoices([
      row({ status: "betaald", amount_incl: 100, amount_paid: 100, amount_outstanding: 0 }),
      row({ status: "verzonden", amount_incl: 200, amount_paid: 0, amount_outstanding: 200 }),
      row({ status: "deels_betaald", amount_incl: 100, amount_paid: 40, amount_outstanding: 60 }),
    ]);
    expect(s.invoicedIncl).toBe(400);
    expect(s.paidIncl).toBe(140);          // 100 + 40 deelbetaling
    expect(s.outstandingIncl).toBe(260);   // 200 + 60
    expect(s.count).toBe(3);
  });

  it("sluit concepten uit", () => {
    const s = summarizeWefactInvoices([
      row({ status: "concept", amount_incl: 999, amount_outstanding: 999 }),
      row({ status: "betaald", amount_incl: 100, amount_paid: 100, amount_outstanding: 0 }),
    ]);
    expect(s.invoicedIncl).toBe(100);
    expect(s.count).toBe(1);
  });

  it("verwerkt een creditnota als negatieve correctie", () => {
    const s = summarizeWefactInvoices([
      row({ status: "betaald", amount_incl: 121, amount_paid: 121, amount_outstanding: 0 }),
      row({ status: "credit", amount_incl: -121, amount_paid: -121, amount_outstanding: 0 }),
    ]);
    expect(s.invoicedIncl).toBe(0); // factuur + creditnota netten weg
    expect(s.paidIncl).toBe(0);
    expect(s.overdueIncl).toBe(0);
  });

  it("telt alleen vervallen restbedragen als overdue", () => {
    const s = summarizeWefactInvoices([
      row({ status: "vervallen", amount_incl: 50, amount_paid: 0, amount_outstanding: 50 }),
      row({ status: "verzonden", amount_incl: 200, amount_paid: 0, amount_outstanding: 200 }),
    ]);
    expect(s.overdueIncl).toBe(50);
    expect(s.outstandingIncl).toBe(250);
  });
});
