// Bedieningstaal voor de losse zinnen (OFFER_PHRASES in offerTemplate.ts).
//
// Het LABEL van een zin is de zin zelf — die komt uit offerPhrases(), zodat het menu exact toont
// wat er in dít document staat (enkelvoud/meervoud, juiste tekstversie). Hier staat alleen wat
// je daar niet uit kunt aflezen: wat voor soort tekst het is, en welk layout-gevolg weglaten heeft.
// Aparte module om dezelfde reden als offerSectionLabels: offerTemplate.ts gaat over het document,
// niet over het werkblad.
import type { OfferPhrase } from "./offerTemplate";

export const OFFER_PHRASE_KINDS: Record<OfferPhrase, string> = {
  heroInkomstenbron: "Slogan",
  paalWerktKop: "Tussenkop",
  paalWerktSlot: "Slotstatement",
  rekenvoorbeeld: "Rekenvoorbeeld",
  contactvraag: "Afsluiter",
};

// Layout-gevolgen die je niet ziet tot je het doet.
export const OFFER_PHRASE_NOTES: Partial<Record<OfferPhrase, string>> = {
  heroInkomstenbron: "Staat op pagina 1; zonder deze zin schuift de briefkop omlaag.",
  paalWerktSlot: "Sluit de pagina af; zonder deze zin eindigt die pagina eerder.",
};

// Knippen op woordgrens, voor plattetekst-contexten waar CSS niet kan clampen
// (de bevestiging vóór verzenden, de tooltip op de badge, het amberblok bij ondertekenen).
export function phraseSnippet(text: string, max = 60): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
