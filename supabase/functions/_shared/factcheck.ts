// Feitencontrole voor de blogmachine: een onafhankelijke Claude-call mét web-search die
// elke feitelijke claim in een blog verifieert vóór publicatie. Alles wat het imago of de
// geloofwaardigheid kan schaden (verkeerde cijfers, verzonnen bronnen, verlopen data,
// stellige juridische claims zonder basis) blokkeert publicatie als "critical".
/* eslint-disable @typescript-eslint/no-explicit-any */

import { clampScore, stripFaqSection } from "./blog.ts";
import type { BlogSource } from "./blog.ts";
import { validateSources } from "./blog.ts";

export const FACTCHECK_SYSTEM = `Je bent een uiterst strenge, onafhankelijke FACTCHECKER voor een Nederlands B2B-bedrijf in laadinfrastructuur. Er staat reputatie op het spel: één aantoonbaar onjuist feit in een gepubliceerde blog schaadt de geloofwaardigheid van het bedrijf. Jij bent de laatste poort vóór publicatie. Je hebt de blog NIET geschreven; wees kritisch, niet welwillend. Controleer in het Nederlands en GEBRUIK web search om claims echt te verifiëren, niet alleen je parate kennis.

Je krijgt: DATUM VAN VANDAAG, de blog (titel + HTML-content), de FAQ en de opgegeven BRONNEN (naam + url).

Controleer systematisch:
1. CIJFERS EN BEDRAGEN: elk percentage, bedrag, aantal of meetwaarde met een bronvermelding — zoek de bron op en controleer of die dit werkelijk zegt. Een cijfer dat de bron niet noemt of anders noemt = incorrect.
2. BRONNEN: bestaat elke genoemde instantie en elk genoemd document (bv. een ACM-besluit, een monitor van Netbeheer Nederland) echt, en zegt het wat de blog beweert? Controleer elke opgegeven bron-url: bestaat de pagina en gaat hij over dit onderwerp (status "bevestigd"), is hij onbereikbaar/verdwenen ("dood"), of zegt hij iets anders dan beweerd ("onjuist_toegeschreven")?
3. DATA EN JAARTALLEN: kloppen jaartallen bij bronnen en gebeurtenissen? Kloppen "per <datum>"- en "vanaf <datum>"-claims ten opzichte van de datum van vandaag (iets aankondigen dat al gebeurd is, of als actueel brengen wat verlopen is, is een fout)?
4. JURIDISCH EN FINANCIEEL: stellige claims over wet- en regelgeving, subsidies, tarieven of verplichtingen zonder verifieerbare basis zijn gevaarlijk — controleer ze of markeer ze.
5. MERKRISICO: alles wat bij publicatie gênant of schadelijk zou zijn (aantoonbare onzin, tegenstrijdigheden binnen de tekst, beweringen over concurrenten of instanties die niet hard te maken zijn).

Wees proportioneel — de lat voor "critical" is AANTOONBAARHEID, niet twijfel:
- severity "critical" UITSLUITEND bij: (a) een claim die aantoonbaar in strijd is met een gezaghebbende primaire bron (wet- en regelgeving, ACM, RVO, CBS, officiële publicaties); (b) een verzonnen bron, citaat of cijfer; (c) juridisch/financieel advies dat aantoonbaar onjuist is en de lezer kan schaden; (d) een dode of verkeerd toegeschreven PRIMAIRE bron.
- Bij tegenstrijdige, onduidelijke of nog niet uitgekristalliseerde informatie (bv. aanstaande wetgeving, datums die bronnen verschillend noemen, regelingen in beweging): NIET blokkeren. Dat is severity "minor" met als correctie een concrete voorbehoud-formulering ("schrijf: naar verwachting / nog niet definitief / bronnen noemen verschillende datums").
- Een onnauwkeurige toeschrijving aan een SECUNDAIRE bron (nieuwssites, blogs, brancheportalen): severity "minor" met als fix de link vervangen of de toeschrijving verwijderen; in sources_check géén "onjuist_toegeschreven" voor secundaire bronnen tenzij de blog de bron iets wezenlijks in de mond legt.
- brand_risk is alleen voor daadwerkelijk gênante, aantoonbare missers (evidente onzin, interne tegenspraak, onhoudbare claims over instanties of concurrenten) — geen speculatie over hoe een kritische lezer iets zóú kunnen opvatten.
Een blog zonder critical-punten krijgt verdict "pass", ook als er minors zijn.

Lever bovendien voor elke bron die je tijdens het controleren hebt geverifieerd (ook nieuwe die je vond als betere onderbouwing) de echte url aan in verified_sources — nooit een verzonnen of gegokte url.

Geef per incorrect/unverifiable punt een concrete, direct bruikbare correctie (hoe de zin feitelijk juist zou worden, of "verwijder deze claim").

Houd het rapport COMPACT (het moet binnen het antwoordbudget passen): rapporteer maximaal de 12 belangrijkste claims (prioriteer incorrect en critical; bundel identieke punten), houd elke correction beknopt (maximaal ~40 woorden, bij voorkeur één vervangzin), maximaal 8 verified_sources, en citeer nooit hele passages uit bronnen.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"claims": [{"claim": string, "verdict": "correct" | "incorrect" | "unverifiable", "severity": "critical" | "minor", "evidence_url": string, "correction": string}], "sources_check": [{"name": string, "url": string, "status": "bevestigd" | "dood" | "onjuist_toegeschreven"}], "date_issues": [string], "brand_risk": [string], "verified_sources": [{"name": string, "url": string, "publisher": string, "date": string}], "confidence": number, "verdict": "pass" | "fail"}`;

