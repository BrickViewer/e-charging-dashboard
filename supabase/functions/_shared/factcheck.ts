// Feitencontrole voor de blogmachine: een onafhankelijke Claude-call mét web-search die
// elke feitelijke claim in een blog verifieert vóór publicatie. Alles wat het imago of de
// geloofwaardigheid kan schaden (verkeerde cijfers, verzonnen bronnen, verlopen data,
// stellige juridische claims zonder basis) blokkeert publicatie als "critical".
/* eslint-disable @typescript-eslint/no-explicit-any */

import { clampScore, stripFaqSection } from "./blog.ts";
import type { BlogSource } from "./blog.ts";
import { validateSources } from "./blog.ts";
import { TRUSTED_DOMAINS_TEXT, isTrustedSource } from "./sources.ts";

export const FACTCHECK_SYSTEM = `Je bent een uiterst strenge, onafhankelijke FACTCHECKER voor een Nederlands B2B-bedrijf in laadinfrastructuur. Er staat reputatie op het spel: één aantoonbaar onjuist feit in een gepubliceerde blog schaadt de geloofwaardigheid van het bedrijf. Jij bent de laatste poort vóór publicatie. Je hebt de blog NIET geschreven; wees kritisch, niet welwillend. Controleer in het Nederlands en GEBRUIK web search om claims echt te verifiëren, niet alleen je parate kennis.

Je krijgt: DATUM VAN VANDAAG, de blog (titel + HTML-content), de FAQ en de opgegeven BRONNEN (naam + url).

Controleer systematisch:
1. CIJFERS EN BEDRAGEN: elk percentage, bedrag, aantal of meetwaarde met een bronvermelding — zoek de bron op en controleer of die dit werkelijk zegt. Een cijfer dat de bron niet noemt of anders noemt = incorrect.
2. BRONNEN: bestaat elke genoemde instantie en elk genoemd document (bv. een ACM-besluit, een monitor van Netbeheer Nederland) echt, en zegt het wat de blog beweert? Controleer elke opgegeven bron-url: bestaat de pagina en gaat hij over dit onderwerp (status "bevestigd"), is hij onbereikbaar/verdwenen ("dood"), of zegt hij iets anders dan beweerd ("onjuist_toegeschreven")?
3. DATA EN JAARTALLEN: kloppen jaartallen bij bronnen en gebeurtenissen? Kloppen "per <datum>"- en "vanaf <datum>"-claims ten opzichte van de datum van vandaag (iets aankondigen dat al gebeurd is, of als actueel brengen wat verlopen is, is een fout)?
4. JURIDISCH EN FINANCIEEL: stellige claims over wet- en regelgeving, subsidies, tarieven of verplichtingen zonder verifieerbare basis zijn gevaarlijk — controleer ze of markeer ze.
5. MERKRISICO: alles wat bij publicatie gênant of schadelijk zou zijn (aantoonbare onzin, tegenstrijdigheden binnen de tekst, beweringen over concurrenten of instanties die niet hard te maken zijn).
6. COMMERCIEEL RISICO: het bedrijf levert zelf laadpalen, installatie en beheer. Elke concrete prijs of prijsrange daarvoor in de blog (aanschaf laadpaal of laadstation, installatiekosten, meterkastwerk, beheer of abonnementen; ook "vanaf"-bedragen en marktgemiddelden) werkt als prijsanker en schaadt het bedrijf commercieel. Hetzelfde geldt voor adviezen om het aanbod te omzeilen (zelf online kopen, installeren zonder erkend installateur, beheer overslaan) en voor duur/goedkoop-framing van laadpalen of de diensten. Markeer zo'n claim met "commercial_risk": true, OOK ALS HET BEDRAG FEITELIJK KLOPT met de bron: feitelijke juistheid maakt een prijsanker niet minder schadelijk. Geef als correction altijd: verwijder het bedrag of advies en herschrijf naar de prijsbepalende factoren met een verwijzing naar een vrijblijvende offerte. Subsidie-, energie- en fiscale bedragen met bron en jaartal zijn GEEN commercieel risico.

DE LAT IS BEVESTIGING, NIET AANTOONBARE ONJUISTHEID. Je web-search is technisch beperkt tot deze gezaghebbende domeinen, en ALLEEN deze tellen als verificatie:
${TRUSTED_DOMAINS_TEXT}

- verdict "correct" UITSLUITEND als je de claim daadwerkelijk hebt teruggevonden op zo'n toegestane bron én die bron zegt wat de blog beweert. Niet gezocht, niet gevonden, alleen uit je parate kennis, of alleen aangetroffen op een site buiten de lijst: dat is NIET correct.
- verdict "unverifiable" voor alles wat je niet op een toegestane bron bevestigd krijgt, hoe plausibel of algemeen bekend het ook klinkt. Dit is GEEN mildere categorie: een onbevestigde bewering mag niet gepubliceerd worden. Geef als correction ALTIJD "verwijder deze claim" en benoem precies welk zinsdeel weg moet.
- verdict "incorrect" als een toegestane bron iets anders zegt dan de blog.
- severity: "critical" voor alles wat feitelijk, juridisch, financieel, getalsmatig of datum-gebonden is. "minor" uitsluitend voor niet-feitelijke, stilistische opmerkingen. Twijfel je tussen beide, kies dan "critical".
- Aanstaande wetgeving, datums die bronnen verschillend noemen en regelingen in beweging mogen ALLEEN blijven staan als een toegestane bron die status expliciet bevestigt, en dan uitsluitend mét dat voorbehoud in de tekst. Kun je de status niet bevestigen, dan is het "unverifiable" en moet het weg.
- Elke bron in de blog van een domein BUITEN de lijst hoort in sources_check met status "onjuist_toegeschreven": zulke verwijzingen moeten verdwijnen, ook als de inhoud toevallig klopt. Concurrenten, commerciële laadpaalsites, Wikipedia en vakmedia zijn nooit een geldige onderbouwing.
- brand_risk is alleen voor daadwerkelijk gênante, aantoonbare missers (evidente onzin, interne tegenspraak, onhoudbare claims over instanties of concurrenten) — geen speculatie over hoe een kritische lezer iets zóú kunnen opvatten.

Een blog krijgt alleen verdict "pass" als er GEEN ENKELE claim overblijft met verdict "incorrect" of "unverifiable" en geen enkele bron buiten de lijst. Bij twijfel: "fail".

Lever voor elke bron die je hebt geverifieerd de echte url aan in verified_sources — uitsluitend urls van de toegestane domeinen, nooit een verzonnen of gegokte url.

Houd het rapport COMPACT (het moet binnen het antwoordbudget passen): rapporteer maximaal de 18 belangrijkste claims (prioriteer incorrect en unverifiable; bundel identieke punten), houd elke correction beknopt (maximaal ~40 woorden), maximaal 8 verified_sources, en citeer nooit hele passages uit bronnen.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"claims": [{"claim": string, "verdict": "correct" | "incorrect" | "unverifiable", "severity": "critical" | "minor", "commercial_risk": boolean, "evidence_url": string, "correction": string}], "sources_check": [{"name": string, "url": string, "status": "bevestigd" | "dood" | "onjuist_toegeschreven"}], "date_issues": [string], "brand_risk": [string], "verified_sources": [{"name": string, "url": string, "publisher": string, "date": string}], "confidence": number, "verdict": "pass" | "fail"}`;

