// Offerte-tekstversies (commissionairs-handboek, 2026-07-16). Verstuurde offertes dragen
// offer_details.text_version = 1 (backfill-migratie 20260716150000) en moeten bij her-renderen
// (accept-pagina, getekende PDF) EXACT de oorspronkelijke teksten opleveren; nieuwe offertes
// (veld afwezig) krijgen de fee-vrije handboek-teksten (afname-model). Deze tests pinnen die
// bevriezing — de v1-verwachtingen hieronder NOOIT aanpassen aan nieuwe copy.
import { describe, expect, it } from "vitest";
import { buildOfferPages, offerSections, offerPhrases, __phraseBlocksForTest, OFFER_SECTIONS, type OfferTemplateData } from "./offerTemplate";

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
    expect(html).toContain("eerste dag van de kalendermaand volgend op de opleverdatum"); // v1-ingangsdatum bevroren
    expect(html).toContain("Activatiekosten, ingangsdatum, contactduur en opzegging beheermodule"); // v1-kop bevroren, incl. originele tikfout "contactduur"
    expect(html).toContain("De Algemene voorwaarden E-Charging BV."); // v1-AV-regel bevroren (zonder Regeling gegevensuitwisseling)
    expect(html).toContain("ons voorstel"); // v1-intro bevroren
    expect(html).toContain("Onze voorwaarden bij deze aanbieding"); // v1-kop bevroren
    expect(html).toContain("Deze aanbieding is 30 dagen geldig na datum van aanbieding.");
    expect(html).not.toContain("Regeling gegevensuitwisseling");
    // v1-footer bevroren: oude registratiegegevens van vóór de eigen B.V. (incl. telefoonregel)
    expect(html).toContain("KvK: 30241843");
    expect(html).toContain("Telefoon: 0418 - 684272");
    expect(html).not.toContain("KvK: 42107233");
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
    // Zakelijk behoudt de zakelijke kop + AI-optimalisatiepunt (particulier-variant lekt niet)
    // én de tarief-instellingen-lijst (die bij particulier bewust ontbreekt).
    expect(html).toContain("inkomstenbron");
    expect(html).toContain("Doorlopende optimalisatie van rendement");
    expect(html).toContain("afgesproken instellingen");
    expect(html).toContain("Blokkeertarief");
    expect(html).toContain("gaat in op de dag van ondertekening"); // v2-ingangsdatum
    // v2-kop: tikfout gefixt; "Vergoeding" alleen in de kop bij de particuliere vergoedingsregel
    expect(html).toContain("Activatiekosten, ingangsdatum, contractduur en opzegging beheermodule");
    expect(html).not.toContain("contactduur");
    expect(html).not.toContain("Vergoeding, activatiekosten");
    // v2 laat 0%-betaaltermijnen weg (FALLBACK_TEMPLATE = 50/0/50; echte zakelijke offertes
    // volgen het org-sjabloon, zie de override-test bij particulier)
    expect(html).toContain("Betalingen levering en installatie: 50% bij opdracht en 50% na werkzaamheden.");
    // Terminologie v2: "offerte" (geen "voorstel" of "aanbieding" meer)
    expect(html).toContain("Hierbij ontvangt u onze offerte voor");
    expect(html).not.toContain("ons voorstel");
    expect(html).toContain("Onze voorwaarden bij deze offerte");
    expect(html).toContain("Deze offerte is 30 dagen geldig na de offertedatum.");
    expect(html).toContain("Niet in deze offerte opgenomen");
    expect(html).not.toContain("aanbieding");
    // Voorwaarden verwijzen naar AV én de Regeling gegevensuitwisseling (vervangt de VWO)
    expect(html).toContain("De Algemene voorwaarden en de Regeling gegevensuitwisseling van E-Charging B.V.");
    expect(html).not.toContain("Verwerkersovereenkomst");
    // v2-footer: registratiegegevens van de eigen B.V. (sinds 2026-07-16), zonder telefoonregel
    expect(html).toContain("KvK: 42107233");
    expect(html).toContain("BTW: NL869765784B01");
    expect(html).toContain("IBAN: NL09 RABO 0176 3641 29");
    expect(html).not.toContain("KvK: 30241843");
    expect(html).not.toContain("Telefoon:");
  });
});

