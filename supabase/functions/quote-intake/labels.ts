// Nederlandse labels voor alle keuzes uit het aanmeldformulier. Eén bron voor de
// samenvatting in de lead, de mails én de kolommen die het dashboard rauw toont.
// Spiegel: apps/admin/src/lib/quoteRequest.ts — houd ze in sync.

export type Flow = "particulier" | "zakelijk";
export type Triage =
  | "remote_opname"
  | "opname_op_locatie"
  | "klein_simpel"
  | "middel_complex"
  | "project";

export const TRIAGE_LABEL: Record<Triage, string> = {
  remote_opname: "Op afstand beoordelen",
  opname_op_locatie: "Opname op locatie",
  klein_simpel: "Klein en simpel",
  middel_complex: "Middel of complex",
  project: "Projecttraject",
};

/** De vervolgactie uit de vragenlijst, als taak voor sales. */
export const TRIAGE_TAAK: Record<Triage, string> = {
  remote_opname:
    "Aanvraag op afstand beoordelen, concept-offerte sturen en de monteur laten bellen over tarief en aansluiting",
  opname_op_locatie: "Opname op locatie inplannen, daarna de offerte opstellen",
  klein_simpel: "Opname inplannen en daarna een voorstel maken",
  middel_complex: "Kort adviesgesprek inplannen over model en wensen, daarna opname en voorstel op maat",
  project: "Projecttraject: direct contact opnemen als sales (projectontwikkelaar, nieuwbouw of groot)",
};

export const JA_NEE: Record<string, string> = { ja: "Ja", nee: "Nee" };
export const JA_NEE_WEET_NIET: Record<string, string> = {
  ja: "Ja",
  nee: "Nee",
  weet_ik_niet: "Weet ik niet",
};

export const AANSLUITING: Record<string, string> = {
  "1_fase": "1-fase",
  "3_fase": "3-fase",
  weet_ik_niet: "Weet ik niet",
};

export const KABEL_LENGTE: Record<string, string> = { "5": "5 meter", "7_5": "7,5 meter" };
export const KLEUR_FRONT: Record<string, string> = { zwart: "Zwart", wit: "Wit" };

export const LAADTARIEF: Record<string, string> = {
  kostenvergoeding: "Alleen kostenvergoeding",
  kostenvergoeding_marge: "Kostenvergoeding plus een marge",
  adviseer_mij: "Adviseer mij",
};

export const PLAATSING: Record<string, string> = {
  zo_snel_mogelijk: "Zo snel mogelijk",
  specifieke_maand: "In een specifieke maand",
};

export const TYPE_ORGANISATIE: Record<string, string> = {
  vastgoedeigenaar: "Vastgoedeigenaar",
  vve: "VvE",
  projectontwikkelaar: "Projectontwikkelaar",
  parkeerexploitant: "Parkeerexploitant",
  bedrijf: "Bedrijf",
  anders: "Anders",
};

export const TYPE_LOCATIE: Record<string, string> = {
  eigen_parkeerterrein: "Eigen parkeerterrein",
  parkeergarage: "Parkeergarage",
  bij_bedrijfspand: "Bij een bedrijfspand",
  vve_parkeerplaatsen: "VvE-parkeerplaatsen",
  anders: "Anders",
};

export const EIGENDOM: Record<string, string> = { eigenaar: "Eigenaar", huurder: "Huurder" };

export const BESTAAND_NIEUWBOUW: Record<string, string> = {
  bestaand: "Bestaande situatie",
  nieuwbouw_renovatie: "Nieuwbouw of renovatie",
};

export const WIE_GAAT_LADEN: Record<string, string> = {
  bewoners: "Bewoners",
  medewerkers: "Medewerkers",
  bezoekers: "Bezoekers",
  publiek: "Publiek",
};

export const UPLOAD_KIND: Record<string, string> = {
  meterkast: "Meterkast",
  plek: "Plek van de laadpaal",
  route: "Route meterkast naar laadplek",
  situatie: "Situatie of plattegrond",
};

/** "2026-09" → "september 2026" */
export function maandLabel(waarde: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(waarde);
  if (!m) return waarde;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

/** Label opzoeken, met de ruwe waarde als terugval (nooit een lege regel tonen). */
export function label(map: Record<string, string>, waarde: string | null | undefined): string {
  if (!waarde) return "";
  return map[waarde] ?? waarde;
}