export interface FactcheckClaim {
  claim: string;
  verdict: "correct" | "incorrect" | "unverifiable";
  severity: "critical" | "minor";
  // Commercieel schadelijke claim (prijsanker/omzeil-advies): blokkeert publicatie, ook als de
  // claim feitelijk juist is. Zie categorie 6 in FACTCHECK_SYSTEM.
  commercial_risk: boolean;
  evidence_url: string | null;
  correction: string | null;
}

export interface FactcheckReport {
  claims: FactcheckClaim[];
  sources_check: Array<{ name: string; url: string; status: "bevestigd" | "dood" | "onjuist_toegeschreven" }>;
  date_issues: string[];
  brand_risk: string[];
  verified_sources: BlogSource[];
  /** Bronnen die de blog aanhaalt maar die buiten TRUSTED_DOMAINS vallen. Blokkeren altijd. */
  untrusted_sources: BlogSource[];
  confidence: number | null;
  verdict: "pass" | "fail";
  critical_count: number;
  fixable_count: number;
}

const asStr = (v: any, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** `postSources` zijn de bronnen die in de blog staan; die worden tegen de vertrouwde lijst gehouden. */
export function validateFactcheckJson(p: any, postSources: BlogSource[] = []): FactcheckReport {
  const claims: FactcheckClaim[] = (Array.isArray(p?.claims) ? p.claims : [])
    .filter((c: any) => c && typeof c.claim === "string")
    .slice(0, 25)
    .map((c: any) => ({
      claim: c.claim.trim().slice(0, 500),
      verdict: c.verdict === "correct" ? "correct" : c.verdict === "incorrect" ? "incorrect" : "unverifiable",
      severity: c.severity === "critical" ? "critical" : "minor",
      commercial_risk: c.commercial_risk === true,
      evidence_url: asStr(c.evidence_url),
      correction: asStr(c.correction),
    }));
  const sources_check = (Array.isArray(p?.sources_check) ? p.sources_check : [])
    .filter((s: any) => s && typeof s.name === "string")
    .slice(0, 20)
    .map((s: any) => ({
      name: s.name.trim().slice(0, 120),
      url: asStr(s.url, 500) ?? "",
      status: s.status === "bevestigd" ? "bevestigd" : s.status === "dood" ? "dood" : "onjuist_toegeschreven",
    }));
  const asList = (x: any) => (Array.isArray(x) ? x.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 10) : []);

  // ALLES wat niet bevestigd is, blokkeert. Severity speelt geen rol meer in de telling:
  // een claim die de controleur niet op een vertrouwd domein terugvond mag simpelweg niet
  // gepubliceerd worden, ook niet als "minor". Idem voor dode of verkeerd toegeschreven
  // bronnen en voor elke bron buiten TRUSTED_DOMAINS.
  //
  // Dit draait de versoepeling van 15 juli bewust terug. Die was nodig omdat blogs anders
  // bleven stranden; dat risico is nu ondervangen doordat VERWIJDEREN de standaardremedie is
  // (zie factcheckCorrections + FACTCHECK_FIX_SYSTEM): schrappen convergeert altijd, een
  // betere bron vinden niet.
  const brand_risk = asList(p?.brand_risk);
  const date_issues = asList(p?.date_issues);
  const untrusted_sources = postSources.filter((s) => !isTrustedSource(s.url));
  const badSources = sources_check.filter((s: { status: string }) => s.status !== "bevestigd").length;
  const critical_count =
    claims.filter((c) => c.verdict !== "correct" || c.commercial_risk).length
    + badSources
    + untrusted_sources.length;
  // Nog uitsluitend informatief (verschijnt in events/meldingen); stuurt het verdict niet.
  const fixable_count = brand_risk.length + date_issues.length;

  // Fail-safe: het model-verdict blijft leidend naar beneden (model zegt fail → fail) en
  // critical-claims overrulen een (te) mild "pass". Onverwachte JSON → fail (nooit per
  // ongeluk publiceren).
  const modelPass = p?.verdict === "pass";
  const verdict: "pass" | "fail" = modelPass && critical_count === 0 ? "pass" : "fail";

  return {
    claims,
    sources_check,
    date_issues,
    brand_risk,
    // Ook de door het model aangedragen bronnen langs de lijst: een verified_source van een
    // niet-toegestaan domein mag nooit als onderbouwing in de blog belanden.
    verified_sources: validateSources(p?.verified_sources).filter((s) => isTrustedSource(s.url)),
    untrusted_sources,
    confidence: clampScore(p?.confidence),
    verdict,
    critical_count,
    fixable_count,
  };
}