describe("particuliere offerte (v2) — laadpas-verhaal, geld-eerst", () => {
  it("rendert de vergoeding + het huishoud-voorbeeld in de intro en 5 punten", () => {
    const html = htmlOf(privData());
    // Kop: ook particulier "inkomstenbron" (enkelvoud)
    expect(html).toContain("inkomstenbron");
    expect(html).not.toContain("voor betaald worden");
    expect(html).toContain("laadpas van uw werkgever of leasemaatschappij");
    // Intro: netto-vergoeding + gestapeld rekenvoorbeeld (echte berekening, gebruikerskeuze)
    expect(html).toContain("Voor de vergoeding van uw stroom ontvangt u elke maand");
    expect(html).toContain("€ 0,40");
    // Mark-casus rekent € 0,05 ONDER de eigen vergoeding, afgerond op het dichtstbijzijnde
    // 5-cent-veelvoud (hier 0,40 → 0,35); jaarbedragen berekend: 4.000×0,35=1.400, stroom 1.000,
    // over 400, ERE 400, totaal 800 (geen disclaimer).
    expect(html).toContain("Bijvoorbeeld: Mark rijdt ongeveer 25.000 kilometer per jaar en laadt het grootste deel daarvan thuis met zijn zakelijke laadpas: zo'n 4.000 kWh per jaar");
    expect(html).not.toContain("laadpas van zijn werkgever"); // casus zegt "zijn zakelijke laadpas" (punt 1 houdt "uw werkgever of leasemaatschappij")
    expect(html).toContain('<span style="font-style:italic">Bijvoorbeeld:'); // hele casus cursief
    expect(html).toContain("Zijn vergoeding is € 0,35 per geladen kWh");
    expect(html).toContain("Aan vergoeding ontvangt hij dus € 1.400 per jaar");
    expect(html).toContain("bij een stroomprijs van € 0,25 per kWh");
    expect(html).toContain("Daarmee houdt Mark € 400 per jaar over");
    expect(html).toContain("aangemeld voor de ERE-regeling");
    expect(html).toContain("Die subsidie levert hem nog eens zo'n € 400 per jaar op");
    expect(html).toContain("Zo verdient Mark met zijn laadpaal al snel € 800 per jaar");
    expect(html).not.toContain("Hieraan kunnen geen rechten"); // bewust geen disclaimer (gebruikerskeuze)
    expect(html).toContain("Uw voordelen op een rij:");
    expect(html).not.toContain("Ons beheer houdt onder andere in");
    // 5 punten: reparatie-punt geheel verwijderd (gebruikerskeuze); ERE = 05
    expect(html).toContain("Laden via de zaak? Automatisch geregeld");
    expect(html).toContain("Extra vergoeding voor groene stroom");
    expect(html).toContain("koppelen u aan onze partner"); // ERE-hulp expliciet
    expect(html).not.toContain("Reparatie nodig");
    expect(html).not.toContain("Nooit meer declareren");
    expect(html).not.toContain("Doorlopende optimalisatie van rendement");
    expect(html).not.toContain("transactieverwerking");
    expect(html).not.toContain("up en running");
    expect(html).not.toContain("Altijd en overal");
    expect(html).toContain("betaalspecificatie");
    // Prijsregels vervallen; de instelling+netto leven als ☞-regel in de voorwaarden.
    // Asterisken bewust verwijderd (gebruikerskeuze): niet achter het bedrag, niet vóór de regel.
    expect(html).toContain("€ 0,40</span> per geladen kWh");
    expect(html).not.toContain("€ 0,40</span>*");
    expect(html).toContain("De laadpaal wordt ingesteld op € 0,50 per kWh (excl. btw). Hiervan ontvangt u € 0,40 per kWh netto op uw rekening.");
    expect(html).not.toContain("* De laadpaal");
    // Sectiekop noemt de vergoeding voorop (en de contractduur-tikfout is gefixt)
    expect(html).toContain("Vergoeding, activatiekosten, ingangsdatum, contractduur en opzegging beheermodule");
    expect(html).not.toContain("contactduur");
    // Betaaltermijnen particulier: standaard 50/0/50, de 0%-termijn wordt weggelaten
    expect(html).toContain("Betalingen levering en installatie: 50% bij opdracht en 50% na werkzaamheden.");
    expect(html).not.toContain("% bij start werkzaamheden");
    expect(html).toContain("gaat in op de dag van ondertekening"); // v2-ingangsdatum (alle klanttypen)
    // Install+beheer behoudt de losse voorwaarden-structuur en de offerte-slotblokken
    expect(html).toContain("Prijsstelling");
    expect(html).toContain("Storingen");
    expect(html).not.toContain("Prijsstelling en storingen");
    expect(html).toContain("Onze aanpak");
    expect(html).toContain("Heeft u nog vragen");
    const kopIdx = html.indexOf("werkt</span>");
    expect(kopIdx).toBeGreaterThan(-1);
    const ereIdx = html.indexOf("rechtstreeks aan");
    expect(ereIdx).toBeGreaterThan(-1);
    expect(ereIdx).toBeLessThan(kopIdx);
    expect(html).not.toContain("omkijken naar");
    expect(html).not.toContain("laadbeurt na laadbeurt");
    expect(html).toContain("telt elke kWh automatisch mee"); // gasten-laadpas (punt 1)
    expect(html).not.toContain("Declareren is nooit meer nodig"); // verwijderd (gebruikerskeuze)
    expect(html).toContain("betaalspecificaties vindt u er overzichtelijk terug"); // dashboard (punt 3)
    // Particulier = enkel stroomvergoeding: nooit een instellingen-lijst of blokkeer-/starttarief
    expect(html).not.toContain("afgesproken instellingen");
    expect(html).not.toContain("Blokkeertarief");
    expect(html).not.toContain("Starttarief");
    // Handboek-taalregels blijven gelden
    expect(html).not.toMatch(/service-?fee|\bfee\b/i);
    expect(html).not.toContain("inhouding");
    expect(html).not.toContain("opbrengst uit");
    expect(html).not.toContain("afnameprijs");
    expect(html).not.toContain("op eigen naam");
  });

  it("dynamisch laadtarief: formule-vergoeding in de intro; Mark-casus valt terug op vaste € 0,35", () => {
    const html = htmlOf(privData(undefined, { chargeTariffPerKwh: null, offerDetails: { chargeTariffDynamic: true } }));
    expect(html).toContain("het laadtarief min € 0,10 per geladen kWh netto op uw rekening");
    // Zonder vast tarief is er geen "vergoeding − 0,05" → vaste fallback-reeks (5-tal, consistent)
    expect(html).toContain("Bijvoorbeeld: Mark rijdt");
    expect(html).toContain("Zijn vergoeding is € 0,35 per geladen kWh");
    expect(html).toContain("€ 1.400 per jaar");
    expect(html).not.toContain("wordt ingesteld op"); // geen tarief -> geen voorwaarden-regel
    expect(html).not.toContain("Vergoeding, activatiekosten"); // kop zonder "Vergoeding" als de regel ontbreekt
    expect(html).toContain("Activatiekosten, ingangsdatum, contractduur en opzegging beheermodule");
  });

  it("betaaltermijn-overrides verslaan de particuliere 50/0/50-default (volledige 3-delige zin)", () => {
    const html = htmlOf(privData(undefined, { offerDetails: { betaalBijOpdrachtPct: 50, betaalBijStartPct: 40, betaalNaWerkPct: 10 } }));
    expect(html).toContain("Betalingen levering en installatie: 50% bij opdracht, 40% bij start werkzaamheden en 10% na werkzaamheden.");
  });

  it("niet-rond tarief (0,48): Mark rondt naar het dichtstbijzijnde 5-tal (0,38 − 0,05 = 0,33 → € 0,35)", () => {
    const html = htmlOf(privData(undefined, { chargeTariffPerKwh: 0.48 })); // vergoeding 0,38
    expect(html).toContain("€ 0,38"); // de eigen vergoeding in de intro
    expect(html).toContain("Zijn vergoeding is € 0,35 per geladen kWh");
    expect(html).toContain("Aan vergoeding ontvangt hij dus € 1.400 per jaar");
  });

  it("laag laadtarief: eigen vergoeding blijft; Mark-casus vervalt (zou richting verlies rekenen)", () => {
    const html = htmlOf(privData(undefined, { chargeTariffPerKwh: 0.3 })); // netto 0,20 → Mark 0,15 < 0,30
    expect(html).toContain("€ 0,20"); // de eigen vergoeding
    expect(html).not.toContain("Bijvoorbeeld: Mark");
  });

  it("alleen-beheer particulier = CONTRACTBLAD: gegevens + volledige beheermodule op één blad", () => {
    const html = htmlOf(privData(undefined, { withInstallation: false }));
    // Gegevens blijven (bindend contract): naam-/adresblok + referentieblok
    expect(html).toContain("J. Voorbeeld");
    expect(html).toContain("Onze referentie");
    expect(html).toContain("Betreft");
    // Brief-conventies vervallen: geen datum-regel (staat in de paginakop), aanhef of dank-zin
    expect(html).not.toContain("Zaltbommel,");
    expect(html).not.toContain("Geachte");
    expect(html).not.toContain("Hartelijk dank voor uw aanvraag");
    // Hero-kop + begeleidende intro-alinea's vervallen; de sectie opent met de kernzin
    expect(html).not.toContain("inkomstenbron");
    expect(html).not.toContain("volledig in beheer");
    expect(html).not.toContain("levert elke kWh die u thuis laadt u geld op");
    expect(html).not.toContain("Declareren bij uw werkgever");
    expect(html).toContain("beheren die volledig voor u");
    // Beheermodule-inhoud: vergoeding + punten + slogan; de Mark-casus is op het contract
    // bewust vervallen (gebruikerskeuze — de slogan sluit het blad, install+beheer houdt de casus)
    expect(html).toContain("Voor de vergoeding van uw stroom ontvangt u elke maand");
    expect(html).not.toContain("Bijvoorbeeld: Mark");
    expect(html).toContain("Uw voordelen op een rij:");
    expect(html).toContain("Laden via de zaak? Automatisch geregeld");
    expect(html).toContain("werkt</span>"); // slogan "Een laadpaal die voor u werkt" als gecentreerd slot
    // Geen instellingen-lijst; de tarief-instelregel leeft in de voorwaarden
    expect(html).not.toContain("afgesproken instellingen");
    expect(html).not.toContain("Blokkeertarief");
    expect(html).toContain("De laadpaal wordt ingesteld op € 0,50 per kWh (excl. btw)");
    // Ingang v2 = ondertekening, ook bij alleen-beheer (geen vaste ingangsdatum meer)
    expect(html).toContain("gaat in op de dag van ondertekening");
    expect(html).not.toContain("ingangsdatum van de overeenkomst is gesteld");
    // Voorwaarden + ondertekening samengevoegd. "Uitgangspunten" alleen bij ingevuld overleg
    // (testdata heeft geen overleg → afwezig); de btw-status zit ín de storingen-introzin,
    // direct boven de tarieven (gebruikerskeuze). Losse Prijsstelling-kop en btw-regel weg;
    // het vragen-blok en "Onze aanpak" blijven vervallen (gebruikerskeuze).
    expect(html).not.toContain("Uitgangspunten");
    expect(html).not.toContain("Genoemde netto bedragen");
    expect(html).not.toContain("Prijsstelling");
    expect(html).toContain("Storingen");
    expect(html).toContain("Storingsmeldingen vanuit het portaal worden opgepakt op basis van de onderstaande tarieven; genoemde bedragen zijn exclusief btw.");
    expect(html).toContain("De Algemene voorwaarden en de Regeling gegevensuitwisseling van E-Charging B.V.");
    // Contract-terminologie: het document noemt zichzelf contract, nergens offerte-jargon
    expect(html).toContain("Onze voorwaarden bij dit contract");
    expect(html).toContain("Dit contract is 30 dagen geldig na dagtekening.");
    expect(html).toContain("Beheercontract laadpaal"); // betreft-default op het contract
    expect(html).not.toContain("aanbieding");
    expect(html).not.toContain("voorstel");
    expect(html).toContain("Voor werktijden tussen 17.00 uur en 08.00 uur en op zaterdag");
    expect(html).not.toContain("Voor zaterdagen");
    expect(html).not.toContain("Onze aanpak");
    expect(html).not.toContain("Heeft u nog vragen");
    expect(html).toContain("Iedere aansprakelijkheid van E-Charging B.V.");
    expect(html).toContain("Betalingen binnen 14 dagen na factuurdatum.");
    expect(html).toContain("coördinatievergoeding worden berekend. De gebruikte materialen"); // derden+materialen als één alinea
    expect(html).toContain("Voor akkoord getekend,");
  });

  it("alleen-beheer zakelijk: hero + begeleidende tekst + instellingen-pagina blijven (geen contractblad)", () => {
    const html = htmlOf(data(undefined, { withInstallation: false }));
    expect(html).toContain("Hartelijk dank voor uw aanvraag");
    expect(html).toContain("Geachte");
    expect(html).toContain("inkomstenbron");
    expect(html).toContain("volledig in beheer");
    expect(html).toContain("ontzorgd wordt volgens het E-Charging concept");
    expect(html).toContain("afgesproken instellingen");
    expect(html).toContain("gaat in op de dag van ondertekening"); // v2-ingang geldt ook zakelijk alleen-beheer
  });

  it("paginakop-datum: v2 voluit ('16 juli 2026'), v1 bevroren op cijfers ('16-07-2026')", () => {
    const v2 = htmlOf(privData(undefined, { date: "2026-07-16" }));
    expect(v2).toContain("16 juli 2026");
    expect(v2).not.toContain("16-07-2026");
    const v1 = htmlOf(privData(1, { date: "2026-07-16" }));
    expect(v1).toContain("16-07-2026");
  });

  it("voorblad: contract gebruikt de Contract-cover; offertes en v1 de Offerte-cover", () => {
    const assets = { logoUrl: null, coverUrl: "/offer-cover.jpg", contractCoverUrl: "/contract-cover.jpg" };
    const htmlWith = (d: OfferTemplateData) => buildOfferPages(d, assets).map((p) => p.innerHTML).join("\n");
    const contract = htmlWith(privData(undefined, { withInstallation: false }));
    expect(contract).toContain("/contract-cover.jpg");
    const offerte = htmlWith(privData());
    expect(offerte).toContain("/offer-cover.jpg");
    expect(offerte).not.toContain("/contract-cover.jpg");
    // Verstuurde (v1-)documenten behouden hun oorspronkelijke Offerte-voorblad
    const v1 = htmlWith(privData(1, { withInstallation: false }));
    expect(v1).toContain("/offer-cover.jpg");
    expect(v1).not.toContain("/contract-cover.jpg");
  });

  it("Uitgangspunten/Overleg alleen tonen bij ingevuld overleg (geldt voor elke offerte)", () => {
    const zonder = htmlOf(data());
    expect(zonder).not.toContain("Uitgangspunten");
    expect(zonder).not.toContain("Overleg met");
    const met = htmlOf(data(undefined, { offerDetails: { overlegNaam: "Wessel Jonkers", overlegDatum: "2026-07-01" } }));
    expect(met).toContain("Uitgangspunten");
    expect(met).toContain("Overleg met Wessel Jonkers");
  });

  it("v1 + particulier: verstuurde offerte rendert de OUDE teksten, geen laadpas-variant", () => {
    const html = htmlOf(privData(1));
    expect(html).toContain("service-fee van");
    expect(html).toContain("Doorlopende optimalisatie van rendement");
    expect(html).not.toContain("Laden via de zaak");
    expect(html).not.toContain("afnameprijs");
    // v1 alleen-beheer (zoals verstuurde offerte 201-19-26): oude pagina 1 blijft bevroren —
    // GEEN contractblad, mét aanhef/dank-zin/beheerIntro.
    const beheerV1 = htmlOf(privData(1, { withInstallation: false }));
    expect(beheerV1).toContain("Geachte");
    expect(beheerV1).toContain("Hartelijk dank voor uw aanvraag");
    expect(beheerV1).toContain("volledig in beheer");
    expect(beheerV1).toContain("Zaltbommel,"); // datum-regel blijft in v1
  });
});