export interface FactcheckClaim {
  claim: string;
  verdict: "correct" | "incorrect" | "unverifiable";
  severity: "critical" | "minor";
  evidence_url: string | null;
  correction: string | null;
}

export interface FactcheckReport {
  claims: FactcheckClaim[];
  sources_check: Array<{ name: string; url: string; status: "bevestigd" | "dood" | "onjuist_toegeschreven" }>;
  date_issues: string[];
  brand_risk: string[];
  verified_sources: BlogSource[];
  confidence: number | null;
  verdict: "pass" | "fail";
  critical_count: number;
  fixable_count: number;
}

const asStr = (v: any, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function validateFactcheckJson(p: any): FactcheckReport {
  const claims: FactcheckClaim[] = (Array.isArray(p?.claims) ? p.claims : [])
    .filter((c: any) => c && typeof c.claim === "string")
    .slice(0, 15)
    .map((c: any) => ({
      claim: c.claim.trim().slice(0, 500),
      verdict: c.verdict === "correct" ? "correct" : c.verdict === "incorrect" ? "incorrect" : "unverifiable",
      severity: c.severity === "critical" ? "critical" : "minor",
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

  // Blokkade UITSLUITEND op aantoonbaar onjuiste kritieke claims — precies wat de prompt
  // belooft ("een blog zonder critical-punten krijgt pass, ook met minors"). Verkeerd
  // toegeschreven/dode bronnen, datumpunten en merkrisico's zijn FIXABLE: ze gaan als
  // concrete correcties de chirurgische fix-stap in, maar vellen het verdict niet meer.
  // (De oude telling liet blogs met nul feitenfouten terminaal stranden op 15 juli.)
  const critical_count = claims.filter((c) => c.severity === "critical" && c.verdict !== "correct").length;
  const badSources = sources_check.filter((s: { status: string }) => s.status !== "bevestigd").length;
  const brand_risk = asList(p?.brand_risk);
  const date_issues = asList(p?.date_issues);
  const fixable_count = badSources + brand_risk.length + date_issues.length
    + claims.filter((c) => c.severity !== "critical" && c.verdict !== "correct").length;

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
    verified_sources: validateSources(p?.verified_sources),
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
    if (c.verdict === "correct") continue;
    const kop = c.severity === "critical" ? "FEITENFOUT (verplicht corrigeren)" : "Feitelijk aandachtspunt";
    out.push(`${kop}: "${c.claim}" — ${c.correction ?? "verifieer of verwijder deze claim"}${c.evidence_url ? ` (bron: ${c.evidence_url})` : ""}`);
  }
  for (const s of report.sources_check) {
    if (s.status === "onjuist_toegeschreven") out.push(`BRONFOUT (verplicht corrigeren): "${s.name}" zegt niet wat de blog beweert — herschrijf de claim naar wat de bron werkelijk zegt, of verwijder hem.`);
    if (s.status === "dood") out.push(`Dode bronlink: "${s.name}" (${s.url}) — vervang door een werkende url of verwijder de link.`);
  }
  for (const d of report.date_issues) out.push(`Datumprobleem: ${d}`);
  for (const b of report.brand_risk) out.push(`MERKRISICO (verplicht corrigeren): ${b}`);
  return out.slice(0, 15);
}

/** Correctielijst voor de CHIRURGISCHE fix-stap: elk punt is een concrete, lokale ingreep.
 *  Ook correct-bevonden claims met een waarschuwende correctie (bv. "let op: verifieer of een
 *  VvE kwalificeert") blijven bewust weg: alleen punten die echt iets wijzigen. Max ~12. */
export function factcheckCorrections(report: FactcheckReport): string[] {
  const out: string[] = [];
  for (const c of report.claims) {
    if (c.verdict === "correct") continue;
    out.push(`CLAIM: "${c.claim}" → ${c.correction ?? "verwijder deze claim of verzwak hem met een voorbehoud ('naar verwachting', 'nog niet definitief')"}`);
  }
  for (const s of report.sources_check) {
    if (s.status === "onjuist_toegeschreven") out.push(`BRON: "${s.name}" (${s.url}) zegt niet wat de blog beweert → herschrijf de betreffende zin naar wat de bron werkelijk zegt, of verwijder de bronverwijzing daar.`);
    if (s.status === "dood") out.push(`BRON: "${s.name}" (${s.url}) is onbereikbaar → verwijder de link (laat de bron desnoods alleen bij naam staan).`);
  }
  for (const d of report.date_issues) out.push(`DATUM: ${d}`);
  for (const b of report.brand_risk) out.push(`MERKRISICO: ${b} → herschrijf of verwijder de betreffende passage.`);
  return out.slice(0, 12);
}

// ── CHIRURGISCHE CORRECTIE ─────────────────────────────────────────────────────
// Gebruikt door content-revise (surgical-modus): past UITSLUITEND de correcties uit het
// factcheck-rapport toe op de bestaande HTML, zonder full rewrite. Een full rewrite zonder
// web-toegang introduceerde aantoonbaar nieuwe onverifieerde claims (15 juli: criticals
// 8→5→3, nooit 0); een lokale ingreep convergeert wél.
export const FACTCHECK_FIX_SYSTEM = `Je bent een uiterst precieze CORRECTOR voor een Nederlandse B2B-blog over laadinfrastructuur. Je krijgt een blog (titel + HTML-content + FAQ) en een CORRECTIELIJST uit een feitencontrole.

IJZEREN REGELS:
- Pas UITSLUITEND de punten uit de CORRECTIELIJST toe. Wijzig de betreffende zin(nen) minimaal en laat ALLE overige tekst LETTERLIJK ongemoeid: koppen, alinea's, tabellen, links, opsommingen, lengte en structuur blijven identiek.
- Verzin GEEN nieuwe feiten, cijfers, bronnen of urls. Is er voor een punt geen concrete correctie gegeven, verwijder de claim dan of verzwak hem met een voorbehoud ("naar verwachting", "nog niet definitief", "bronnen noemen verschillende datums").
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

/** Valideert de output van de chirurgische fix. De lengte-guard weigert output die >30% korter
 *  is dan het origineel: dat duidt op een stiekeme full rewrite of een afgekapte emissie. */
export function validateFixJson(p: any, originalContent: string): FactcheckFix {
  if (!p || typeof p.content !== "string" || !p.content.trim()) {
    throw new Error("Ongeldige fix-JSON: content ontbreekt");
  }
  const content = stripFaqSection(p.content);
  if (content.length < originalContent.length * 0.7) {
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