/** Concrete correcties voor de revise-keten: alleen de punten die publicatie blokkeren of verbeteren. */
export function factcheckIssues(report: FactcheckReport): string[] {
  const out: string[] = [];
  for (const c of report.claims) {
    if (c.commercial_risk) {
      out.push(`COMMERCIEEL RISICO (verplicht corrigeren): "${c.claim}" — ${c.correction ?? "verwijder het bedrag of advies en herschrijf naar de prijsbepalende factoren met een verwijzing naar een vrijblijvende offerte"}`);
      continue;
    }
    if (c.verdict === "correct") continue;
    const kop = c.verdict === "incorrect" ? "FEITENFOUT (verplicht corrigeren)" : "ONBEVESTIGD (verplicht verwijderen)";
    out.push(`${kop}: "${c.claim}" — ${c.correction ?? "verwijder deze claim"}${c.evidence_url ? ` (bron: ${c.evidence_url})` : ""}`);
  }
  for (const s of report.sources_check) {
    if (s.status === "onjuist_toegeschreven") out.push(`BRONFOUT (verplicht corrigeren): "${s.name}" zegt niet wat de blog beweert — herschrijf de claim naar wat de bron werkelijk zegt, of verwijder hem.`);
    if (s.status === "dood") out.push(`Dode bronlink: "${s.name}" (${s.url}) — verwijder de link en de claim die erop leunt.`);
  }
  for (const s of report.untrusted_sources) {
    out.push(`NIET-TOEGESTANE BRON (verplicht verwijderen): "${s.name}" (${s.url}) valt buiten de vertrouwde bronnenlijst — verwijder de link én elke bewering die alleen op deze bron steunt.`);
  }
  for (const d of report.date_issues) out.push(`Datumprobleem: ${d}`);
  for (const b of report.brand_risk) out.push(`MERKRISICO (verplicht corrigeren): ${b}`);
  return out.slice(0, 20);
}