// v3: activatiekosten bij ALLEEN BEHEER uitgesplitst naar aantal × prijs per laadpunt, zodat de
// offerte letterlijk zegt wat er straks op de factuurregel komt. Aanleiding: bij offerte 211-01-26
// printte de PDF € 0,00 (uit totalInvestment) terwijl het scherm 18,50 toonde (activatiekostenPerSocket).
describe("activatiekosten in de offerte", () => {
  const beheerOnly = (textVersion?: number, o?: Partial<OfferTemplateData>) =>
    data(textVersion, { withInstallation: false, withManagement: true, numChargePoints: 6, totalInvestment: 0, ...o });

  it("v3 alleen-beheer: aantal × bedrag per laadpunt", () => {
    const html = htmlOf(beheerOnly(3, { offerDetails: { text_version: 3, activatiekostenPerSocket: 18.5 } }));
    expect(html).toContain("per laadpunt");
    expect(html).toContain("6 ×");
    expect(html).toContain("111,00");
  });

  it("v2 alleen-beheer blijft bevroren op één totaalbedrag (verstuurde offertes)", () => {
    const html = htmlOf(beheerOnly(2, { offerDetails: { text_version: 2, activatiekostenPerSocket: 18.5 }, totalInvestment: 0 }));
    expect(html).toContain("De eenmalige activatie- en onboardingkosten bedragen");
    expect(html).not.toContain("per laadpunt:");
  });

  it("v3 zonder bedrag of zonder aantal valt terug op de totaalzin (geen 0 × iets)", () => {
    const geenBedrag = htmlOf(beheerOnly(3, { offerDetails: { text_version: 3 } }));
    expect(geenBedrag).toContain("De eenmalige activatie- en onboardingkosten bedragen");
    const geenAantal = htmlOf(beheerOnly(3, { offerDetails: { text_version: 3, activatiekostenPerSocket: 18.5 }, numChargePoints: 0 }));
    expect(geenAantal).toContain("De eenmalige activatie- en onboardingkosten bedragen");
  });

  it("installatie + beheer houdt de per-socket-zin (ongewijzigd)", () => {
    const html = htmlOf(data(3, { offerDetails: { text_version: 3, activatiekostenPerSocket: 18.5 } }));
    expect(html).toContain("De activatiekosten bedragen");
    expect(html).toContain("per socket");
  });
});

