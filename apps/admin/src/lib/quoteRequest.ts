// Nederlandse labels voor de offerteaanvragen die vanaf de website binnenkomen.
// Spiegel van supabase/functions/quote-intake/labels.ts — houd ze in sync.

export type QuoteFlow = "particulier" | "zakelijk";
export type QuoteTriage =
  | "remote_opname"
  | "opname_op_locatie"
  | "klein_simpel"
  | "middel_complex"
  | "project";

export const TRIAGE_LABEL: Record<QuoteTriage, string> = {
  remote_opname: "Op afstand beoordelen",
  opname_op_locatie: "Opname op locatie",
  klein_simpel: "Klein en simpel",
  middel_complex: "Middel of complex",
  project: "Projecttraject",
};

/** Kleur van de triage-chip: hoe complexer, hoe meer aandacht. */
export const TRIAGE_KLEUR: Record<QuoteTriage, string> = {
  remote_opname: "bg-emerald-100 text-emerald-800",
  opname_op_locatie: "bg-sky-100 text-sky-800",
  klein_simpel: "bg-emerald-100 text-emerald-800",
  middel_complex: "bg-amber-100 text-amber-800",
  project: "bg-violet-100 text-violet-800",
};

const JA_NEE: Record<string, string> = { ja: "Ja", nee: "Nee" };
const JA_NEE_WEET_NIET: Record<string, string> = { ja: "Ja", nee: "Nee", weet_ik_niet: "Weet ik niet" };
const AANSLUITING: Record<string, string> = { "1_fase": "1-fase", "3_fase": "3-fase", weet_ik_niet: "Weet ik niet" };
const KABEL_LENGTE: Record<string, string> = { "5": "5 meter", "7_5": "7,5 meter" };
const KLEUR_FRONT: Record<string, string> = { zwart: "Zwart", wit: "Wit" };
const LAADTARIEF: Record<string, string> = {
  kostenvergoeding: "Alleen kostenvergoeding",
  kostenvergoeding_marge: "Kostenvergoeding plus een marge",
  adviseer_mij: "Adviseer mij",
};
const PLAATSING: Record<string, string> = {
  zo_snel_mogelijk: "Zo snel mogelijk",
  specifieke_maand: "In een specifieke maand",
};
const TYPE_ORGANISATIE: Record<string, string> = {
  vastgoedeigenaar: "Vastgoedeigenaar",
  vve: "VvE",
  projectontwikkelaar: "Projectontwikkelaar",
  parkeerexploitant: "Parkeerexploitant",
  bedrijf: "Bedrijf",
  anders: "Anders",
};
const TYPE_LOCATIE: Record<string, string> = {
  eigen_parkeerterrein: "Eigen parkeerterrein",
  parkeergarage: "Parkeergarage",
  bij_bedrijfspand: "Bij een bedrijfspand",
  vve_parkeerplaatsen: "VvE-parkeerplaatsen",
  anders: "Anders",
};
const EIGENDOM: Record<string, string> = { eigenaar: "Eigenaar", huurder: "Huurder" };
const BESTAAND_NIEUWBOUW: Record<string, string> = {
  bestaand: "Bestaande situatie",
  nieuwbouw_renovatie: "Nieuwbouw of renovatie",
};
const WIE_GAAT_LADEN: Record<string, string> = {
  bewoners: "Bewoners",
  medewerkers: "Medewerkers",
  bezoekers: "Bezoekers",
  publiek: "Publiek",
};
// Legacy: de laadtype-vraag is juli 2026 van de website verwijderd (alleen
// AC-aanbod); oude aanvragen hebben het veld nog en blijven zo leesbaar.
const LAADTYPE: Record<string, string> = { ac: "AC-laden", dc_snelladen: "DC-snelladen", adviseer_mij: "Adviseer mij" };

export const MAPS = {
  jaNee: JA_NEE,
  jaNeeWeetNiet: JA_NEE_WEET_NIET,
  aansluiting: AANSLUITING,
  kabelLengte: KABEL_LENGTE,
  kleurFront: KLEUR_FRONT,
  laadtarief: LAADTARIEF,
  plaatsing: PLAATSING,
  typeOrganisatie: TYPE_ORGANISATIE,
  typeLocatie: TYPE_LOCATIE,
  eigendom: EIGENDOM,
  bestaandNieuwbouw: BESTAAND_NIEUWBOUW,
  wieGaatLaden: WIE_GAAT_LADEN,
  laadtype: LAADTYPE,
};

/** Adresregel van een zakelijke aanvraag; oude aanvragen hebben één adres-string. */
export function zakelijkAdres(l: {
  adres?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}): string {
  return l.straat ? `${l.straat} ${l.huisnummer}, ${l.postcode} ${l.plaats}` : (l.adres ?? "");
}

/** Label opzoeken; valt terug op de ruwe waarde zodat er nooit een lege regel staat. */
export function label(map: Record<string, string>, waarde: string | null | undefined): string {
  if (!waarde) return "";
  return map[waarde] ?? waarde;
}

/** "2026-09" → "september 2026" */
export function maandLabel(waarde: string | null | undefined): string {
  if (!waarde) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(waarde);
  if (!m) return waarde;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

/** Leesbare bron-namen voor het Bron-filter en de lead-kop. */
export const SOURCE_LABELS: Record<string, string> = {
  manual: "Handmatig",
  contactformulier: "Contactformulier",
  configurator: "Configurator",
  offerte: "Offerte",
  "offerteformulier-particulier": "Offerteformulier (particulier)",
  "offerteformulier-zakelijk": "Offerteformulier (zakelijk)",
};

export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} kB`;
  return `${n} B`;
}