/** Correctielijst voor de CHIRURGISCHE fix-stap: elk punt is een concrete, lokale ingreep.
 *  Ook correct-bevonden claims met een waarschuwende correctie (bv. "let op: verifieer of een
 *  VvE kwalificeert") blijven bewust weg: alleen punten die echt iets wijzigen. Max ~12. */
export function factcheckCorrections(report: FactcheckReport): string[] {
  const out: string[] = [];
  for (const c of report.claims) {
    if (c.commercial_risk) {
      out.push(`COMMERCIEEL RISICO: "${c.claim}" → ${c.correction ?? "verwijder het bedrag of advies; herschrijf naar de prijsbepalende factoren en verwijs naar een vrijblijvende offerte"}`);
      continue;
    }
    if (c.verdict === "correct") continue;
    // Onbevestigd = weg. Bewust GEEN uitwijk meer naar een voorbehoud-formulering: die liet
    // onbevestigde beweringen in de tekst staan en dat mag niet meer.
    out.push(`CLAIM: "${c.claim}" → ${c.correction ?? "VERWIJDER deze claim volledig"}`);
  }
  for (const s of report.sources_check) {
    if (s.status === "onjuist_toegeschreven") out.push(`BRON: "${s.name}" (${s.url}) zegt niet wat de blog beweert → herschrijf de betreffende zin naar wat de bron werkelijk zegt, of verwijder de zin.`);
    if (s.status === "dood") out.push(`BRON: "${s.name}" (${s.url}) is onbereikbaar → verwijder de link en de bewering die erop steunt.`);
  }
  for (const s of report.untrusted_sources) {
    out.push(`BRON BUITEN DE LIJST: "${s.name}" (${s.url}) → verwijder de link en elke bewering die alleen hierop steunt.`);
  }
  for (const d of report.date_issues) out.push(`DATUM: ${d}`);
  for (const b of report.brand_risk) out.push(`MERKRISICO: ${b} → herschrijf of verwijder de betreffende passage.`);
  return out.slice(0, 18);
}

