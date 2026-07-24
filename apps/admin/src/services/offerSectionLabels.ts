// Leesbare namen van de offerte-secties (OFFER_SECTIONS in offerTemplate.ts).
//
// Bewust een APARTE module en niet in offerTemplate.ts: dit is bedieningstaal van het
// sales-werkblad, geen documentinhoud, en offerTemplate.ts moet puur over het document gaan.
// LET OP — dit is géén beveiliging: omdat OfferInternalSign en SalesOfferteDetail beide
// importeren, hijst de bundler deze module naar de gedeelde hoofdchunk die ook de publieke
// accept-pagina laadt. Dat is aanvaard: die chunk bevat sowieso al de volledige offerte-copy
// (alle sectiekoppen en voorwaarden-teksten). Bij client-side rendering is de documentinhoud
// principieel niet geheim te houden — deze functie maakt een document korter, ze verbergt
// geen informatie die de klant niet zou mogen kennen.
import type { OfferSection } from "./offerTemplate";

export const OFFER_SECTION_LABELS: Record<OfferSection, string> = {
  cover: "Voorblad",
  brief: "Aanbieding",
  beheer: "Beheermodule",
  voorwaarden: "Voorwaarden en storingen",
  slot: "Ondertekening",
};

// Extra toelichting bij secties waarvan het weglaten inhoudelijke gevolgen heeft. Wordt getoond
// in het documentopbouw-menu en meegenomen in de bevestiging vóór verzenden.
export const OFFER_SECTION_WARNINGS: Partial<Record<OfferSection, string>> = {
  voorwaarden: "Bevat de algemene voorwaarden, de geldigheidsduur, de contractduur/opzegtermijn en de activatiekosten.",
  beheer: "De verwijzingen naar het beheer elders in de offerte (activatiekosten, maandafrekening) blijven staan. Wil je beheer helemaal uit de offerte, zet dan de scope om.",
};

export const offerSectionLabel = (id: string): string =>
  OFFER_SECTION_LABELS[id as OfferSection] ?? id;
