// Kwalitatief praktijk-blok voor de blog-engine (E-E-A-T / "information gain"). LET OP (les 2026-07-21):
// dit blok droeg de schrijver eerder op om "wij"-praktijkobservaties te verzinnen ("uit onze eigen praktijk
// blijkt dat ...") — dat leverde fabricated ervaringsclaims op over dossiers en subsidietrajecten die het
// (jonge) bedrijf niet kan waarmaken. Praktijkkennis mag alleen nog NEUTRAAL geformuleerd worden; wij-vorm
// is uitsluitend toegestaan voor onze WERKWIJZE/aanbod, nooit voor waarnemingen of track record.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ProofResult {
  block: string | null;
  stats: Record<string, any> | null;
}

// Statisch, veilig, getalloos. Async + sb-param blijven behouden zodat de call-sites niet hoeven te wijzigen.
export async function fetchProofBlock(_sb?: any): Promise<ProofResult> {
  const block = [
    `EIGEN PRAKTIJK — praktijkkennis, GEEN verzonnen ervaring. Verwerk waar relevant concrete, toegepaste`,
    `praktijkkennis (afwegingen, valkuilen, volgordes, lessen), maar formuleer die NEUTRAAL: "in de praktijk`,
    `blijkt vaak dat ...", "een veelvoorkomend patroon is ...", "wie dit vooraf regelt, voorkomt ...".`,
    ``,
    `IJZEREN REGEL — VERZIN NOOIT eerste-persoons-ervaringsclaims: geen "uit onze (eigen) praktijk blijkt",`,
    `geen "in het beheer dat wij dagelijks doen zien we", geen "wat ons opvalt", geen "wij hebben meegemaakt",`,
    `geen "uit de dossiers die wij behandelen" of vergelijkbare wij/ons-waarnemingsframes. Zulke claims zijn`,
    `niet waar te maken en schaden de geloofwaardigheid. De wij-vorm mag WEL voor onze werkwijze of ons aanbod`,
    `("in onze aanpak is load balancing de basis", "wij verzorgen desgewenst de installatie").`,
    ``,
    `Noem daarnaast NOOIT exacte platformcijfers of interne data: geen aantallen laadpunten, locaties,`,
    `laadsessies, kWh of euro-opbrengsten uit ons systeem, en verzin geen cijfers "als voorbeeld". Publiek`,
    `bekende marktcijfers met bronvermelding mogen wél, maar nooit gepresenteerd als onze eigen data.`,
  ].join("\n");
  return { block, stats: null };
}
