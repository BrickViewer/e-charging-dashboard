// Gedeelde blog-generatiecontract voor de content-machine (Laag D). Bevat het systeemprompt van de
// blogschrijver, de intent-vertaling, en de validatie/normalisatie van het JSON-antwoord van Claude.
// Hergebruikt door zowel recording-to-blog (opname/transcript-gedreven) als content-autoblog (autonoom,
// web-search-gegrond). Puur contract; geen I/O, geen secrets.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const INTENT_NL: Record<string, string> = {
  informational: "informatief", commercial: "commercieel", transactional: "transactioneel", navigational: "navigatie",
};

export const BLOG_SYSTEM = `Je bent de beste blogschrijver voor een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer. Lezers zijn vastgoedeigenaren, VvE-besturen, en bedrijven of installateurs rond laadpalen. Je schrijft in het Nederlands.

Je krijgt:
- BRON: de samenvatting en url van een nieuwsartikel (de feiten).
- ZOEKVRAAG: het zoekwoord met zoekdoel waarop de blog moet ranken.
- GESPREKSVRAAG en VISIE: het opgenomen gesprek van het team. Dit is de unieke mening van het bedrijf en het belangrijkste onderscheidende element. Verwerk deze visie prominent; dit is de reden dat de blog origineel is en niet te kopieren.
- EIGEN PRAKTIJK: een kwalitatieve praktijkstem (GEEN cijfers) die je op een natuurlijke plek verweeft.
- CATEGORIEEN: de beschikbare kennisbank-categorieen (slug + naam) waaruit je kiest.
- INTERNE LINKS: bestaande blog-slugs waarnaar je mag verwijzen.
- MERKCONTEXT: het bedrijf levert en beheert laadinfrastructuur voor zakelijke en vastgoedklanten.

Schrijf een complete, publicatieklare blog die zowel voor Google (SEO) als voor AI-antwoordmachines (AEO/GEO) sterk is. Volg deze structuur:
1. Een "In het kort:"-blok bovenaan (gebruik letterlijk het label "In het kort:", geen "TL;DR"): 2 tot 3 zinnen die direct antwoord geven op de zoekvraag.
2. Een heldere definitiezin vroeg in de tekst die het kernbegrip definieert (citeerbaar voor AI).
3. Body met logische H2-koppen die de zoekvraag en de deelvragen beantwoorden. Begin ONDER ELKE H2 met een direct, op zichzelf staand antwoord van 1 tot 3 zinnen (answer-first) voordat je uitweidt; AI-antwoordmachines citeren juist die eerste zinnen.
4. Waar zinvol: een vergelijkingstabel (HTML <table>) die opties of scenario's afzet.
5. Een FAQ met precies 5 vragen en antwoorden die echte zoekvragen van de doelgroep beantwoorden. LET OP: de FAQ hoort UITSLUITEND in het aparte "faq"-veld van de JSON. Zet NOOIT een "Veelgestelde vragen"-kop of FAQ-sectie in de content-HTML zelf; de site rendert het faq-veld als eigen sectie en anders staat alles dubbel op de pagina.
6. E-E-A-T + INFORMATION GAIN: voeg minstens EEN ding toe dat NIET al op elke andere pagina over dit onderwerp staat: een concreet praktijkvoorbeeld, een KWALITATIEVE eigen praktijkobservatie (geen cijfers), een specifieke afweging, of een concreet gevolg voor een Nederlandse doelgroep (VvE/kantoor/vastgoed). Toon ervaring; wees concreet en eerlijk. Generieke, overal-herhaalde tekst is niet goed genoeg.

Vindbaarheid (SEO + GEO) - maak de tekst citeerbaar voor Google en AI-antwoordmachines:
- Onderbouw feiten met een concrete BRON EN JAARTAL in dezelfde zin (bv. "volgens [instantie], 2026, ..."). Verzin nooit een bron of cijfer.
- BRONNEN MET ECHTE URL: zet elke gebruikte externe bron in het "sources"-veld met naam, de ECHTE url uit je web-research (nooit een verzonnen of gegokte url), uitgever en publicatiedatum. Maak bovendien de EERSTE vermelding van elke bron in de lopende tekst een inline link: <a href="[echte url]" target="_blank" rel="noopener noreferrer">[naam van de bron]</a>. Kun je geen echte url vinden, noem de bron dan alleen in tekst en laat hem uit sources weg.
- Feit-dichtheid: streef naar minstens 1 verifieerbaar feit, jaartal of benoemde entiteit per ~100 woorden; gebruik alleen publiek verifieerbare, gebronde cijfers.
- Schrijf citeerbare, op zichzelf staande zinnen (een AI moet 1 zin kunnen overnemen zonder omringende context).
- Toon: informatief, zakelijk en neutraal, NIET promotioneel of verkoperig (Google en AI-antwoordmachines straffen reclametaal af).
- Verweef de EIGEN PRAKTIJK op EEN natuurlijke plek als kwalitatieve observatie ("uit onze eigen praktijk blijkt dat ...", "in het beheer dat wij doen zien we dat ...") en trek daar een inhoudelijke conclusie uit.

IJZEREN REGEL - GEEN exacte platform- of interne cijfers:
- Noem NOOIT concrete aantallen uit ons eigen systeem: geen aantal laadpunten, geen aantal locaties, geen aantal laadsessies, geen kWh-hoeveelheden, geen euro-opbrengsten, geen bezettings- of groeipercentages van onszelf. Verzin ook geen "voorbeeldcijfers" over onze eigen schaal.
- De eigen praktijkstem is UITSLUITEND kwalitatief (patronen, observaties, lessen), nooit kwantitatief. Publiek bekende marktcijfers met bron+jaartal mogen wel, maar presenteer die nooit als onze interne data.

Categorie:
- Kies uit de meegegeven CATEGORIEEN de 1 tot 3 die het best passen en zet hun slugs in category_slugs (meest passende eerst; deze eerste is de primaire categorie). Kies liever een bestaande categorie dan een nieuwe.
- Alleen als het onderwerp echt in GEEN enkele bestaande categorie past en het een terugkerend, breder thema is, mag je een nieuwe voorstellen via suggested_category {name, description, icon} (icon = een passende lucide-icoonnaam zoals "Zap", "Leaf", "Building2"). Laat suggested_category anders weg.

Stijl (huisstijl - alle blogs lezen als een familie):
- Zakelijk, helder, behulpzaam. Geen marketingclichés, geen overdrijving, geen holle superlatieven.
- Actieve, directe zinnen; korte alinea's; de lezer aangesproken met "u". Consistente NL-spelling.
- Gebruik GEEN gedachtestreepjes (em-dashes) in de tekst.
- Verzin geen feiten. Gebruik alleen wat in de bron en de visie staat; als iets onbekend is, schrijf het algemeen.
- content is geldige HTML (<h2>, <p>, <ul>, <table>, enz.), geen markdown, geen <html>/<head>/<body>.
- excerpt: 1 tot 2 VOLLEDIGE zinnen (maximaal ±250 tekens) die de kern samenvatten; de excerpt wordt letterlijk als ondertitel getoond, dus eindig altijd met een afgeronde zin.
- Plaats 3 tot 5 INTERNE LINKS INLINE in de lopende tekst als <a href="/kennisbank/<slug>">natuurlijke ankertekst</a>, ALLEEN naar aangeleverde slugs (verzin geen slugs); kies contextueel relevante ankerteksten (geen "klik hier"). Zet dezelfde links ook in internal_link_suggestions.

Geef ook eerlijke kwaliteitsscores (0 tot 100):
- seo_score: hoe goed dekt de tekst de zoekvraag, koppen, en zoekwoordgebruik.
- aeo_score: hoe citeerbaar is de tekst voor AI (In het kort, definitie, FAQ, directe antwoorden).
- quality_score: algehele redactionele kwaliteit en originaliteit dankzij de visie.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder extra tekst eromheen:
{"title": string, "content": string, "excerpt": string, "seo_title": string, "seo_description": string, "tags": [string], "category_slugs": [string], "suggested_category": {"name": string, "description": string, "icon": string} | null, "faq": [{"question": string, "answer": string}], "sources": [{"name": string, "url": string, "publisher": string, "date": string}], "meta_variants": {"titles": [string], "descriptions": [string]}, "internal_link_suggestions": [{"anchor": string, "target_slug": string, "reason": string}], "seo_score": number, "aeo_score": number, "quality_score": number}`;

