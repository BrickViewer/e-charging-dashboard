import { describe, it, expect } from "vitest";
import { settlementNetToTransfer, settlementNetExcl } from "./calculations";
import { validateSelfBillingInvoiceData, type InvoiceValidationInput } from "./invoiceValidation";

// ============================================================================
// Volledige combinatie-check van het vergoedingsfactuur/betaalspecificatie-systeem:
// (1) netto-bedragen kloppen én zijn consistent tussen factuur (incl) en portaal
//     (excl-equivalent) voor élke BTW-status, en (2) de validatie blokkeert de juiste
//     combinaties (negatieve maand, BTW-mismatch) en laat de geldige door.
// ============================================================================

describe("settlementNet: factuur (incl) ↔ portaal (excl) consistent per BTW-status", () => {
  // vat_liable: portaal-netto blijft exact client_payout − activation_cost (ongewijzigd gedrag).
  it("vat_liable partieel: netExcl == payout − activatie; incl = excl × 1,21", () => {
    const inp = { clientPayout: 100, activationCost: 60, vatRate: 0.21 };
    expect(settlementNetExcl(inp)).toBeCloseTo(40, 6);           // 100 − 60
    expect(settlementNetToTransfer(inp)).toBeCloseTo(48.4, 6);   // 121 − 72,60
    expect(settlementNetExcl(inp) * 1.21).toBeCloseTo(settlementNetToTransfer(inp), 6);
  });

  // particulier/KOR (0% vergoeding, 21% activatie): de OUDE formule (payout − activation)
  // overschatte de netto; de nieuwe klopt (volledig verrekend → 0, niet 21).
  it("particulier volledig verrekend: netExcl == 0 (niet 21)", () => {
    const inp = { clientPayout: 121, activationCost: 100, vatRate: 0 }; // 100 × 1,21 = 121 = vergoeding incl
    expect(settlementNetToTransfer(inp)).toBeCloseTo(0, 6);
    expect(settlementNetExcl(inp)).toBeCloseTo(0, 6);
    expect(121 - 100).toBe(21); // de oude, foute weergave
  });

  it("particulier deels: netExcl verrekent de activatie-BTW mee", () => {
    const inp = { clientPayout: 121, activationCost: 50, vatRate: 0 };
    expect(settlementNetToTransfer(inp)).toBeCloseTo(60.5, 6);   // 121 − 60,50
    expect(settlementNetExcl(inp)).toBeCloseTo(60.5, 6);         // rate 0 → gelijk
    expect(settlementNetExcl(inp)).not.toBeCloseTo(71, 2);       // ≠ oude 121 − 50
  });

  it("KOR gedraagt zich als particulier (0% vergoeding, 21% activatie)", () => {
    const inp = { clientPayout: 121, activationCost: 100, vatRate: 0 };
    expect(settlementNetExcl(inp)).toBeCloseTo(0, 6);
  });

  it("zonder activatie: netExcl == payout, incl == payout × (1+rate)", () => {
    expect(settlementNetExcl({ clientPayout: 100, activationCost: 0, vatRate: 0.21 })).toBe(100);
    expect(settlementNetToTransfer({ clientPayout: 100, activationCost: 0, vatRate: 0.21 })).toBeCloseTo(121, 6);
    expect(settlementNetExcl({ clientPayout: 100, activationCost: 0, vatRate: 0 })).toBe(100);
    expect(settlementNetToTransfer({ clientPayout: 100, activationCost: 0, vatRate: 0 })).toBeCloseTo(100, 6);
  });

  it("netto over te boeken is nooit negatief (klemt op 0)", () => {
    for (const vatRate of [0, 0.21]) {
      for (let payout = 0; payout <= 200; payout += 6.65) {
        for (let act = 0; act <= 200; act += 12.5) {
          expect(settlementNetToTransfer({ clientPayout: payout, activationCost: act, vatRate })).toBeGreaterThanOrEqual(0);
          expect(settlementNetExcl({ clientPayout: payout, activationCost: act, vatRate })).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("validateSelfBillingInvoiceData: juiste combinaties geblokkeerd/toegestaan", () => {
  const base = (over: Partial<InvoiceValidationInput["settlement"]> = {}, clientOver: Partial<InvoiceValidationInput["client"]> = {}): InvoiceValidationInput => ({
    settlement: { invoice_number: "ECF-2026-00001", vat_status: "vat_liable", vat_rate: 0.21, client_payout: 100, ...over },
    client: {
      company_name: "Test BV", billing_address_street: "Straat 1", billing_address_postal: "1000AA",
      billing_address_city: "Amsterdam", country: "Nederland", client_number: 1,
      kvk: "90000001", btw_number: "NL900000001B01", vat_status: "vat_liable", vat_status_confirmed_at: "2026-01-01", ...clientOver,
    },
    org: {
      name: "E-Charging", kvk: "30241843", btw_number: "NL8213.92.402.B01", iban: "NL33RABO0143928449",
      address_street: "Dwarsweg 8", address_postal: "5301KT", address_city: "Zaltbommel", country: "Nederland",
    },
    paymentDetails: { payout_iban: "NL91ABNA0417164300", payout_account_holder_name: "Test BV" },
  });

  const fields = (r: ReturnType<typeof validateSelfBillingInvoiceData>) => r.missing.map((m) => m.field);

  it("vat_liable, positief, compleet → geldig", () => {
    expect(validateSelfBillingInvoiceData(base()).ok).toBe(true);
  });

  it("negatieve payout → geblokkeerd (client_payout)", () => {
    const r = validateSelfBillingInvoiceData(base({ client_payout: -50 }));
    expect(r.ok).toBe(false);
    expect(fields(r)).toContain("client_payout");
  });

  it("particulier, rate 0 → geldig (geen kvk/btw vereist)", () => {
    const r = validateSelfBillingInvoiceData(base(
      { vat_status: "private", vat_rate: 0 },
      { vat_status: "private", kvk: null, btw_number: null },
    ));
    expect(r.ok).toBe(true);
  });

  it("KOR, rate 0, met kvk → geldig", () => {
    const r = validateSelfBillingInvoiceData(base(
      { vat_status: "kor", vat_rate: 0 },
      { vat_status: "kor", btw_number: null },
    ));
    expect(r.ok).toBe(true);
  });

  it("particulier met rate 0.21 → geblokkeerd (BTW-mismatch)", () => {
    const r = validateSelfBillingInvoiceData(base(
      { vat_status: "private", vat_rate: 0.21 },
      { vat_status: "private" },
    ));
    expect(r.ok).toBe(false);
    expect(fields(r)).toContain("vat_rate");
  });

  it("vat_liable met rate 0 → geblokkeerd (tarief ontbreekt)", () => {
    const r = validateSelfBillingInvoiceData(base({ vat_rate: 0 }));
    expect(r.ok).toBe(false);
    expect(fields(r)).toContain("vat_rate");
  });

  it("fake TEST-factuurnummer → geblokkeerd (format)", () => {
    const r = validateSelfBillingInvoiceData(base({ invoice_number: "TEST-ACTIVATIE-APR" }));
    expect(r.ok).toBe(false);
    expect(fields(r)).toContain("invoice_number");
  });
});
