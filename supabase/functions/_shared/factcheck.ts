// Feitencontrole voor de blogmachine: een onafhankelijke Claude-call mét web-search die
// elke feitelijke claim in een blog verifieert vóór publicatie. Alles wat het imago of de
// geloofwaardigheid kan schaden (verkeerde cijfers, verzonnen bronnen, verlopen data,
// stellige juridische claims zonder basis) blokkeert publicatie als "critical".
/* eslint-disable @typescript-eslint/no-explicit-any */

import { clampScore } from "./blog.ts";
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

Wees proportioneel: severity "critical" is voor claims die aantoonbaar onjuist, verzonnen of misleidend zijn, of juridisch/financieel riskant zonder basis. Severity "minor" is voor onnauwkeurigheden, gedateerde formuleringen of claims die je niet kon verifiëren maar plausibel zijn ("unverifiable" + minor). Een blog zonder critical-punten krijgt verdict "pass", ook als er minors zijn.

Lever bovendien voor elke bron die je tijdens het controleren hebt geverifieerd (ook nieuwe die je vond als betere onderbouwing) de echte url aan in verified_sources — nooit een verzonnen of gegokte url.

Geef per incorrect/unverifiable punt een concrete, direct bruikbare correctie (hoe de zin feitelijk juist zou worden, of "verwijder deze claim").

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
}

const asStr = (v: any, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function validateFactcheckJson(p: any): FactcheckReport {
  const claims: FactcheckClaim[] = (Array.isArray(p?.claims) ? p.claims : [])
    .filter((c: any) => c && typeof c.claim === "string")
    .slice(0, 40)
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

  // Alles wat aantoonbaar mis is telt als blokkade: incorrecte critical-claims,
  // verkeerd toegeschreven bronnen, en gemelde merkrisico's.
  const criticalClaims = claims.filter((c) => c.severity === "critical" && c.verdict !== "correct").length;
  const badSources = sources_check.filter((s: { status: string }) => s.status === "onjuist_toegeschreven").length;
  const brand_risk = asList(p?.brand_risk);
  const critical_count = criticalClaims + badSources + brand_risk.length;

  // Fail-safe: het verdict van het model telt, maar critical-punten overrulen een
  // (te) mild "pass" altijd. Onverwachte JSON → fail (nooit per ongeluk publiceren).
  const modelPass = p?.verdict === "pass";
  const verdict: "pass" | "fail" = modelPass && critical_count === 0 ? "pass" : "fail";

  return {
    claims,
    sources_check,
    date_issues: asList(p?.date_issues),
    brand_risk,
    verified_sources: validateSources(p?.verified_sources),
    confidence: clampScore(p?.confidence),
    verdict,
    critical_count,
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
