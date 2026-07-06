// Kwalitatief praktijk-blok voor de blog-engine (E-E-A-T / "information gain"): geeft de schrijver een eerste-hands
// praktijkstem MEE, maar NOOIT exacte platformcijfers. We noemen dus NOOIT letterlijke aantallen laadpunten, locaties,
// laadsessies, kWh of opbrengsten uit ons systeem -- dat zou (a) niet-deelbare informatie kunnen lekken en (b) laat ons
// onnodig klein ogen. Toegestaan is uitsluitend een KWALITATIEVE uitspraak ("uit onze eigen praktijk blijkt dat ...")
// gevolgd door een inhoudelijke conclusie. Geen DB-call, geen getallen -> kan niet falen.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ProofResult {
  block: string | null;
  stats: Record<string, any> | null;
}

// Statisch, veilig, getalloos. Async + sb-param blijven behouden zodat de call-sites niet hoeven te wijzigen.
export async function fetchProofBlock(_sb?: any): Promise<ProofResult> {
  const block = [
    `EIGEN PRAKTIJK (eerste-hands ervaring — GEEN cijfers). e-Charging beheert zelf laadinfrastructuur en zit dagelijks in`,
    `de laaddata, de facturatie en het beheer. Verweef daarom op één natuurlijke, relevante plek een KWALITATIEVE`,
    `praktijkobservatie in de "wij"-vorm en trek daar een inhoudelijke conclusie uit — bijvoorbeeld: "uit onze eigen`,
    `praktijk blijkt dat ...", "in het beheer dat wij doen zien we dat ...", "wat ons in de praktijk opvalt is dat ...".`,
    ``,
    `IJZEREN REGEL — noem NOOIT exacte platformcijfers of interne data: geen aantallen laadpunten, geen aantal locaties,`,
    `geen aantal laadsessies, geen kWh-hoeveelheden, geen euro-opbrengsten, geen bezettings- of groeipercentages uit ons`,
    `eigen systeem. Verzin ook geen cijfers "als voorbeeld". De praktijkstem is puur KWALITATIEF (patronen, observaties,`,
    `lessen), nooit kwantitatief. Algemene, publiek bekende marktcijfers met bronvermelding mogen wél, maar presenteer die`,
    `nooit als onze eigen interne data.`,
  ].join("\n");
  return { block, stats: null };
}
