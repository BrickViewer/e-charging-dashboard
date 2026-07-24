// De ENIGE bronnenlijst van de contentmachine. Zowel de schrijffase (research) als de feitencontrole
// zoeken uitsluitend binnen deze domeinen, via `allowed_domains` op de web_search-tool. Dat is een
// harde technische grens: het model kán niet buiten de lijst zoeken, het is geen promptinstructie.
//
// Waarom: een telling over de gepubliceerde artikelen liet Wikipedia, obscure domeinen en meerdere
// DIRECTE CONCURRENTEN (qcharge, laaddirect, laadpunt, oplaadpuntzoeken, shuttel, tanqyou) als bron
// zien. Een kennisbankartikel mag alleen leunen op gezaghebbende, primaire bronnen.
//
// HOUD DE LIJST KORT. De API weigert een te lange domeinfilter met error_code `request_too_large`.
// Voeg alleen toe wat echt primair is; brancheorganisaties en vakmedia horen hier bewust NIET.

/** Kale domeinen zonder schema of www — exact het formaat dat `allowed_domains` verwacht.
 *  Subdomeinen vallen automatisch onder het hoofddomein. */
export const TRUSTED_DOMAINS: string[] = [
  // Overheid, wetgeving en toezicht
  "rijksoverheid.nl",
  "overheid.nl",
  "wetten.overheid.nl",
  "zoek.officielebekendmakingen.nl",
  "internetconsultatie.nl",
  "rvo.nl",
  "acm.nl",
  "cbs.nl",
  "iplo.nl",
  "ilent.nl",
  "belastingdienst.nl",
  "rdw.nl",
  "eur-lex.europa.eu",
  // Netbeheerders (netcongestie, aansluitingen, capaciteit)
  "netbeheernederland.nl",
  "liander.nl",
  "stedin.net",
  "enexis.nl",
  "tennet.eu",
  // Kennisinstituten en normalisatie
  "elaad.nl",
  "nklnederland.nl",
  "tno.nl",
  "nen.nl",
  "pbl.nl",
];

/** Leesbare opsomming voor in de prompts, zodat schrijver en controleur dezelfde lijst zien. */
export const TRUSTED_DOMAINS_TEXT = TRUSTED_DOMAINS.join(", ");

/** Valt deze url binnen de lijst? Vergelijkt op hostname, inclusief subdomeinen
 *  (data.rvo.nl telt als rvo.nl). Een onparseerbare url is per definitie niet vertrouwd. */
export function isTrustedSource(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return TRUSTED_DOMAINS.some((d) => {
    const bare = d.split("/")[0].toLowerCase();
    return host === bare || host.endsWith(`.${bare}`);
  });
}
