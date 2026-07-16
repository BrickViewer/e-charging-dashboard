import { describe, expect, it } from "vitest";
import {
  INVOICE_NUMBER_RE,
  validateSelfBillingInvoiceData,
  type InvoiceValidationInput,
} from "./invoiceValidation";

// Compleet, geldig basisscenario (BTW-ondernemer). Tests muteren hier kopieën van.
function validInput(): InvoiceValidationInput {
  return {
    settlement: {
      invoice_number: "ECF-2026-00001",
      vat_status: "vat_liable",
      vat_rate: 0.21,
      client_payout: 100,
    },
    client: {
      company_name: "Van de berg Vastgoed",
      billing_address_street: "Dorpsstraat 1",
      billing_address_postal: "1234AB",
      billing_address_city: "Eindhoven",
      country: "Nederland",
      kvk: "87654321",
      btw_number: "NL123456789B01",
      client_number: 102,
      vat_status: "vat_liable",
      vat_status_confirmed_at: "2026-06-12T10:00:00Z",
    },
    org: {
      name: "E-Charging BV",
      kvk: "98765432",
      btw_number: "NL857756618B01",
      iban: "NL00BANK0123456789",
      address_street: "Stationsplein 1",
      address_postal: "5611AB",
      address_city: "Eindhoven",
      country: "Nederland",
    },
    paymentDetails: {
      payout_iban: "NL91ABNA0417164300",
      payout_account_holder_name: "Van de berg Vastgoed BV",
    },
  };
}

function fieldsOf(input: InvoiceValidationInput): string[] {
  return validateSelfBillingInvoiceData(input).missing.map((i) => i.field);
}

describe("validateSelfBillingInvoiceData — happy paths per BTW-status", () => {
  it("accepteert een complete BTW-ondernemer", () => {
    expect(validateSelfBillingInvoiceData(validInput())).toEqual({ ok: true, missing: [] });
  });

  it("accepteert een complete KOR-host (geen BTW-nummer nodig, wel KvK)", () => {
    const input = validInput();
    input.settlement.vat_status = "kor";
    input.settlement.vat_rate = 0;
    input.client.vat_status = "kor";
    input.client.btw_number = null;
    expect(validateSelfBillingInvoiceData(input).ok).toBe(true);
  });

  it("accepteert een complete particuliere host (geen KvK en geen BTW-nummer nodig)", () => {
    const input = validInput();
    input.settlement.vat_status = "private";
    input.settlement.vat_rate = 0;
    input.client.vat_status = "private";
    input.client.kvk = null;
    input.client.btw_number = null;
    expect(validateSelfBillingInvoiceData(input).ok).toBe(true);
  });
});

describe("validateSelfBillingInvoiceData — verplichte velden per matrixregel", () => {
  const alwaysRequired: Array<[string, (i: InvoiceValidationInput) => void]> = [
    ["company_name", (i) => { i.client.company_name = ""; }],
    ["billing_address_street", (i) => { i.client.billing_address_street = null; }],
    ["billing_address_postal", (i) => { i.client.billing_address_postal = "  "; }],
    ["billing_address_city", (i) => { i.client.billing_address_city = null; }],
    ["country", (i) => { i.client.country = null; }],
    ["client_number", (i) => { i.client.client_number = null; }],
    ["payout_iban", (i) => { i.paymentDetails = { ...i.paymentDetails, payout_iban: null }; }],
    ["payout_account_holder_name", (i) => { i.paymentDetails = { ...i.paymentDetails, payout_account_holder_name: "" }; }],
    ["org_name", (i) => { i.org = { ...i.org, name: null }; }],
    ["org_address_street", (i) => { i.org = { ...i.org, address_street: null }; }],
    ["org_address_postal", (i) => { i.org = { ...i.org, address_postal: null }; }],
    ["org_address_city", (i) => { i.org = { ...i.org, address_city: null }; }],
    ["org_country", (i) => { i.org = { ...i.org, country: null }; }],
    ["org_btw_number", (i) => { i.org = { ...i.org, btw_number: null }; }],
    ["org_iban", (i) => { i.org = { ...i.org, iban: null }; }],
    ["invoice_number", (i) => { i.settlement.invoice_number = null; }],
  ];

  for (const [field, mutate] of alwaysRequired) {
    it(`meldt ontbrekend veld: ${field}`, () => {
      const input = validInput();
      mutate(input);
      expect(fieldsOf(input)).toContain(field);
    });
  }

  it("org-KVK placeholder '12345678' wordt geweigerd", () => {
    const input = validInput();
    input.org = { ...input.org, kvk: "12345678" };
    expect(fieldsOf(input)).toContain("org_kvk");
  });

  it("org-KVK met verkeerd formaat wordt geweigerd", () => {
    const input = validInput();
    input.org = { ...input.org, kvk: "1234" };
    expect(fieldsOf(input)).toContain("org_kvk");
  });

  it("KvK verplicht voor BTW-ondernemer én KOR, niet voor particulier", () => {
    const ondernemer = validInput();
    ondernemer.client.kvk = null;
    expect(fieldsOf(ondernemer)).toContain("kvk");

    const kor = validInput();
    kor.settlement.vat_status = "kor";
    kor.settlement.vat_rate = 0;
    kor.client.kvk = null;
    kor.client.btw_number = null;
    expect(fieldsOf(kor)).toContain("kvk");

    const particulier = validInput();
    particulier.settlement.vat_status = "private";
    particulier.settlement.vat_rate = 0;
    particulier.client.kvk = null;
    particulier.client.btw_number = null;
    expect(fieldsOf(particulier)).not.toContain("kvk");
  });

  it("BTW-nummer alleen verplicht voor BTW-ondernemer", () => {
    const ondernemer = validInput();
    ondernemer.client.btw_number = null;
    expect(fieldsOf(ondernemer)).toContain("btw_number");

    const kor = validInput();
    kor.settlement.vat_status = "kor";
    kor.settlement.vat_rate = 0;
    kor.client.btw_number = null;
    expect(fieldsOf(kor)).not.toContain("btw_number");
  });
});