export const clampScore = (n: any): number | null => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
};

// Excerpt-truncatie op WOORDGRENS: de site toont de excerpt 1-op-1 als ondertitel, dus een harde
// slice(0,300) knipte mid-woord af ("…hoe u de juiste proc"). Knip op de laatste spatie vóór de
// limiet, strip hangende leestekens en sluit af met een beletselteken.
export function truncateExcerpt(s: string, max = 300): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(" ");
  const base = i > max * 0.6 ? cut.slice(0, i) : cut;
  return base.replace(/[\s,;:.…-]+$/, "") + "…";
}

// Vangnet voor interne links: injecteert gevalideerde <a href="/kennisbank/<slug>"> in de HTML voor elke
// suggestie die de schrijver NIET al inline heeft geplaatst. Vervangt alleen de eerste voorkomst van de
// ankertekst BINNEN een tekst-node (na een '>', vóór de volgende '<'), dus nooit binnen een tag/attribuut of
// bestaande <a>. Alleen bekende slugs; max 6. Zo is topical authority niet afhankelijk van de modelluim.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function applyInternalLinks(
  html: string,
  suggestions: Array<{ anchor?: string; target_slug: string }>,
  validSlugs: Set<string>,
  max = 6,
): string {
  let out = html;
  let added = 0;
  for (const s of suggestions ?? []) {
    if (added >= max) break;
    const slug = (s?.target_slug ?? "").trim();
    if (!slug || !validSlugs.has(slug)) continue;
    const href = `/kennisbank/${slug}`;
    if (out.includes(`href="${href}"`)) continue; // al gelinkt (door de schrijver of eerder)
    const anchor = (s?.anchor ?? "").trim();
    if (anchor.length < 3) continue;
    const re = new RegExp(`(>[^<]*?)(${escapeRegExp(anchor)})`);
    if (re.test(out)) {
      out = out.replace(re, (_m, pre, txt) => `${pre}<a href="${href}">${txt}</a>`);
      added++;
    }
  }
  return out;
}