// ===========================================================================
// DOCUMENTOPBOUW — offer_details.docSections laat offerte-onderdelen buiten het
// klantdocument vallen. Deze suite bewaakt twee dingen die niet mogen breken:
// (a) zonder de sleutel rendert alles byte-gelijk aan vroeger, en
// (b) de geadresseerde/prijs en het handtekeningblok zijn NOOIT weg te laten.
// jsdom meet alle hoogtes als 0, dus de paginering volgt hier puur de brk-grenzen.
// ===========================================================================
describe("documentopbouw (docSections)", () => {
  const pagesOf = (d: OfferTemplateData) => buildOfferPages(d, { logoUrl: null, coverUrl: null });
  const withSections = (base: OfferTemplateData, docSections: unknown) =>
    ({ ...base, offerDetails: { ...(base.offerDetails ?? {}), docSections } }) as OfferTemplateData;
  // Alleen-beheer zakelijk (tariefblok staat dan op pagina 1) en alleen-installatie.
  const beheerOnlyZak = (o?: Partial<OfferTemplateData>) => data(undefined, { withInstallation: false, ...o });
  const installOnly = (o?: Partial<OfferTemplateData>) => data(undefined, { withManagement: false, ...o });

  it("zonder de sleutel is de uitkomst identiek — bevriezing van verstuurde offertes", () => {
    // Elke vorm van "niets weglaten" moet exact hetzelfde document opleveren als vóór deze functie.
    const baseline = htmlOf(data(1));
    expect(htmlOf(withSections(data(1), null))).toBe(baseline);
    expect(htmlOf(withSections(data(1), []))).toBe(baseline);
    expect(htmlOf(withSections(data(1), ["bestaatniet"]))).toBe(baseline);
    // En ook op de nieuwste tekstversie (particulier, met centerRest-blok).
    const privBaseline = htmlOf(privData());
    expect(htmlOf(withSections(privData(), []))).toBe(privBaseline);
  });

  it("laat de beheersectie weg en hernummert sluitend", () => {
    expect(pagesOf(data()).length).toBe(5); // cover + 4 briefpagina's
    const zonder = pagesOf(withSections(data(), ["beheer"]));
    expect(zonder.length).toBe(4);
    const html = zonder.map((p) => p.innerHTML).join("\n");
    expect(html).not.toContain("Beheermodule laadpalen");
    expect(html).not.toContain("Een <span"); // de "Een laadpaal die voor u werkt"-kop
    // De rest van het document blijft compleet…
    expect(html).toContain("Prijsstelling");
    expect(html).toContain("Onze aanpak");
    expect(html).toContain("Voor akkoord getekend,");
    // …en de paginanummering telt door zonder gat.
    expect(html).toContain("van 3");
    expect(html).not.toContain("van 4");
  });

  it("laat het voorblad weg zonder de brief te raken", () => {
    const zonder = pagesOf(withSections(data(), ["cover"]));
    expect(zonder.length).toBe(4);
    expect(zonder[0].innerHTML).toContain("Onze referentie"); // eerste node is nu briefpagina 1
  });

  it("vergrendelde secties zijn inert: brief en slot blijven altijd staan", () => {
    const baseline = htmlOf(data());
    for (const locked of [["brief"], ["slot"], ["brief", "slot"]]) {
      expect(htmlOf(withSections(data(), locked))).toBe(baseline);
    }
  });

  it("handtekening + geadresseerde + prijs overleven ELKE combinatie, in elke scope", () => {
    const scopes: Array<[string, OfferTemplateData]> = [
      ["zakelijk install+beheer", data()],
      ["zakelijk alleen-beheer", beheerOnlyZak()],
      ["alleen-installatie", installOnly()],
      ["particulier install+beheer", privData()],
      ["particulier contractblad", privData(undefined, { withInstallation: false })],
      ["met overleg", data(undefined, { offerDetails: { overlegNaam: "W. Jonkers", overlegDatum: "2026-07-01" } })],
    ];
    // Alle 32 deelverzamelingen van OFFER_SECTIONS × elke scope.
    const subsets: string[][] = [[]];
    for (const id of OFFER_SECTIONS) subsets.push(...subsets.map((s) => [...s, id]));
    for (const [naam, base] of scopes) {
      for (const subset of subsets) {
        const html = htmlOf(withSections(base, subset));
        expect(html, `${naam} / ${JSON.stringify(subset)}`).toContain("Voor akkoord getekend,");
        expect(html, `${naam} / ${JSON.stringify(subset)}`).toContain("Onze referentie");
      }
    }
  });

  it("contractblad: alles op één blad, dus alleen het voorblad is weg te laten", () => {
    const contract = privData(undefined, { withInstallation: false });
    // "slot" vloeit daar in "voorwaarden" → die groep vergrendelt zichzelf via lastSec.
    expect(htmlOf(withSections(contract, ["voorwaarden"]))).toBe(htmlOf(contract));
    expect(htmlOf(withSections(contract, ["beheer"]))).toBe(htmlOf(contract));
    expect(pagesOf(withSections(contract, ["cover"])).length).toBe(pagesOf(contract).length - 1);
  });

  it("offerSections meldt per scope welke onderdelen bestaan en welke vastliggen", () => {
    const ids = (d: OfferTemplateData) => offerSections(d).map((s) => `${s.id}${s.locked ? "*" : ""}`);
    expect(ids(data())).toEqual(["cover", "brief*", "beheer", "voorwaarden", "slot*"]);
    expect(ids(installOnly())).toEqual(["cover", "brief*", "voorwaarden", "slot*"]);
    expect(ids(beheerOnlyZak())).toEqual(["cover", "brief*", "beheer", "voorwaarden", "slot*"]);
    // Contractblad: slot is samengevloeid met voorwaarden en daarmee vergrendeld.
    expect(ids(privData(undefined, { withInstallation: false }))).toEqual(["cover", "brief*", "voorwaarden*"]);
    // De indeling mag niet per tekstversie verschillen — verstuurde offertes dragen hun ids mee.
    expect(ids(data(1))).toEqual(ids(data(2)));
    expect(ids(data(2))).toEqual(ids(data(3)));
    // omitted volgt de sleutel, maar nooit voor een vergrendelde sectie.
    expect(offerSections(withSections(data(), ["beheer", "slot"])).filter((s) => s.omitted).map((s) => s.id)).toEqual(["beheer"]);
  });

  it("rommelige waarden in de jsonb mogen niets laten crashen", () => {
    const baseline = htmlOf(data());
    for (const rommel of [3, "3", true, {}, [null], [42], ["cover", "cover", "brief"]]) {
      const html = htmlOf(withSections(data(), rommel));
      // Alleen "cover" is een geldig, niet-vergrendeld id in die laatste lijst.
      if (Array.isArray(rommel) && rommel.includes("cover")) expect(html).not.toBe(baseline);
      else expect(html).toBe(baseline);
    }
  });

  it("meetmodus blijft gelijk als de beheersectie wegvalt (geen verspringende pagina 1)", () => {
    // `fractional` wordt op de ONGEFILTERDE blokken bepaald; zou dat op de gefilterde gebeuren,
    // dan schakelt particulier v2 zonder beheersectie om naar offsetHeight en verschuift de
    // briefkop-witruimte zichtbaar. Pagina 1 moet identiek blijven.
    // Vergelijk de briefkop-witruimtes zelf (de auto-fit-uitkomst), niet de paginakop —
    // die telt terecht af van "van 4" naar "van 3".
    const gaps = (d: OfferTemplateData) => {
      const html = pagesOf(d)[1].innerHTML;
      return [...html.matchAll(/margin-top:([\d.]+)px"><div>(?:Zaltbommel|Geachte)/g)].map((m) => m[1]);
    };
    const vol = gaps(privData());
    expect(vol.length).toBe(2); // datum- en aanhef-witruimte gevonden
    expect(gaps(withSections(privData(), ["beheer"]))).toEqual(vol);
  });
});

// ===========================================================================
// PAGINERING MET ECHTE HOOGTES. jsdom meet alles als 0, dus de suite hierboven toetst
// alleen de brk-grenzen. Hier injecteren we deterministische hoogtes zodat paginateLetter
// écht moet verdelen — de enige manier om te zien of het weglaten van een sectie de
// paginering van de OVERGEBLEVEN secties beïnvloedt (o.a. via de keep-lookahead, die over
// een nieuwe groepsgrens heen zou kunnen kijken).
// ===========================================================================
describe("documentopbouw: paginering met realistische hoogtes", () => {
  const withSections = (base: OfferTemplateData, docSections: unknown) =>
    ({ ...base, offerDetails: { ...(base.offerDetails ?? {}), docSections } }) as OfferTemplateData;

  // Hoogte ~ tekstlengte: genoeg om meerdere pagina's te vullen, en stabiel per blok.
  // LET OP: buildOfferPages meet via getBoundingClientRect() zodra er een centerRest-blok is
  // (elke particuliere v2-offerte) en anders via offsetHeight — beide MOETEN gemockt worden,
  // anders meet de test op het fractional-pad stilzwijgend nul en toetst hij niets.
  const withMockedHeights = <T,>(fn: () => T): T => {
    const proto = window.HTMLElement.prototype;
    const h = (el: HTMLElement) => 18 + Math.ceil((el.textContent?.length ?? 0) / 4);
    const origOffset = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
    const origRect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
    Object.defineProperty(proto, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) { return h(this); },
    });
    Object.defineProperty(proto, "getBoundingClientRect", {
      configurable: true,
      writable: true,
      value(this: HTMLElement) { return { height: h(this), width: 650, top: 0, left: 0, right: 650, bottom: h(this), x: 0, y: 0, toJSON: () => ({}) } as DOMRect; },
    });
    try { return fn(); } finally {
      if (origOffset) Object.defineProperty(proto, "offsetHeight", origOffset);
      else delete (proto as unknown as Record<string, unknown>).offsetHeight;
      if (origRect) Object.defineProperty(proto, "getBoundingClientRect", origRect);
      else delete (proto as unknown as Record<string, unknown>).getBoundingClientRect;
    }
  };

  // Inhoud van de pagina's van één sectie, zonder de paginakop (die telt terecht af).
  const bodyPerSection = (d: OfferTemplateData, sec: string) =>
    buildOfferPages(d, { logoUrl: null, coverUrl: null })
      .filter((p) => p.dataset.section === sec)
      .map((p) => p.innerHTML.slice(p.innerHTML.indexOf("top:172px")));

  it("weglaten van een sectie verschuift de paginering van de rest niet", () => {
    withMockedHeights(() => {
      // Lange leveringText: dwingt echte herpaginering binnen de brief-sectie af.
      const lang = data(undefined, {
        offerDetails: { leveringText: Array.from({ length: 14 }, (_, i) => `Alinea ${i + 1} met voldoende tekst om de pagina te vullen en een herverdeling af te dwingen.`).join("\n\n") },
      });
      expect(bodyPerSection(lang, "brief").length).toBeGreaterThan(1); // echt meerdere pagina's

      for (const weg of ["beheer", "cover"]) {
        const zonder = withSections(lang, [weg]);
        for (const sec of ["brief", "voorwaarden", "slot"]) {
          if (sec === weg) continue;
          expect(bodyPerSection(zonder, sec), `sectie ${sec} na weglaten van ${weg}`)
            .toEqual(bodyPerSection(lang, sec));
        }
      }
    });
  });

  it("meet ook op het particuliere pad (getBoundingClientRect) en houdt de rest stabiel", () => {
    withMockedHeights(() => {
      // Particulier v2 heeft een centerRest-blok, dus buildOfferPages meet via
      // getBoundingClientRect. Zonder die mock zouden alle hoogtes 0 zijn en toetste dit niets.
      const lang = privData(undefined, {
        offerDetails: { leveringText: Array.from({ length: 14 }, (_, i) => `Alinea ${i + 1} met voldoende tekst om de pagina te vullen en een herverdeling af te dwingen.`).join("\n\n") },
      });
      expect(bodyPerSection(lang, "brief").length).toBeGreaterThan(1); // bewijst dat er gemeten wordt
      const zonder = withSections(lang, ["cover"]);
      for (const sec of ["brief", "beheer", "voorwaarden", "slot"]) {
        expect(bodyPerSection(zonder, sec), `sectie ${sec} na weglaten van de cover`)
          .toEqual(bodyPerSection(lang, sec));
      }
    });
  });

  it("het handtekeningblok blijft ook bij echte hoogtes op de laatste pagina staan", () => {
    withMockedHeights(() => {
      for (const weg of [[], ["beheer"], ["cover"], ["beheer", "cover"], ["voorwaarden"]]) {
        const pages = buildOfferPages(withSections(data(), weg), { logoUrl: null, coverUrl: null });
        expect(pages[pages.length - 1].innerHTML, JSON.stringify(weg)).toContain("Voor akkoord getekend,");
      }
    });
  });
});

