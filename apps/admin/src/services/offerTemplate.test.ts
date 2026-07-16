// Offerte-tekstversies (commissionairs-handboek, 2026-07-16). Verstuurde offertes dragen
// offer_details.text_version = 1 (backfill-migratie 20260716150000) en moeten bij her-renderen
// (accept-pagina, getekende PDF) EXACT de oorspronkelijke teksten opleveren; nieuwe offertes
// (veld afwezig) krijgen de fee-vrije handboek-teksten (afname-model). Deze tests pinnen die
// bevriezing — de v1-verwachtingen hieronder NOOIT aanpassen aan nieuwe copy.
import { describe, expect, it } from "vitest";
import { buildOfferPages, type OfferTemplateData } from "./offerTemplate";

function data(textVersion?: number): OfferTemplateData {
  return {
    quoteNumber: "OFF-2026-001",
    company: "Voorbeeldbedrijf B.V.",
    contactName: "J. Voorbeeld",
    numChargePoints: 2,
    totalInvestment: 5000,
    withManagement: true,
    withInstallation: true,
    chargeTariffPerKwh: 0.5,
    idleFeePerMinute: 0.05,
    startFeePerSession: 0,
    offerDetails: textVersion != null ? { text_version: textVersion } : {},
    offerTemplate: null,
  };
}

const htmlOf = (d: OfferTemplateData) =>
  buildOfferPages(d, { logoUrl: null, coverUrl: null }).map((p) => p.innerHTML).join("\n");

describe("offerte tekst-versies", () => {
  it("v1 (verstuurde offerte) rendert exact de oude fee-teksten", () => {
    const html = htmlOf(data(1));
    expect(html).toContain("service-fee van");
    expect(html).toContain("als enige inhouding");
    expect(html).toContain("wij betalen uw opbrengst uit");
    expect(html).toContain("door E-Charging opgemaakte self-billing factuur.");
    expect(html).not.toContain("afnameprijs");
  });

  it("v2 (nieuw) is fee-vrij en gebruikt het afname-model", () => {
    const html = htmlOf(data());
    // \bfee\b: "feestdagen" (toeslag-regel) bevat 'fee' als substring maar is geen fee-taal.
    expect(html).not.toMatch(/service-?fee|\bfee\b/i);
    expect(html).not.toContain("inhouding");
    expect(html).not.toContain("opbrengst uit");
    expect(html).toContain("afnameprijs");
    expect(html).toContain("€ 0,40"); // concrete afnameprijs: laadtarief 0,50 − marge 0,10
    expect(html).toContain("u hoeft ons nooit iets te betalen");
  });
});