describe("validateSelfBillingInvoiceData — BTW-status en consistentie", () => {
  it("meldt ontbrekende BTW-status", () => {
    const input = validInput();
    input.settlement.vat_status = null;
    input.client.vat_status = null;
    expect(fieldsOf(input)).toContain("vat_status");
  });

  it("meldt onbevestigde BTW-status (geen snapshot, geen bevestiging)", () => {
    const input = validInput();
    input.settlement.vat_status = null; // geen snapshot (nog niet goedgekeurd)
    input.client.vat_status_confirmed_at = null;
    expect(fieldsOf(input)).toContain("vat_status_confirmed_at");
  });

  it("settlement-snapshot telt als bevestigd (uitgereikte factuur blijft geldig)", () => {
    const input = validInput();
    input.client.vat_status_confirmed_at = null; // bevestiging later ingetrokken/gereset
    // settlement.vat_status is gezet (snapshot bij goedkeuring) → geen issue
    expect(fieldsOf(input)).not.toContain("vat_status_confirmed_at");
  });

  it("BTW-ondernemer met vat_rate 0 op de afrekening is inconsistent", () => {
    const input = validInput();
    input.settlement.vat_rate = 0;
    expect(fieldsOf(input)).toContain("vat_rate");
  });

  it("particulier met vat_rate > 0 op de afrekening is inconsistent", () => {
    const input = validInput();
    input.settlement.vat_status = "private";
    input.client.kvk = null;
    input.client.btw_number = null;
    // vat_rate blijft 0.21 → fout
    expect(fieldsOf(input)).toContain("vat_rate");
  });
});

describe("validateSelfBillingInvoiceData — bedrag-guards (handboek §9)", () => {
  it("weigert een negatieve afrekening (incasso loopt via een aparte factuur)", () => {
    const input = validInput();
    input.settlement.client_payout = -12.5;
    expect(fieldsOf(input)).toContain("client_payout");
  });

  it("weigert een afrekening van € 0,00 — nul is geen prijs", () => {
    const input = validInput();
    input.settlement.client_payout = 0;
    expect(fieldsOf(input)).toContain("client_payout");
  });

  it("accepteert elk positief bedrag, ook centen", () => {
    const input = validInput();
    input.settlement.client_payout = 0.01;
    expect(fieldsOf(input)).not.toContain("client_payout");
  });
});

describe("INVOICE_NUMBER_RE", () => {
  it("accepteert de klantnummer-reeksen S-/B- en legacy-nummers", () => {
    expect(INVOICE_NUMBER_RE.test("S-2026-06-102")).toBe(true);   // self-billing factuur
    expect(INVOICE_NUMBER_RE.test("B-2026-06-903")).toBe(true);   // betaalspecificatie
    expect(INVOICE_NUMBER_RE.test("S-2026-06-9")).toBe(true);     // kort klantnummer
    expect(INVOICE_NUMBER_RE.test("ECF-2026-00001")).toBe(true);  // legacy
    expect(INVOICE_NUMBER_RE.test("EC-202605-102")).toBe(true);   // legacy
    expect(INVOICE_NUMBER_RE.test("EC-202604-102")).toBe(true);
  });

  it("weigert ongeldige formaten", () => {
    expect(INVOICE_NUMBER_RE.test("EC-2026-1")).toBe(false);
    expect(INVOICE_NUMBER_RE.test("ECF-26-00001")).toBe(false);
    expect(INVOICE_NUMBER_RE.test("S-2026-6-102")).toBe(false);   // maand niet 2-cijferig
    expect(INVOICE_NUMBER_RE.test("A-2026-06-1")).toBe(false);    // geen A-reeks (activatie is extern)
    expect(INVOICE_NUMBER_RE.test("")).toBe(false);
    expect(INVOICE_NUMBER_RE.test("FACTUUR-1")).toBe(false);
  });

  it("controleert prefix ↔ status-consistentie", () => {
    // S- hoort bij vat_liable; B- bij kor/private.
    const base = {
      settlement: { invoice_number: "S-2026-06-102", vat_status: "kor", vat_rate: 0, client_payout: 100 },
      client: {
        company_name: "Test", billing_address_street: "Straat 1", billing_address_postal: "1000AA",
        billing_address_city: "Amsterdam", country: "Nederland", client_number: 102,
        kvk: "90000001", vat_status: "kor", vat_status_confirmed_at: "2026-01-01",
      },
      org: {
        name: "E-Charging", kvk: "30241843", btw_number: "NL8213.92.402.B01", iban: "NL33RABO0143928449",
        address_street: "Dwarsweg 8", address_postal: "5301KT", address_city: "Zaltbommel", country: "Nederland",
      },
      paymentDetails: { payout_iban: "NL91ABNA0417164300", payout_account_holder_name: "Test" },
    };
    const r = validateSelfBillingInvoiceData(base);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.field)).toContain("invoice_number");
  });
});
