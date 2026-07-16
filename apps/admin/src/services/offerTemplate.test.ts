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
    expect(html).toContain("eerste dag van de kalendermaand volgend op de opleverdatum"); // v1-ingangsdatum bevroren
    expect(html).toContain("Activatiekosten, ingangsdatum, contactduur en opzegging beheermodule"); // v1-kop bevroren, incl. originele tikfout "contactduur"
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
    // Volledige beheermodule-inhoud aanwezig: vergoeding, Mark-casus, punten en slotkop
    expect(html).toContain("Voor de vergoeding van uw stroom ontvangt u elke maand");
    expect(html).toContain("Bijvoorbeeld: Mark rijdt");
    expect(html).toContain("Zijn vergoeding is € 0,35 per geladen kWh"); // tarief 0,50 → 0,40 − 0,05
    expect(html).toContain("Uw voordelen op een rij:");
    expect(html).toContain("Laden via de zaak? Automatisch geregeld");
    expect(html).not.toContain("werkt</span>"); // slotkop vervallen op het contractblad (gebruikerskeuze)
    // Geen instellingen-lijst; de tarief-instelregel leeft in de voorwaarden
    expect(html).not.toContain("afgesproken instellingen");
    expect(html).not.toContain("Blokkeertarief");
    expect(html).toContain("De laadpaal wordt ingesteld op € 0,50 per kWh (excl. btw)");
    // Ingang v2 = ondertekening, ook bij alleen-beheer (geen vaste ingangsdatum meer)
    expect(html).toContain("gaat in op de dag van ondertekening");
    expect(html).not.toContain("ingangsdatum van de overeenkomst is gesteld");
    // Voorwaarden + ondertekening samengevoegd. "Uitgangspunten" bundelt overleg (indien
    // ingevuld) + de BTW-regel en staat er dus ALTIJD; de losse Prijsstelling-kop vervalt.
    // "Storingen" is een eigen kop mét de portaal-introzin (gebruikerskeuze); het vragen-blok
    // en "Onze aanpak" blijven vervallen (gebruikerskeuze: vragen-blok mag weg bij ruimtegebrek).
    expect(html).toContain("Uitgangspunten");
    expect(html).toContain("Genoemde netto bedragen zijn exclusief BTW.");
    expect(html).not.toContain("Prijsstelling");
    expect(html).toContain("Storingen");
    expect(html).toContain("Storingsmeldingen vanuit het portaal worden opgepakt op basis van de onderstaande tarieven;");
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