// ── CHIRURGISCHE CORRECTIE ─────────────────────────────────────────────────────
// Gebruikt door content-revise (surgical-modus): past UITSLUITEND de correcties uit het
// factcheck-rapport toe op de bestaande HTML, zonder full rewrite. Een full rewrite zonder
// web-toegang introduceerde aantoonbaar nieuwe onverifieerde claims (15 juli: criticals
// 8→5→3, nooit 0); een lokale ingreep convergeert wél.
export const FACTCHECK_FIX_SYSTEM = `Je bent een uiterst precieze CORRECTOR voor een Nederlandse B2B-blog over laadinfrastructuur. Je krijgt een blog (titel + HTML-content + FAQ) en een CORRECTIELIJST uit een feitencontrole.

IJZEREN REGELS:
- Pas UITSLUITEND de punten uit de CORRECTIELIJST toe. Wijzig de betreffende zin(nen) minimaal en laat ALLE overige tekst LETTERLIJK ongemoeid: koppen, alinea's, tabellen, links, opsommingen en structuur blijven identiek.
- Verzin GEEN nieuwe feiten, cijfers, bronnen of urls. Zoek ook geen vervangende onderbouwing: je hebt geen web-toegang.
- ONBEVESTIGDE BEWERINGEN GAAN ERUIT. Staat er "VERWIJDER" of "ONBEVESTIGD" bij een punt, schrap de bewering dan echt: haal de zin of het zinsdeel weg en laat de rest lopend. Zwak hem NIET af met "naar verwachting", "mogelijk" of "circa" — een onbevestigde bewering met een slag om de arm is nog steeds een onbevestigde bewering. Alleen bij punten die expliciet als DATUM-kwestie zijn aangemerkt mag een voorbehoud blijven staan.
- Het artikel mag door dit schrappen korter worden. Dat is de bedoeling; lever nooit opvulling aan om de lengte te behouden.
- Raakt een correctie een FAQ-antwoord, corrigeer dan ook dat antwoord; geef anders de FAQ ongewijzigd terug.
- Geen herformuleringen "voor de leesbaarheid", geen stijlverbeteringen, geen nieuwe zinnen buiten de correcties.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"content": string, "faq": [{"question": string, "answer": string}] | null, "changes": [string]}
- content: de volledige gecorrigeerde HTML.
- faq: de volledige FAQ als er iets in wijzigde, anders null.
- changes: per toegepast punt één korte zin wat je hebt aangepast.`;

export interface FactcheckFix {
  content: string;
  faq: Array<{ question: string; answer: string }> | null;
  changes: string[];
}

/** Valideert de output van de chirurgische fix. De lengte-guard vangt een stiekeme full rewrite of
 *  een afgekapte emissie. Sinds verwijderen de standaardremedie is, is fors inkorten juist correct
 *  gedrag: de grens ging daarom van 70% naar 50%. Zakt een artikel daaronder, dan bestond het
 *  grotendeels uit onbevestigde beweringen en hoort het niet gepubliceerd te worden. */
export function validateFixJson(p: any, originalContent: string): FactcheckFix {
  if (!p || typeof p.content !== "string" || !p.content.trim()) {
    throw new Error("Ongeldige fix-JSON: content ontbreekt");
  }
  const content = stripFaqSection(p.content);
  if (content.length < originalContent.length * 0.5) {
    throw new Error(`Fix-output verdacht kort (${content.length} vs ${originalContent.length} tekens) — geweigerd`);
  }
  const faq = Array.isArray(p.faq)
    ? p.faq.filter((f: any) => f && typeof f.question === "string" && typeof f.answer === "string").slice(0, 5)
    : null;
  const changes = Array.isArray(p.changes)
    ? p.changes.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 15)
    : [];
  return { content, faq: faq && faq.length ? faq : null, changes };
}