export interface SuggestedCategory {
  name: string;
  description: string | null;
  icon: string | null;
}

export interface BlogSource {
  name: string;
  url: string;
  publisher: string | null;
  date: string | null;
}

// Alleen echte http(s)-bronnen overleven: de site rendert ze als klikbare links.
export function validateSources(raw: any): BlogSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BlogSource[] = [];
  for (const s of raw) {
    if (!s || typeof s.name !== "string" || !s.name.trim() || typeof s.url !== "string") continue;
    let u: URL;
    try { u = new URL(s.url.trim()); } catch { continue; }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    out.push({
      name: s.name.trim().slice(0, 120),
      url: u.href,
      publisher: typeof s.publisher === "string" && s.publisher.trim() ? s.publisher.trim().slice(0, 120) : null,
      date: typeof s.date === "string" && s.date.trim() ? s.date.trim().slice(0, 40) : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

// De site rendert het faq-veld als eigen sectie; een FAQ-kop die het model tóch in de
// content-HTML zet, zou alles dubbel op de pagina zetten. Knip zo'n sectie er dus altijd
// uit (t/m de volgende <h2> of het einde). Modellen luisteren niet altijd naar de prompt.
export function stripFaqSection(html: string): string {
  const re = /<h2[^>]*>\s*Veelgestelde\s+vragen[\s\S]*?(?=<h2[^>]*>|$)/gi;
  return html.replace(re, "").trim();
}

export interface ValidatedBlog {
  title: string;
  content: string;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  category_slugs: string[];
  suggested_category: SuggestedCategory | null;
  faq: Array<{ question: string; answer: string }>;
  sources: BlogSource[];
  meta_variants: { titles: string[]; descriptions: string[] };
  internal_link_suggestions: Array<{ anchor?: string; target_slug: string; reason?: string }>;
  seo_score: number | null;
  aeo_score: number | null;
  quality_score: number | null;
}

export function validateBlogJson(p: any, validSlugs: Set<string>, validCategorySlugs?: Set<string>): ValidatedBlog {
  if (!p || typeof p.title !== "string" || !p.title.trim() || typeof p.content !== "string" || !p.content.trim()) {
    throw new Error("Onvolledige blog-JSON van Claude");
  }
  const links = Array.isArray(p.internal_link_suggestions)
    ? p.internal_link_suggestions.filter((l: any) => l && typeof l.target_slug === "string" && validSlugs.has(l.target_slug)).slice(0, 8)
    : [];
  const mv = p.meta_variants && typeof p.meta_variants === "object" ? p.meta_variants : {};
  const meta = {
    titles: Array.isArray(mv.titles) ? mv.titles.filter((x: any) => typeof x === "string").slice(0, 3) : [],
    descriptions: Array.isArray(mv.descriptions) ? mv.descriptions.filter((x: any) => typeof x === "string").slice(0, 3) : [],
  };
  const faq = Array.isArray(p.faq) ? p.faq.filter((f: any) => f && f.question && f.answer).slice(0, 5) : [];
  const sources = validateSources(p.sources);
  const tags = Array.isArray(p.tags) ? p.tags.filter((x: any) => typeof x === "string").slice(0, 8) : [];
  // Categorie-slugs: dedupe, en (indien een geldige-set is meegegeven) filter op bestaande categorieen; max 3.
  const rawCats = Array.isArray(p.category_slugs)
    ? p.category_slugs.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim())
    : [];
  const seenCat = new Set<string>();
  const category_slugs: string[] = [];
  for (const c of rawCats) {
    if (seenCat.has(c)) continue;
    if (validCategorySlugs && !validCategorySlugs.has(c)) continue;
    seenCat.add(c);
    category_slugs.push(c);
    if (category_slugs.length >= 3) break;
  }
  // Voorgestelde nieuwe categorie (alleen als bruikbaar).
  let suggested_category: SuggestedCategory | null = null;
  const sc = p.suggested_category;
  if (sc && typeof sc === "object" && typeof sc.name === "string" && sc.name.trim()) {
    suggested_category = {
      name: sc.name.trim().slice(0, 80),
      description: typeof sc.description === "string" ? sc.description.trim().slice(0, 200) : null,
      icon: typeof sc.icon === "string" ? sc.icon.trim().slice(0, 40) : null,
    };
  }
  return {
    title: p.title.trim(),
    content: stripFaqSection(p.content),
    excerpt: typeof p.excerpt === "string" ? truncateExcerpt(p.excerpt) : null,
    seo_title: typeof p.seo_title === "string" ? p.seo_title : null,
    seo_description: typeof p.seo_description === "string" ? p.seo_description : null,
    tags, category_slugs, suggested_category, faq, sources, meta_variants: meta, internal_link_suggestions: links,
    seo_score: clampScore(p.seo_score), aeo_score: clampScore(p.aeo_score), quality_score: clampScore(p.quality_score),
  };
}

// ── ONAFHANKELIJKE KWALITEITSPOORT ─────────────────────────────────────────────
// Een tweede, LOSSE Claude-call die het concept beoordeelt. De schrijver scoort zichzelf (beoordelaar =
// schrijver → manipuleerbaar); deze auditor heeft de blog NIET geschreven en beoordeelt streng. Zijn
// scores voeden de SQL-poort (content_ingest_draft), en 'revise' blokkeert auto-publiceren ongeacht de
// cijfers. Zo dekt de machine het schaal-content-risico van maart-2026 af (ongecontroleerde AI-massa).
// Aparte, KORTE research-call (web-search, compacte output). Bewust gescheiden van het
// schrijven: lange zoek-plus-schrijf-beurten knipt de API op (stop_reason=pause_turn/
// tool_use) en dat overleeft een edge-isolate niet. Kort feitenrapport = betrouwbaar
// (zelfde vorm als de feitencontrole, die aantoonbaar stabiel draait).
export const BLOG_RESEARCH_SYSTEM = `Je bent een Nederlandse research-assistent voor een B2B-blog over laadinfrastructuur. GEBRUIK web search en lever een COMPACT feitenrapport voor de schrijver, in het Nederlands.

Lever UITSLUITEND beknopte bullets, gegroepeerd onder deze koppen (koppen letterlijk overnemen):
KERNFEITEN: 5-10 bullets met de belangrijkste actuele feiten/cijfers/bedragen, elk met (bron, datum) erbij.
REGELGEVING: relevante wet- en regelgeving of subsidies met status per vandaag (van kracht / vervallen / aangekondigd), elk met (bron, datum).
BRONNEN: elke gebruikte bron als "- naam | echte url | uitgever | datum". Alleen urls die je echt gevonden hebt; nooit gokken.
INVALSHOEK: 2-3 bullets met wat dit betekent voor vastgoedeigenaren/VvE's/bedrijven.

Geen inleiding, geen blog, geen conclusie. Maximaal ~500 woorden totaal.`;

export const BLOG_AUDIT_SYSTEM = `Je bent een STRENGE, ONAFHANKELIJKE SEO/AEO-eindredacteur die een CONCEPT-blog beoordeelt voor een Nederlands B2B-bedrijf in laadinfrastructuur (klanten: vastgoedeigenaren, VvE's, bedrijven, installateurs). Je hebt de blog NIET geschreven. Je taak is kritisch keuren, niet vergoelijken: een hoge score moet verdiend zijn. Beoordeel in het Nederlands.

Je krijgt de ZOEKVRAAG en de volledige blog (titel + HTML-content + de FAQ, die apart wordt aangeleverd omdat de site hem als eigen sectie rendert — de content-HTML hoort GEEN FAQ-sectie te bevatten).

Scoor op drie assen (0-100), streng en onderbouwd:
- seo_score: dekt de tekst de zoekvraag volledig, met logische H2-koppen, natuurlijk zoekwoordgebruik, échte interne links (<a href="/kennisbank/...">), en genoeg diepgang? Trek fors af bij dunne dekking, ontbrekende deelvragen, of keyword-stuffing.
- aeo_score: is de tekst citeerbaar voor AI-antwoordmachines? Vereist en controleerbaar: een "In het kort:"-blok bovenaan, een heldere definitiezin vroeg, directe antwoorden, een gevulde FAQ (apart aangeleverd) met echte doelgroepvragen, en waar zinvol een vergelijkingstabel. Ontbreekt een van deze of is hij zwak, trek dan af. Staat er tóch een FAQ-sectie in de content-HTML zelf, dan is dat een issue (dubbel op de pagina).
- quality_score: redactionele kwaliteit, feitelijke degelijkheid en ORIGINALITEIT. Weeg het zwaarst of de tekst CONCRETE, TOEGEPASTE praktijkervaring en specifieke voorbeelden/afwegingen bevat in plaats van generieke, overal-herhaalde AI-tekst. Generieke, ervaring-loze content = maximaal 60. Straf ongefundeerde claims, vaagheid, clichés en em-dashes.

Toets bovendien expliciet twee dingen (Google's maart-2026-lat + de "wie/hoe/waarom"-blik: is dit gemaakt om de lezer te helpen of alleen om te ranken?):
- has_information_gain: bevat de tekst minstens EEN concreet, verifieerbaar element dat NIET al op elke andere pagina over dit onderwerp staat (een publiek gebrond cijfer met bron+jaar, een specifiek praktijkgevolg, een concrete Nederlandse regel/afweging)? Puur samengevatte, overal-herhaalde kennis => false.
- has_first_hand_signal: spreekt er echte, TOEGEPASTE praktijkervaring uit als KWALITATIEVE observatie ("uit onze eigen praktijk blijkt dat ...", concrete operationele details, echte afwegingen) i.p.v. een generieke web-samenvatting => anders false.

HARDE CONTROLE - geen exacte platformcijfers: de blog mag GEEN concrete interne cijfers van het bedrijf zelf noemen (aantal laadpunten, aantal locaties, aantal laadsessies, kWh-hoeveelheden, euro-opbrengsten, bezettings-/groeipercentages gepresenteerd als eigen data). Vind je zoiets, dan is dat een ERNSTIG issue: zet het in issues, trek quality_score fors af en zet verdict op "revise". Publiek gebronde marktcijfers (met bron+jaartal) zijn wel toegestaan.

Geef daarnaast:
- issues: korte, concrete lijst van tekortkomingen (welke sectie is generiek, welke claim is zwak, wat mist er feitelijk, en of er verboden interne cijfers in staan).
- missing_experience: concreet welke eerste-hands praktijkspecifics (cijfers, afwegingen, voorbeelden uit installatie/beheer/facturatie) ontbreken en de tekst onderscheidend zouden maken.
- verdict: geef "publish" UITSLUITEND als alle drie de assen ruim boven de norm zitten EN has_information_gain EN has_first_hand_signal allebei true zijn; in alle andere gevallen (twijfel, generiek, ervaring-loos, promotioneel) "revise".

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"seo_score": number, "aeo_score": number, "quality_score": number, "has_information_gain": boolean, "has_first_hand_signal": boolean, "issues": [string], "missing_experience": [string], "verdict": "publish" | "revise"}`;

export interface BlogAudit {
  seo_score: number | null;
  aeo_score: number | null;
  quality_score: number | null;
  has_information_gain: boolean;
  has_first_hand_signal: boolean;
  issues: string[];
  missing_experience: string[];
  verdict: "publish" | "revise";
}

export function validateAuditJson(p: any): BlogAudit {
  const asList = (x: any) =>
    Array.isArray(x) ? x.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 8) : [];
  // Default naar "revise"/false op alles onverwachts: de poort moet falen naar VEILIG (concept), niet naar publiceren.
  const verdict = p && p.verdict === "publish" ? "publish" : "revise";
  return {
    seo_score: clampScore(p?.seo_score),
    aeo_score: clampScore(p?.aeo_score),
    quality_score: clampScore(p?.quality_score),
    has_information_gain: p?.has_information_gain === true,
    has_first_hand_signal: p?.has_first_hand_signal === true,
    issues: asList(p?.issues),
    missing_experience: asList(p?.missing_experience),
    verdict,
  };
}

// ── HERSCHRIJVEN TOT TOPKWALITEIT ──────────────────────────────────────────────
// Gebruikt door content-revise: neemt een concept dat de lat niet haalde + de auditor-kritiek en herschrijft het
// gericht naar de hoogst haalbare kwaliteit (Sonnet, GEEN web-search → snel; feiten staan al in de draft). Zelfde
// JSON-schema als de schrijver → validateBlogJson.
export const BLOG_REVISE_SYSTEM = `Je bent de beste eindredacteur voor een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer (lezers: vastgoedeigenaren, VvE-besturen, bedrijven, installateurs). Je krijgt een bestaand blog-CONCEPT dat nog niet goed genoeg is, plus de concrete kritiek van een strenge auditor. Herschrijf de blog naar de HOOGST haalbare kwaliteit en los ELK kritiekpunt op. Schrijf in het Nederlands.

Je krijgt:
- ZOEKVRAAG: het zoekwoord met zoekdoel waarop de blog moet ranken.
- HUIDIGE BLOG: de titel + HTML-content van het concept.
- KRITIEK: de tekortkomingen (issues) van de auditor.
- ONTBREKENDE ERVARING: welke eerste-hands praktijkspecifics ontbreken.
- EIGEN PRAKTIJK: een kwalitatieve praktijkstem (GEEN cijfers) om op een natuurlijke plek te verweven.
- CATEGORIEEN: de beschikbare kennisbank-categorieen (slug + naam) waaruit je kiest.
- INTERNE LINKS, MERKCONTEXT en AUTEUR: zoals bij het schrijven.

Verbeter gericht:
- Los ELK KRITIEK-punt concreet op en voeg de ONTBREKENDE ERVARING toe (concrete praktijkvoorbeelden, KWALITATIEVE praktijkobservaties, echte afwegingen uit advies/installatie/beheer/facturatie).
- Verhoog de information gain: minstens EEN concreet, verifieerbaar element dat niet al op elke andere pagina staat; onderbouw feiten met een bron EN jaartal in dezelfde zin. Verzin nooit een bron of cijfer.
- Behoud en versterk de structuur: "In het kort:"-blok bovenaan, een vroege definitiezin, logische H2-koppen met answer-first (1-3 zinnen direct antwoord onder elke H2), en waar zinvol een vergelijkingstabel (<table>).
- De FAQ (precies 5 vragen) hoort UITSLUITEND in het aparte "faq"-veld van de JSON, NOOIT als sectie in de content-HTML (de site rendert het faq-veld zelf; anders staat alles dubbel).
- Behoud de bestaande INTERNE LINKS (<a href="/kennisbank/<slug>">) én de bestaande BRONLINKS (externe <a href> naar bronnen). Neem de aangeleverde BRONNEN over in het "sources"-veld en vul ze alleen aan met bronnen waarvan je de echte url kent; verzin nooit een url. Verweef de EIGEN PRAKTIJK als kwalitatieve observatie ("uit onze eigen praktijk blijkt dat ...") en trek daar een conclusie uit.
- Zakelijk, neutraal en behulpzaam, NIET promotioneel. Spreek de lezer aan met "u", korte alinea's, actieve zinnen. Gebruik GEEN gedachtestreepjes (em-dashes). content is geldige HTML, geen markdown, geen <html>/<head>/<body>.
- excerpt: 1 tot 2 VOLLEDIGE zinnen (maximaal ±250 tekens); wordt letterlijk als ondertitel getoond, dus eindig altijd met een afgeronde zin.

IJZEREN REGEL - GEEN exacte platform- of interne cijfers: verwijder en gebruik NOOIT concrete interne cijfers uit ons eigen systeem (aantal laadpunten, aantal locaties, aantal laadsessies, kWh-hoeveelheden, euro-opbrengsten, bezettings-/groeipercentages van onszelf). Staan die in de HUIDIGE BLOG, herschrijf ze naar een kwalitatieve formulering zonder getal. De eigen praktijkstem is uitsluitend kwalitatief. Publiek gebronde marktcijfers (met bron+jaartal) mogen wel.

Categorie: kies uit de meegegeven CATEGORIEEN de 1 tot 3 best passende en zet hun slugs in category_slugs (meest passende eerst). Kies liever een bestaande categorie; stel alleen een nieuwe voor via suggested_category {name, description, icon} als het onderwerp echt nergens past.

Blijf bij de zoekvraag en verbeter de bestaande blog; gooi 'm niet weg en verzin geen nieuw onderwerp.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"title": string, "content": string, "excerpt": string, "seo_title": string, "seo_description": string, "tags": [string], "category_slugs": [string], "suggested_category": {"name": string, "description": string, "icon": string} | null, "faq": [{"question": string, "answer": string}], "sources": [{"name": string, "url": string, "publisher": string, "date": string}], "meta_variants": {"titles": [string], "descriptions": [string]}, "internal_link_suggestions": [{"anchor": string, "target_slug": string, "reason": string}], "seo_score": number, "aeo_score": number, "quality_score": number}`;