// ===========================================================================
// LOSSE ZINNEN (offer_details.docPhrases). Fijnere korrel dan de secties: individuele
// verkoopzinnen die buiten het klantdocument kunnen vallen. Bewaakt drie dingen:
// byte-gelijkheid zonder de sleutel, de inventaris per scope (een opgeslagen id moet altijd
// hetzelfde blok blijven betekenen), en de structuurinvariant dat geen enkele annotatie
// paginastructuur draagt.
// ===========================================================================
describe("weggelaten zinnen (docPhrases)", () => {
  const pagesOf = (d: OfferTemplateData) => buildOfferPages(d, { logoUrl: null, coverUrl: null });
  const withPhrases = (base: OfferTemplateData, docPhrases: unknown) =>
    ({ ...base, offerDetails: { ...(base.offerDetails ?? {}), docPhrases } }) as OfferTemplateData;
  const withSecs = (base: OfferTemplateData, docSections: unknown) =>
    ({ ...base, offerDetails: { ...(base.offerDetails ?? {}), docSections } }) as OfferTemplateData;
  const beheerOnlyZak = (o?: Partial<OfferTemplateData>) => data(undefined, { withInstallation: false, ...o });
  const installOnly = (o?: Partial<OfferTemplateData>) => data(undefined, { withManagement: false, ...o });
  const contractblad = privData(undefined, { withInstallation: false });
  const ids = (d: OfferTemplateData) => offerPhrases(d).map((p) => p.id);
  const textOf = (d: OfferTemplateData, id: string) => offerPhrases(d).find((p) => p.id === id)?.text;

  it("zonder de sleutel is de uitkomst identiek — bevriezing van verstuurde offertes", () => {
    for (const base of [data(1), data(), privData(), contractblad, installOnly()]) {
      const baseline = htmlOf(base);
      for (const leeg of [null, [], ["bestaatniet"], ["heroInkomstenbron", "bestaatniet"].slice(1)]) {
        expect(htmlOf(withPhrases(base, leeg))).toBe(baseline);
      }
    }
  });

  it("biedt per scope exact de zinnen aan die er zijn", () => {
    expect(ids(data())).toEqual(["heroInkomstenbron", "paalWerktKop", "contactvraag"]);
    expect(ids(data(1))).toEqual(["heroInkomstenbron", "paalWerktKop", "contactvraag"]);
    expect(ids(beheerOnlyZak())).toEqual(["heroInkomstenbron", "contactvraag"]);
    expect(ids(installOnly())).toEqual(["contactvraag"]);
    expect(ids(privData())).toEqual(["heroInkomstenbron", "rekenvoorbeeld", "paalWerktSlot", "contactvraag"]);
    // Contractblad: alles op één blad, geen hero en geen contactvraag — alleen het slotstatement.
    expect(ids(contractblad)).toEqual(["paalWerktSlot"]);
    // Particulier v1 volgt de zakelijke opbouw (privV2 is false).
    expect(ids(privData(1))).toEqual(["heroInkomstenbron", "paalWerktKop", "contactvraag"]);
  });

  it("het rekenvoorbeeld volgt de markRate-drempel van € 0,30", () => {
    // laadtarief 0,50 − marge 0,10 = 0,40 → markRate 0,35 ⇒ voorbeeld aanwezig
    expect(ids(privData())).toContain("rekenvoorbeeld");
    // laadtarief 0,30 − 0,10 = 0,20 → markRate 0,15 < 0,30 ⇒ voorbeeld valt weg
    expect(ids(privData(undefined, { chargeTariffPerKwh: 0.3 }))).not.toContain("rekenvoorbeeld");
  });

  it("toont de letterlijke zin zoals die in dít document staat", () => {
    // Enkelvoud/meervoud volgt het aantal laadpunten; geen spatie vóór de punt.
    expect(textOf(privData(), "heroInkomstenbron")).toBe("Wij maken van uw laadpaal een inkomstenbron.");
    expect(textOf(privData(undefined, { numChargePoints: 3 }), "heroInkomstenbron")).toBe("Wij maken van uw laadpalen een inkomstenbron.");
    expect(textOf(data(), "heroInkomstenbron")).toBe("Wij maken van uw laadpalen een inkomstenbron.");
    expect(textOf(data(), "paalWerktKop")).toBe("Een laadpaal die voor u werkt");
    expect(textOf(contractblad, "paalWerktSlot")).toBe("Een laadpaal die voor u werkt");
    // De contactvraag bestaat uit twee divs: die mogen niet aaneenplakken.
    expect(textOf(data(), "contactvraag")).toBe("Heeft u nog vragen of opmerkingen naar aanleiding van deze offerte? Neem dan gerust contact met ons op.");
    expect(textOf(data(1), "contactvraag")).toContain("deze aanbieding?");
    expect(textOf(privData(), "rekenvoorbeeld")).toMatch(/^Bijvoorbeeld: Mark rijdt ongeveer 25\.000 kilometer/);
  });

  it("geen enkele annotatie draagt paginastructuur", () => {
    for (const d of [data(), data(1), privData(), contractblad, beheerOnlyZak(), installOnly()]) {
      const blokken = __phraseBlocksForTest(d);
      expect(blokken.length).toBeGreaterThan(0);
      for (const b of blokken) {
        expect(b.hasSec, `${b.q} draagt een sectie-opener`).toBe(false);
        expect(b.hasBrk, `${b.q} draagt een paginabreuk`).toBe(false);
        expect(b.tag === "dateGap" || b.tag === "aanhefGap", `${b.q} draagt een gap-tag`).toBe(false);
        expect(b.droppable, `${b.q} is niet weglaatbaar`).toBe(true);
      }
    }
  });

  it("laat de gekozen zin weg en raakt de rest niet", () => {
    const html = htmlOf(withPhrases(data(), ["heroInkomstenbron"]));
    expect(html).not.toContain("inkomstenbron");
    expect(html).toContain("Levering en installatie");
    expect(html).toContain("Prijsstelling");
    expect(html).toContain("Onze referentie");
    expect(html).toContain("Voor akkoord getekend,");
    // De contactvraag laat het handtekeningblok ongemoeid.
    const zonderVraag = htmlOf(withPhrases(data(), ["contactvraag"]));
    expect(zonderVraag).not.toContain("Heeft u nog vragen");
    expect(zonderVraag).toContain("Voor akkoord getekend,");
  });

  it("een zin in een weggelaten sectie verdwijnt uit de keuzelijst", () => {
    // "beheer" weg ⇒ de zinnen die daarin staan zijn al verdwenen en horen niet meer aanvinkbaar.
    expect(ids(withSecs(privData(), ["beheer"]))).toEqual(["heroInkomstenbron", "contactvraag"]);
  });

  it("het contractblad houdt zijn slotstatement weglaatbaar zonder te breken", () => {
    const zonder = htmlOf(withPhrases(contractblad, ["paalWerktSlot"]));
    expect(zonder).not.toContain("werkt</span>");
    expect(zonder).toContain("Voor akkoord getekend,");
    expect(zonder).toContain("Onze referentie");
    expect(pagesOf(withPhrases(contractblad, ["paalWerktSlot"])).length).toBe(pagesOf(contractblad).length);
  });

  it("rommelige waarden in de jsonb mogen niets laten crashen", () => {
    const baseline = htmlOf(data());
    for (const rommel of [3, "3", true, {}, [null], [42], ["heroInkomstenbron", "heroInkomstenbron"]]) {
      const html = htmlOf(withPhrases(data(), rommel));
      if (Array.isArray(rommel) && rommel.includes("heroInkomstenbron")) expect(html).not.toBe(baseline);
      else expect(html).toBe(baseline);
    }
  });

  it("secties en zinnen werken samen zonder elkaar te storen", () => {
    const beide = withPhrases(withSecs(data(), ["beheer"]), ["contactvraag"]);
    const html = htmlOf(beide);
    expect(html).not.toContain("Beheermodule laadpalen");
    expect(html).not.toContain("Heeft u nog vragen");
    expect(html).toContain("Voor akkoord getekend,");
    expect(html).toContain("Onze referentie");
  });
});

