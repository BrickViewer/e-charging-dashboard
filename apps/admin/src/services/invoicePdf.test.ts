import { describe, expect, it } from "vitest";
import {
  buildSelfBillingInvoicePdf, InvoiceValidationError, isBetaalspecificatie,
  SELF_BILLING_HEADER, BETAALSPEC_TITLE, NO_VAT_SENTENCE, NO_VAT_REASON_KOR,
  NO_VAT_REASON_PRIVATE, ACCEPTANCE_SENTENCE, paymentSentence,
} from "./invoicePdf";
import type {
  SelfBillingClient,
  SelfBillingOrg,
  SelfBillingPaymentDetails,
  SelfBillingSettlement,
} from "./invoicePdf";

// PDF-smoke in jsdom: het logo-rasteren faalt daar stilletjes (geen echte canvas)
// en valt terug op de tekstvariant; sessionLines worden meegegeven zodat er geen
// supabase-call nodig is. Geen productiedata.

function fixtures(vatStatus: "vat_liable" | "kor" | "private") {
  const settlement: SelfBillingSettlement = {
    year: 2026,
    month: 5,
    total_kwh: 1614.707,
    total_sessions: 42,
    client_payout: 936.53,
    vat_rate: vatStatus === "vat_liable" ? 0.21 : 0,
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    invoice_number: "ECF-2026-00001",
    vat_status: vatStatus,
  };
  const client: SelfBillingClient = {
    company_name: "Van de berg Vastgoed",
    contact_name: "J. van de Berg",
    client_number: 102,
    kvk: vatStatus === "private" ? null : "87654321",
    btw_number: vatStatus === "vat_liable" ? "NL123456789B01" : null,
    billing_address_street: "Dorpsstraat 1",
    billing_address_postal: "1234AB",
    billing_address_city: "Eindhoven",
    country: "Nederland",
    vat_status: vatStatus,
    vat_status_confirmed_at: "2026-06-12T10:00:00Z",
  };
  const org: SelfBillingOrg = {
    name: "E-Charging BV",
    kvk: "98765432",
    btw_number: "NL857756618B01",
    iban: "NL00BANK0123456789",
    address_street: "Stationsplein 1",
    address_postal: "5611AB",
    address_city: "Eindhoven",
    country: "Nederland",
    email: "info@e-charging.nl",
  };
  const paymentDetails: SelfBillingPaymentDetails = {
    payout_iban: "NL91ABNA0417164300",
    payout_account_holder_name: "Van de berg Vastgoed BV",
    payout_bic: "ABNANL2A",
  };
  return { settlement, client, org, paymentDetails };
}

const sampleLines = [
  {
    started_at: "2026-05-03T10:00:00Z",
    charge_point_name: "Laadpunt 1",
    location_name: "Parkeerterrein",
    duration_minutes: 95,
    kwh_delivered: 21.5,
    vergoeding: 12.47,
  },
];

describe("buildSelfBillingInvoicePdf", () => {
  for (const status of ["vat_liable", "kor", "private"] as const) {
    it(`rendert een geldige factuur voor BTW-status '${status}'`, async () => {
      const { settlement, client, org, paymentDetails } = fixtures(status);
      const doc = await buildSelfBillingInvoicePdf(settlement, client, org, paymentDetails, sampleLines);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      const buf = doc.output("arraybuffer");
      expect(buf.byteLength).toBeGreaterThan(1000);
    });
  }

  it("weigert te renderen bij ontbrekende verplichte gegevens (vóór enige jspdf-werk)", async () => {
    const { settlement, client, org, paymentDetails } = fixtures("vat_liable");
    client.btw_number = null;          // BTW-ondernemer zonder BTW-nummer
    settlement.invoice_number = null;  // geen toegekend nummer

    const err = await buildSelfBillingInvoicePdf(settlement, client, org, paymentDetails, sampleLines)
      .then(() => null)
      .catch((e) => e as InvoiceValidationError);

    expect(err).toBeInstanceOf(InvoiceValidationError);
    const fields = (err as InvoiceValidationError).issues.map((i) => i.field);
    expect(fields).toContain("btw_number");
    expect(fields).toContain("invoice_number");
  });

  it("weigert bij placeholder-KVK van de organisatie", async () => {
    const { settlement, client, org, paymentDetails } = fixtures("vat_liable");
    org.kvk = "12345678";

    const err = await buildSelfBillingInvoicePdf(settlement, client, org, paymentDetails, sampleLines)
      .then(() => null)
      .catch((e) => e as InvoiceValidationError);

    expect(err).toBeInstanceOf(InvoiceValidationError);
    expect((err as InvoiceValidationError).issues.map((i) => i.field)).toContain("org_kvk");
  });
});

// De letterlijke handboek-zinnen (p. 2–3) — de renderer gebruikt uitsluitend deze constanten,
// dus het pinnen van de constante pint de tekst op het document.
describe("verplichte documentteksten (commissionairs-handboek)", () => {
  it("kop self-billing factuur", () => {
    expect(SELF_BILLING_HEADER).toBe("FACTUUR UITGEREIKT DOOR AFNEMER");
  });
  it("kop betaalspecificatie", () => {
    expect(BETAALSPEC_TITLE).toBe("BETAALSPECIFICATIE");
  });
  it("0%-vermelding + beide redenen", () => {
    expect(NO_VAT_SENTENCE).toBe("Geen omzetbelasting in rekening gebracht.");
    expect(NO_VAT_REASON_KOR).toBe("Kleineondernemersregeling van toepassing.");
    expect(NO_VAT_REASON_PRIVATE).toBe("Leverancier is geen ondernemer voor de omzetbelasting.");
  });
  it("aanvaardingsclausule", () => {
    expect(ACCEPTANCE_SENTENCE).toBe("Geen bezwaar binnen 14 dagen geldt als aanvaarding.");
  });
  it("betaalzin met IBAN", () => {
    expect(paymentSentence("NL00 BANK 0000 0000 00")).toBe(
      "Wordt binnen 14 dagen overgemaakt op NL00 BANK 0000 0000 00",
    );
  });
});

describe("buildSelfBillingInvoicePdf — €0,00-guard (handboek §9: nul is geen prijs)", () => {
  it("weigert een afrekening van € 0,00", async () => {
    const { settlement, client, org, paymentDetails } = fixtures("vat_liable");
    settlement.client_payout = 0;
    const err = await buildSelfBillingInvoicePdf(settlement, client, org, paymentDetails, sampleLines)
      .then(() => null)
      .catch((e) => e as InvoiceValidationError);
    expect(err).toBeInstanceOf(InvoiceValidationError);
    expect((err as InvoiceValidationError).issues.map((i) => i.field)).toContain("client_payout");
  });
});

describe("isBetaalspecificatie", () => {
  it("particulier én KOR → betaalspecificatie (E-Charging → klant, geen self-billing btw-factuur)", () => {
    expect(isBetaalspecificatie("private")).toBe(true);
    expect(isBetaalspecificatie("kor")).toBe(true);
  });
  it("BTW-ondernemer/onbekend → self-billing factuur", () => {
    expect(isBetaalspecificatie("vat_liable")).toBe(false);
    expect(isBetaalspecificatie(null)).toBe(false);
    expect(isBetaalspecificatie(undefined)).toBe(false);
  });
});
