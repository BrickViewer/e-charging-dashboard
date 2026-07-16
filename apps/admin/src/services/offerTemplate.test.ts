// Offerte-tekstversies (commissionairs-handboek, 2026-07-16). Verstuurde offertes dragen
// offer_details.text_version = 1 (backfill-migratie 20260716150000) en moeten bij her-renderen
// (accept-pagina, getekende PDF) EXACT de oorspronkelijke teksten opleveren; nieuwe offertes
// (veld afwezig) krijgen de fee-vrije handboek-teksten (afname-model). Deze tests pinnen die
// bevriezing — de v1-verwachtingen hieronder NOOIT aanpassen aan nieuwe copy.
import { describe, expect, it } from "vitest";
import { buildOfferPages, type OfferTemplateData } from "./offerTemplate";

function data(textVersion?: number, o?: Partial<OfferTemplateData>): OfferTemplateData {
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
    ...o,
  };
}

// Particulier = geen bedrijf (isPrivate afgeleid), meestal één laadpaal.
const privData = (textVersion?: number, o?: Partial<OfferTemplateData>) =>
  data(textVersion, { company: "", numChargePoints: 1, ...o });

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
    // Zakelijk behoudt de zakelijke kop + AI-optimalisatiepunt (particulier-variant lekt niet).
    expect(html).toContain("inkomstenbron");
    expect(html).toContain("Doorlopende optimalisatie van rendement");
  });
});

describe("particuliere offerte (v2) — laadpas-verhaal, geld-eerst", () => {
  it("rendert kop, het laadpas-punt en de korte prijs-alinea met concrete afnameprijs", () => {
    const html = htmlOf(privData());
    // Kop + laadpas-hook
    expect(html).toContain("vanzelf");
    expect(html).toContain("voor betaald worden");
    expect(html).toContain("laadpas van uw werkgever of leasemaatschappij");
    expect(html).toContain("levert u geld op");
    // Punt 1 = het laadpas-punt (geld-eerst-bookending); AI-rendement en jargon zijn weg
    expect(html).toContain("Laden via de zaak? Automatisch geregeld");
    expect(html).toContain("Extra vergoeding voor groene stroom");
    expect(html).not.toContain("Nooit meer declareren");
    expect(html).not.toContain("Doorlopende optimalisatie van rendement");
    expect(html).not.toContain("transactieverwerking");
    expect(html).not.toContain("up en running");
    expect(html).toContain("betaalspecificatie");
    // Prijs-alinea: concrete afnameprijs (vast tarief 0,50 − 0,10), geen "op eigen naam"
    expect(html).toContain("vaste afnameprijs van € 0,40 per kWh");
    expect(html).not.toContain("op eigen naam");
    expect(html).toContain("U betaalt ons nooit iets");
    // Handboek-taalregels blijven gelden
    expect(html).not.toMatch(/service-?fee|\bfee\b/i);
    expect(html).not.toContain("inhouding");
    expect(html).not.toContain("opbrengst uit");
  });

  it("dynamisch laadtarief: prijsformule-fallback i.p.v. concrete afnameprijs", () => {
    const html = htmlOf(privData(undefined, { chargeTariffPerKwh: null, offerDetails: { chargeTariffDynamic: true } }));
    expect(html).toContain("het geldende laadtarief min € 0,10 per kWh");
    expect(html).not.toContain("vaste afnameprijs van");
  });

  it("alleen-beheer particulier: beheer-intro opent met het geldvoordeel en sluit de declaratie-lus", () => {
    const html = htmlOf(privData(undefined, { withInstallation: false }));
    expect(html).toContain("volledig in beheer");
    expect(html).toContain("levert elke kWh die u thuis laadt u geld op");
    expect(html).toContain("Declareren bij uw werkgever is nooit meer nodig");
    expect(html).not.toContain("ontzorgd wordt volgens het E-Charging concept"); // zakelijke intro lekt niet
  });

  it("v1 + particulier: verstuurde offerte rendert de OUDE teksten, geen laadpas-variant", () => {
    const html = htmlOf(privData(1));
    expect(html).toContain("service-fee van");
    expect(html).toContain("Doorlopende optimalisatie van rendement");
    expect(html).not.toContain("Laden via de zaak");
    expect(html).not.toContain("afnameprijs");
  });
});