describe("weggelaten zinnen: layout-effect met echte hoogtes", () => {
  const withPhrases = (base: OfferTemplateData, docPhrases: unknown) =>
    ({ ...base, offerDetails: { ...(base.offerDetails ?? {}), docPhrases } }) as OfferTemplateData;

  const withMockedHeights = <T,>(fn: () => T): T => {
    const proto = window.HTMLElement.prototype;
    const h = (el: HTMLElement) => 18 + Math.ceil((el.textContent?.length ?? 0) / 4);
    const origOffset = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
    const origRect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
    Object.defineProperty(proto, "offsetHeight", { configurable: true, get(this: HTMLElement) { return h(this); } });
    Object.defineProperty(proto, "getBoundingClientRect", {
      configurable: true, writable: true,
      value(this: HTMLElement) { return { height: h(this), width: 650, top: 0, left: 0, right: 650, bottom: h(this), x: 0, y: 0, toJSON: () => ({}) } as DOMRect; },
    });
    try { return fn(); } finally {
      if (origOffset) Object.defineProperty(proto, "offsetHeight", origOffset); else delete (proto as unknown as Record<string, unknown>).offsetHeight;
      if (origRect) Object.defineProperty(proto, "getBoundingClientRect", origRect); else delete (proto as unknown as Record<string, unknown>).getBoundingClientRect;
    }
  };

  // De twee briefkop-witruimtes op pagina 1 (auto-fit krimpt ze bij overloop).
  const gaps = (d: OfferTemplateData) => {
    const html = buildOfferPages(d, { logoUrl: null, coverUrl: null })[1].innerHTML;
    return [...html.matchAll(/margin-top:([\d.]+)px"><div>(?:Zaltbommel|Geachte)/g)].map((m) => Number(m[1]));
  };

  it("de hero-zin weglaten geeft de briefkop zijn volle witruimte terug", () => {
    withMockedHeights(() => {
      // 6 alinea's: pagina 1 loopt genoeg over dat de auto-fit knijpt, maar niet zó veel dat
      // beide gaps op de ondergrens (16) belanden — anders zou het effect onmeetbaar zijn.
      const lang = data(undefined, {
        offerDetails: { leveringText: Array.from({ length: 6 }, (_, i) => `Alinea ${i + 1} met genoeg tekst om pagina 1 te laten overlopen zodat de auto-fit gaat knijpen.`).join("\n\n") },
      });
      const vol = gaps(lang);
      expect(vol.length).toBe(2);
      expect(vol[0]).toBeLessThan(96); // auto-fit is daadwerkelijk actief
      expect(vol[0]).toBeGreaterThan(16); // en niet vastgelopen op de ondergrens
      // Zonder de hero past pagina 1 ruimer, dus er wordt minder geknepen: de briefkop schuift
      // zichtbaar omlaag. Correct gedrag, maar het is de grootste optische bijwerking — daarom
      // hier vastgepind in plaats van als verrassing bij een klant te belanden.
      const zonder = gaps(withPhrases(lang, ["heroInkomstenbron"]));
      expect(zonder[0]).toBeGreaterThan(vol[0]);
      expect(zonder[0]).toBeLessThanOrEqual(96);
    });
  });

  it("een zin weglaten verschuift de secties waar hij niet in staat niet", () => {
    withMockedHeights(() => {
      const bodyPerSection = (d: OfferTemplateData, sec: string) =>
        buildOfferPages(d, { logoUrl: null, coverUrl: null })
          .filter((p) => p.dataset.section === sec)
          .map((p) => p.innerHTML.slice(p.innerHTML.indexOf("top:172px")));
      const base = data();
      // contactvraag zit in "slot"; brief/beheer/voorwaarden moeten byte-identiek blijven.
      const zonder = withPhrases(base, ["contactvraag"]);
      for (const sec of ["brief", "beheer", "voorwaarden"]) {
        expect(bodyPerSection(zonder, sec), `sectie ${sec}`).toEqual(bodyPerSection(base, sec));
      }
    });
  });

  it("het handtekeningblok blijft bij elke combinatie op de laatste pagina", () => {
    withMockedHeights(() => {
      const combis = [[], ["heroInkomstenbron"], ["contactvraag"], ["paalWerktKop"], ["heroInkomstenbron", "paalWerktKop", "contactvraag"]];
      for (const weg of combis) {
        const pages = buildOfferPages(withPhrases(data(), weg), { logoUrl: null, coverUrl: null });
        expect(pages[pages.length - 1].innerHTML, JSON.stringify(weg)).toContain("Voor akkoord getekend,");
      }
      // Particulier v2, inclusief het centerRest-blok.
      for (const weg of [["paalWerktSlot"], ["rekenvoorbeeld"], ["paalWerktSlot", "rekenvoorbeeld"]]) {
        const pages = buildOfferPages(withPhrases(privData(), weg), { logoUrl: null, coverUrl: null });
        expect(pages[pages.length - 1].innerHTML, JSON.stringify(weg)).toContain("Voor akkoord getekend,");
      }
    });
  });
});
