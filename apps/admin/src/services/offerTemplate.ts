// ===========================================================================
// Offerte-sjabloon — HTML/CSS-pagina's die 1:1 "OFF laadpaal - Systeem.pdf"
// volgen (cover uit het "Black and white"-ontwerp + 4 briefpagina's). Elke
// pagina is een losse, off-screen A4-node (794 x 1123 px @ 96dpi) die
// offerPdf.ts met html2canvas naar een PDF-pagina rendert.
//
// De VASTE copy hieronder is verbatim overgenomen uit het bronsjabloon. Alle
// {placeholders} komen uit de offerte/instellingen (zie resolve()).
// ===========================================================================

import type { OfferDetails, OfferTemplateValues } from "./offerTypes";

const GREEN = "#05A500";
const GREEN_DARK = "#0a7d12";
const INK = "#3a3a3a";       // bodytekst (gemeten op de bron ~rgb(58,58,58))
const HEAD = "#1f1f1f";      // grote koppen + donkere sectiekoppen (pagina 3-4, gemeten ~rgb(28,28,28))
const MUTED = "#5b5b5b";
const FAINT = "#9a9a9a";
const BULLET = "#8f8d85";    // ☞-handje is grijs in de bron (~rgb(148,146,136))
const FOOT = "#565656";      // voettekst (gemeten ~rgb(54,54,54))
const HAIRLINE = "#D7D7D7";

export const PAGE_W = 794; // 210mm @ 96dpi
export const PAGE_H = 1123; // 297mm @ 96dpi
const PAD = 72; // marge l/r — gemeten op de bron (tekstkolom ~648px breed → zelfde regelafbreking)

const SENDER_CITY = "Zaltbommel";
const COMPANY_FOOTER = {
  left: ["Dwarsweg 8", "5301 KT Zaltbommel", "Telefoon: 0418 - 684272"],
  mid: ["www.e-charging.nl", "info@e-charging.nl"],
  right: ["KvK: 30241843", "BTW: NL8213.92.402.B01", "IBAN: NL33RABO0143928449"],
};

const FALLBACK_TEMPLATE: OfferTemplateValues = {
  defaultChargerModel: "Zaptec Go 2 Asphalt Black",
  loadBalancerModel: "Zaptec Sense",
  defaultEindgroepen: 1,
  defaultEindgroepAmperage: 32,
  defaultStelpostGraafwerk: 0,
  serviceFeePerKwh: 0.1,
  servicemonteurPerHour: 0,
  voorrijkostenPerKm: 0,
  toeslagWerkuur: 0,
  activatiekostenPerSocket: 0,
  betaalBijOpdrachtPct: 50,
  betaalBijStartPct: 0,
  betaalNaWerkPct: 50,
  echargingSignerName: "Willi-Jan Jonkers",
  echargingSignerFunction: "Directeur",
  defaultObjectTemplate: "",
  defaultBetreftTemplate: "Offerte laadinfrastructuur",
  defaultAanhef: "heer/mevrouw",
};

// --------------------------------------------------------------------------
export interface OfferTemplateData {
  quoteNumber: string;
  date?: string | null;
  company: string;
  // Freeze-override: bij verzenden vastgelegd regime (quotes.is_private). Leeg → afleiden uit 'geen bedrijf'.
  isPrivate?: boolean | null;
  contactName?: string | null;
  addressLine?: string | null; // legacy "straat, postcode plaats"
  numChargePoints?: number | null;
  totalInvestment: number | null;
  withManagement?: boolean;
  withInstallation?: boolean;
  durationMonths?: number | null;
  noticeMonths?: number | null;
  chargeTariffPerKwh?: number | null; // laadkosten
  idleFeePerMinute?: number | null; // blokkeertarief
  startFeePerSession?: number | null; // starttarief
  perHourFeePerHour?: number | null; // uurtarief (per uur aan de paal); null = niet tonen
  idleGraceMinutes?: number | null;
  validUntil?: string | null;
  offerDetails?: OfferDetails | null;
  offerTemplate?: OfferTemplateValues | null;
}

export interface OfferTemplateSignature {
  // Klant-ondertekening (rechts). Optioneel: bij interne/preview-render nog leeg.
  signerName?: string;
  signatureDataUrl?: string;
  date?: string | null;
  // E-Charging mede-ondertekening (links).
  echargingSignatureDataUrl?: string | null;
  echargingSignerName?: string | null;
  echargingSignerFunction?: string | null;
}

// --------------------------------------------------------------------------
const num2 = (n: number) => Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = (n: number) => Math.round(n || 0).toLocaleString("nl-NL");
const money2 = (n: number | null) => (n == null ? "—" : `€ ${num2(n)}`);
const invFmt = (n: number) => `€ ${int0(n)},--`;
const stelFmt = (n: number) => `€ ${int0(n)},-`;

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}
function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}
function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Geel markeren wanneer een veld leeg/niet ingesteld is — interne controle zodat
// alle informatie compleet in de offerte staat vóór versturen.
const HL = "#fff59d";
const yel = (t: string) => `<span style="background:${HL};border-radius:2px;padding:0 2px">${t}</span>`;
const mStr = (val: string, placeholder: string) => (val && val.trim()) ? esc(val) : yel(esc(placeholder));
// Geel = niet ingevuld (null/undefined). Een bewust ingevoerde 0 (bv. blokkeertarief 0,00) is een
// echte waarde → gewoon "€ 0,00", niet geel.
const mEur = (val: number | null | undefined) => (val != null) ? money2(val) : yel(money2(0));
const mInv = (val: number | null | undefined) => (val != null) ? invFmt(val) : yel(invFmt(0));
const mStel = (val: number | null | undefined) => (val != null) ? stelFmt(val) : yel(stelFmt(0));

// BTW (alleen voor de offerte-WEERGAVE bij particulieren; de pricing-engine blijft netto).
const VAT_RATE = 0.21;
const incl = (n: number) => n * (1 + VAT_RATE);
// Bedrag in de zakelijke offerte-stijl: schuingedrukt, onderstreept, met de label-tekst tussen haakjes erachter.
const priceAmt = (amount: string, label: string) =>
  `<div style="font-style:italic"><span style="text-decoration:underline">${amount}</span> ${label}</div>`;

// --------------------------------------------------------------------------
// Eén zichtbare tariefregel in het "afgesproken instellingen"-blok (volgorde = od.tariffOrder).
export interface TariffLine { label: string; amount: number | null; unit: string }

interface ResolvedModel {
  company: string; hasCompany: boolean; isPrivate: boolean; contactName: string; addr1: string; addr2: string;
  dateLong: string; dateShort: string; reference: string;
  onzeReferentie: string; object: string; betreft: string; aanhef: string;
  numChargePoints: number; numPoles: number; chargerModel: string; loadBalancer: string;
  withManagement: boolean; withInstallation: boolean;
  dateGap: number; aanhefGap: number;
  eindgroepen: number; eindgroepAmperage: number; leveringText: string; beheerIntroText: string; totalInvestment: number | null; stelpost: number | null;
  serviceFeePerKwh: number; laadkosten: number | null; blokkeertarief: number | null; starttarief: number | null; uurtarief: number | null;
  tariffLines: TariffLine[];
  overlegNaam: string; overlegDatum: string;
  servicemonteurPerHour: number; voorrijkostenPerKm: number; toeslagWerkuur: number; activatiekostenPerSocket: number;
  ingangsdatum: string;
  betaalBijOpdracht: number; betaalBijStart: number; betaalNaWerk: number;
  signerName: string;
  signerFunction: string;
}

function firstStr(...vals: Array<string | null | undefined>): string {
  for (const v of vals) if (typeof v === "string" && v.trim() !== "") return v;
  return "";
}
function firstNum(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function resolve(data: OfferTemplateData): ResolvedModel {
  const od: OfferDetails = data.offerDetails ?? {};
  const tpl: OfferTemplateValues = data.offerTemplate ?? FALLBACK_TEMPLATE;
  const n = firstNum(data.numChargePoints) ?? 0;

  let addr1 = firstStr(od.addressStreet);
  let addr2 = firstStr([od.addressPostalCode, od.addressCity].filter(Boolean).join(" "));
  if (!addr1 && !addr2 && data.addressLine) {
    const parts = data.addressLine.split(",").map((s) => s.trim());
    addr1 = parts[0] ?? "";
    addr2 = parts.slice(1).join(", ");
  }
  const dateIso = firstStr(od.offerDate, data.date) || new Date().toISOString();

  // Tariefregel-bedragen; welke regels + in welke volgorde komt verderop uit od.tariffOrder.
  const laadkosten = firstNum(data.chargeTariffPerKwh);
  const blokkeertarief = firstNum(data.idleFeePerMinute);
  const starttarief = firstNum(od.startFeePerSession, data.startFeePerSession);
  const uurtarief = firstNum(od.perHourFeePerHour, data.perHourFeePerHour);
  // key → regeldefinitie; welke + in welke volgorde komt uit od.tariffOrder (laatst aangezet bovenaan).
  const tariffDefs: Record<string, TariffLine> = {
    laadkosten: { label: "Laadkosten", amount: laadkosten, unit: "per kWh" },
    laadkostenGasten: { label: "Laadkosten gasten", amount: firstNum(od.laadkostenGasten), unit: "per kWh" },
    laadkostenEigenGebruik: { label: "Laadkosten eigen gebruik", amount: firstNum(od.laadkostenEigenGebruik), unit: "per kWh" },
    blokkeertarief: { label: "Blokkeertarief", amount: blokkeertarief, unit: "per minuut" },
    starttarief: { label: "Starttarief", amount: starttarief, unit: "per keer" },
    uurtarief: { label: "Tarief per uur", amount: uurtarief, unit: "per uur" },
  };
  const defaultOrder = ["laadkosten", "blokkeertarief", "starttarief", ...(uurtarief != null && uurtarief > 0 ? ["uurtarief"] : [])];
  const order = Array.isArray(od.tariffOrder) ? od.tariffOrder : defaultOrder;
  const tariffLines: TariffLine[] = order.map((k) => tariffDefs[k]).filter((l): l is TariffLine => !!l);

  return {
    // Particulier (geen bedrijf): val terug op de contactnaam zodat cover/briefkop een naam tonen.
    company: firstStr(data.company, od.tav, data.contactName),
    hasCompany: !!firstStr(data.company),
    // Particulier = geen bedrijf gekoppeld. Bij verzonden offertes leidt de opgeslagen vlag (freeze),
    // anders afleiden uit 'geen bedrijf'. Stuurt BTW-weergave, voorwaarden en toon.
    isPrivate: data.isPrivate ?? !firstStr(data.company),
    contactName: firstStr(od.tav, data.contactName),
    addr1, addr2,
    dateLong: fmtDateLong(dateIso),
    dateShort: fmtDateShort(dateIso),
    reference: data.quoteNumber || "",
    onzeReferentie: firstStr(od.onzeReferentie, data.quoteNumber),
    object: firstStr(od.object, tpl.defaultObjectTemplate),
    betreft: firstStr(od.betreft, tpl.defaultBetreftTemplate),
    aanhef: firstStr(od.aanhef, tpl.defaultAanhef),
    withManagement: data.withManagement !== false,
    withInstallation: data.withInstallation !== false,
    dateGap: firstNum(od.dateGapPx) ?? DATE_GAP_DEFAULT,
    aanhefGap: firstNum(od.aanhefGapPx) ?? AANHEF_GAP_DEFAULT,
    numChargePoints: n,
    numPoles: firstNum(od.numPoles, n) ?? n,
    chargerModel: firstStr(od.chargerModel, tpl.defaultChargerModel),
    loadBalancer: firstStr(od.loadBalancerModel, tpl.loadBalancerModel),
    eindgroepen: firstNum(od.eindgroepen, tpl.defaultEindgroepen) ?? tpl.defaultEindgroepen,
    eindgroepAmperage: firstNum(od.eindgroepAmperage, tpl.defaultEindgroepAmperage) ?? tpl.defaultEindgroepAmperage,
    leveringText: firstStr(od.leveringText, DEFAULT_LEVERING_TEXT),
    beheerIntroText: firstStr(od.beheerIntroText, DEFAULT_BEHEER_INTRO),
    totalInvestment: firstNum(data.totalInvestment),
    stelpost: firstNum(od.stelpostGraafwerk, tpl.defaultStelpostGraafwerk),
    serviceFeePerKwh: firstNum(od.serviceFeePerKwh, tpl.serviceFeePerKwh) ?? tpl.serviceFeePerKwh,
    laadkosten, blokkeertarief, starttarief, uurtarief, tariffLines,
    overlegNaam: firstStr(od.overlegNaam),
    overlegDatum: od.overlegDatum ? fmtDateLong(od.overlegDatum) : "",
    servicemonteurPerHour: firstNum(od.servicemonteurPerHour, tpl.servicemonteurPerHour) ?? 0,
    voorrijkostenPerKm: firstNum(od.voorrijkostenPerKm, tpl.voorrijkostenPerKm) ?? 0,
    toeslagWerkuur: firstNum(od.toeslagWerkuur, tpl.toeslagWerkuur) ?? 0,
    activatiekostenPerSocket: firstNum(od.activatiekostenPerSocket, tpl.activatiekostenPerSocket) ?? 0,
    ingangsdatum: od.ingangsdatum ? fmtDateLong(od.ingangsdatum) : "",
    betaalBijOpdracht: firstNum(od.betaalBijOpdrachtPct, tpl.betaalBijOpdrachtPct) ?? 0,
    betaalBijStart: firstNum(od.betaalBijStartPct, tpl.betaalBijStartPct) ?? 0,
    betaalNaWerk: firstNum(od.betaalNaWerkPct, tpl.betaalNaWerkPct) ?? 0,
    signerName: firstStr(od.echargingSignerName, tpl.echargingSignerName),
    signerFunction: firstStr(od.echargingSignerFunction, tpl.echargingSignerFunction),
  };
}

// ===========================================================================
// VASTE COPY — verbatim uit "OFF laadpaal - Systeem.pdf".
// ===========================================================================
const BEHEER_POINTS: Array<[string, string]> = [
  ["Eén persoonlijk dashboard", "In uw eigen online dashboard ziet u realtime wat uw palen doen: opbrengsten, verbruik en gebruik per paal. Eén plek voor inzicht, controle en rapportage. 24/7 inzichtelijk."],
  ["Uw palen blijven up en running", "Wij krijgen direct een melding bij een storing en lossen het meestal op voordat u het in de gaten heeft. Eerst op afstand; lukt dat niet, dan komen wij ter plaatse voor een diagnose. U en uw laadgebruikers kunnen de helpdesk 24/7 bereiken."],
  ["Doorlopende optimalisatie van rendement", "Wij analyseren continu het werkelijke gebruik van uw palen en stellen tarieven, blokkeerregels en tijdsvensters daarop af, met behulp van AI. Zo brengen uw palen het maximale op, ook als de markt of het gebruik verandert."],
  ["Hulp met ERE-onboarding", "Wij koppelen u aan onze partner die u begeleidt bij de ERE-aanvraag. De gegevens van uw laadpalen worden door ons rechtstreeks aan de ERE-inboeker verstrekt, zodat u hier geen omkijken naar heeft."],
  ["Elke maand geld op uw rekening", "Wij verzorgen transactieverwerking, facturatie en uitbetaling. Elke maand ontvangt u uw self-billing factuur en wij betalen uw opbrengst uit."],
  ["Prioriteit op reparaties", "Gaat er echter iets mis en is een bezoek op locatie nodig, dan komen wij met voorrang langs om uw paal weer aan de praat te krijgen. Hiervoor gelden vaste, vooraf bekende tarieven (zie de prijsstelling), zodat u nooit voor verrassingen komt te staan."],
];

// Standaard "Levering en installatie"-tekst (verbatim uit het sjabloon). Dit is de
// DEFAULT; per offerte te overschrijven via offer_details.leveringText (vrije tekst,
// alinea's gescheiden door een lege regel).
const LEVERING_INSTALLATIE: string[] = [
  "Het leveren, monteren en aansluiten van 10 stuks Zaptec Go 2 Asphalt Black gemonteerd op 5 stuks nieuwe laadpalen.",
  "T.b.v. de load balancing wordt er in de meterkast Zaptec Sense geplaatst. Deze Sense regelt het vermogen wat voor de laadpaal beschikbaar wordt gesteld t.o.v. het totaal afgenomen vermogen van de aansluiting. Tevens kan hiermee ook bij een dynamisch energiecontract op de voordeligste momenten van de dag worden geladen. Ook met opgewekte zonne-energie kan geladen worden.",
  "Meterkast wordt uitgebreid met 5 eindgroepen van 32A.",
];
export const DEFAULT_LEVERING_TEXT = LEVERING_INSTALLATIE.join("\n\n");

// Standaard begeleidende tekst op pagina 1 bij "alleen beheer" (scope zonder installatie). Beschrijft de
// aanpak/onboarding (geen herhaling van de BEHEER_POINTS-opsomming) en vult pagina 1. DEFAULT; per offerte te
// overschrijven via offer_details.beheerIntroText (alinea's gescheiden door een lege regel).
const BEHEER_INTRO: string[] = [
  "Uw laadpalen staan er al en wij zorgen dat ze maximaal voor u gaan renderen. Wij nemen uw bestaande laadinfrastructuur volledig onder onze hoede, zodat u er geen omkijken meer naar heeft.",
  "Wij starten met een opname op locatie: we controleren uw laadpalen en koppelen ze aan ons platform en uw eigen online dashboard. Op iedere paal plaatsen we een QR-code waarmee u en uw gebruikers een storing met één scan direct bij ons melden. Vanaf dat moment bewaken wij uw palen dag en nacht, verzorgen we de facturatie en uitbetaling en stellen we de tarieven continu bij voor het beste rendement.",
];
export const DEFAULT_BEHEER_INTRO = BEHEER_INTRO.join("\n\n");

const AANSPRAKELIJKHEID = "Iedere aansprakelijkheid van E-Charging B.V. is beperkt tot het bedrag dat in de desbetreffende gebeurtenis onder haar aansprakelijkheidsverzekering wordt uitbetaald.";
// Consument: geen brede aansprakelijkheidsuitsluiting (kan onredelijk bezwarend zijn, BW 6:233) — wettelijke rechten blijven.
const AANSPRAKELIJKHEID_CONSUMENT = "E-Charging B.V. is jegens u aansprakelijk overeenkomstig de wettelijke regels die voor consumenten gelden. Deze aanbieding beperkt uw wettelijke (consumenten)rechten niet.";
const AANPAK = "Voor de realisatie en beheer van uw laadpalen stellen wij een contactpersoon aan die de schakel vormt tussen u als opdrachtgever en E-Charging. Deze heeft tot taak om de met u gemaakte afspraken op een correcte manier uit te voeren en de realisatie aan te sturen.";

// ===========================================================================
// HTML-bouwstenen.
// ===========================================================================
function pageEl(inner: string, fontSize = 13): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    `width:${PAGE_W}px`, `height:${PAGE_H}px`, "box-sizing:border-box",
    "background:#ffffff", `color:${INK}`, "font-family:'Outfit',Arial,sans-serif",
    `font-size:${fontSize}px`, "line-height:1.4", "position:relative", "overflow:hidden",
    "-webkit-font-smoothing:antialiased",
  ].join(";");
  el.innerHTML = inner;
  return el;
}

// Eén header-regel als tabelrij: tekst-cel (rechts) + smalle cel met het vierkantje.
// html2canvas (1.4.1) negeert flexbox-align-items én top:% / top:px op absolute elementen,
// maar rendert table-cell vertical-align:middle wél correct -> betrouwbare verticale centrering.
const headerRow = (t: string) =>
  `<tr>` +
  `<td style="vertical-align:middle;text-align:right;height:19px;line-height:19px;padding:0 8px 0 0;white-space:nowrap">${t}</td>` +
  `<td style="vertical-align:middle;padding:0;width:6px"><div style="height:19px;display:flex;align-items:center"><div style="width:6px;height:6px;background:#8c8c8c"></div></div></td>` +
  `</tr>`;
const g = (t: string) => `<span style="color:${GREEN}">${t}</span>`;

function header(m: ResolvedModel, logoUrl: string | null, pageNum: number, total: number): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="E-Charging" style="height:72px;display:block" />`
    : `<div style="font-weight:600;color:${GREEN};font-size:34px">e-charging</div>`;
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>${logo}</div>
    <table style="border-collapse:collapse;margin-left:auto;color:${FAINT};font-size:10.5px"><tbody>
      ${headerRow(esc(m.dateShort) || "datum")}
      ${headerRow(esc(m.reference) || "referentie")}
      ${headerRow(`Pagina ${pageNum} van ${total}`)}
    </tbody></table>
  </div>
  <div style="border-top:1px solid ${HAIRLINE};margin-top:16px"></div>`;
}

function footer(): string {
  const col = (lines: string[], align: string) =>
    `<div style="text-align:${align};color:${FOOT};font-size:9px;line-height:1.6">${lines.map(esc).join("<br/>")}</div>`;
  return `
  <div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:34px">
    <div style="border-top:1px solid ${HAIRLINE};margin-bottom:8px"></div>
    <div style="display:flex;justify-content:space-between">
      ${col(COMPANY_FOOTER.left, "left")}${col(COMPANY_FOOTER.mid, "center")}${col(COMPANY_FOOTER.right, "right")}
    </div>
  </div>`;
}

// A4-geometrie voor de auto-paginering van de brief (tekstkader start op y172).
const CONTENT_TOP = 172;
const CONTENT_BOTTOM = 84;
const LETTER_FONT = 12.5;
const CONTENT_W = PAGE_W - 2 * PAD;
// Briefkop-witruimtes (px) — standaarden + ondergrens voor de auto-fit, en de
// veiligheidsmarge boven de footer-hairline (Note nooit doorgestreept).
const DATE_GAP_DEFAULT = 96;
const AANHEF_GAP_DEFAULT = 84;
const GAP_FLOOR = 16;
const FOOTER_CLEARANCE = 16;

// Een blok = één atomair stuk brief. marginTop staat LOS van de html zodat we 'm per
// pagina kunnen resetten (eerste blok op een vervolgpagina krijgt geen gat). keep =
// "houd bij het volgende blok" (geen weeskop onderaan een pagina).
interface Block { html: string; mt: number; keep?: boolean; brk?: boolean; tag?: "dateGap" | "aanhefGap" }

const bSec = (t: string, mt = 24, color: string = GREEN): Block =>
  ({ html: `<div style="font-weight:700;color:${color};text-decoration:underline">${esc(t)}</div>`, mt, keep: true });
const bBig = (html: string, mt = 34): Block =>
  ({ html: `<div style="text-align:center;font-size:26px;font-weight:700;color:${HEAD}">${html}</div>`, mt });
const bP = (html: string, mt = 22): Block => ({ html: `<p style="margin:0">${html}</p>`, mt });
// ☞-bullet (wijzende hand) — grijs, niet groen.
const bFb = (html: string, mt = 5): Block =>
  ({ html: `<div style="display:flex;gap:9px"><span style="color:${BULLET};flex:0 0 auto">☞</span><span>${html}</span></div>`, mt });
const bSub = (html: string, mt = 2): Block =>
  ({ html: `<div style="margin-left:30px;display:flex;gap:8px"><span style="color:${MUTED}">o</span><span>${html}</span></div>`, mt });
const bRaw = (html: string, mt: number, keep = false): Block => ({ html, mt, keep });

// Bouwt één briefpagina-node uit de toegewezen blokken. Eerste blok op een
// vervolgpagina (pageNum>1) krijgt margin-top 0; op pagina 1 behoudt het z'n eigen mt.
function assembleLetterPage(m: ResolvedModel, logoUrl: string | null, pageNum: number, total: number, blocks: Block[]): HTMLElement {
  const content = blocks
    .map((b, i) => `<div style="margin-top:${i === 0 ? (pageNum === 1 ? b.mt : 0) : b.mt}px">${b.html}</div>`)
    .join("");
  return pageEl(
    `<div style="position:absolute;left:${PAD}px;right:${PAD}px;top:62px">${header(m, logoUrl, pageNum, total)}</div>` +
    `<div style="position:absolute;left:${PAD}px;right:${PAD}px;top:${CONTENT_TOP}px;bottom:${CONTENT_BOTTOM}px">${content}</div>` +
    footer(),
    LETTER_FONT,
  );
}

// ===========================================================================
// PAGINA'S.
// ===========================================================================
function coverPage(m: ResolvedModel, logoUrl: string | null, coverUrl: string | null): HTMLElement {
  // De cover is het kant-en-klare "Black and white"-ontwerp (offer-cover.jpg, met logo +
  // "Offerte" + titel ingebakken). We leggen alleen de dynamische bedrijfsgegevens
  // linksonder op het lichte paneel, op de plek van het lege placeholder-vlak.
  const addr = `
    <div style="position:absolute;left:138px;bottom:96px;color:#2d2d2d;font-size:15px;line-height:1.6">
      <div style="font-weight:600">${esc(m.company)}</div>
      ${m.addr1 ? `<div>${esc(m.addr1)}</div>` : ""}
      ${m.addr2 ? `<div>${esc(m.addr2)}</div>` : ""}
    </div>`;

  if (coverUrl) {
    return pageEl(`
      <img src="${coverUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
      ${addr}
    `);
  }

  // Terugval als offer-cover.jpg ontbreekt: groen ontwerp dat het origineel benadert.
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="E-Charging" style="position:absolute;top:130px;left:138px;height:52px" />`
    : `<div style="position:absolute;top:130px;left:138px;font-weight:600;color:${GREEN};font-size:26px">e-charging</div>`;
  return pageEl(`
    <div style="position:absolute;inset:0;background:${GREEN_DARK}"></div>
    <div style="position:absolute;top:0;left:80px;bottom:0;width:52%;background:rgba(233,240,233,0.9)"></div>
    ${logo}
    <div style="position:absolute;top:455px;left:138px;font-style:italic;color:${MUTED};font-size:34px">Offerte</div>
    <div style="position:absolute;top:705px;left:138px;line-height:1.18">
      <div style="font-size:38px;font-weight:700;color:${INK}">Wij plaatsen</div>
      <div style="font-size:38px;font-weight:700;color:${INK}">uw laadpalen,</div>
      <div style="font-size:38px;font-weight:700;font-style:italic;color:${GREEN}">U verdient eraan</div>
    </div>
    ${addr}
  `);
}

// De volledige brief als geordende lijst losse blokken (sectie-kop = keep-with-next).
function letterBlocks(m: ResolvedModel, signature?: OfferTemplateSignature): Block[] {
  const blocks: Block[] = [];

  // --- Briefkop + Levering en installatie ---
  const recipient = [
    `<div>${mStr(m.company, "Bedrijfsnaam")}</div>`,
    // Bij een particulier (geen bedrijf) is de naamregel al de persoon → geen aparte T.a.v.-regel.
    m.hasCompany ? `<div>T.a.v. ${mStr(m.contactName, "tav")}</div>` : "",
    `<div>${mStr(m.addr1, "Adres")}</div>`,
    `<div>${mStr(m.addr2, "Postcode en woonplaats")}</div>`,
  ].filter(Boolean).join("");
  const refRow = (lbl: string, valHtml: string) =>
    `<div style="display:flex"><div style="width:128px">${esc(lbl)}</div><div>: ${valHtml}</div></div>`;
  blocks.push(bRaw(`<div style="line-height:1.5">${recipient}</div>`, 14));
  blocks.push({ ...bRaw(`<div>${SENDER_CITY}, ${esc(m.dateLong)}</div>`, m.dateGap), tag: "dateGap" });
  blocks.push(bRaw(`<div>${refRow("Onze referentie", mStr(m.onzeReferentie, "referentie"))}<div style="margin-top:20px">${refRow("Locatie", mStr(m.object, "Locatie"))}</div>${refRow("Betreft", mStr(m.betreft, "Betreft"))}</div>`, 18));
  blocks.push({ ...bRaw(`<div>Geachte ${esc(m.aanhef)},</div>`, m.aanhefGap), tag: "aanhefGap" });
  const introScope = m.withInstallation && m.withManagement
    ? "leveren, monteren, aansluiten en beheren van uw laadpalen"
    : m.withInstallation
      ? "leveren, monteren en aansluiten van uw laadpalen"
      : "het beheer van uw bestaande laadpalen";
  blocks.push(bP(`Hartelijk dank voor uw aanvraag. Hierbij ontvangt u ons voorstel voor het ${introScope}.`, 12));

  // --- Levering en installatie (alleen bij installatie-scope) ---
  if (m.withInstallation) {
    if (m.withManagement) blocks.push(bBig(`Wij maken van uw ${g("laadpalen")} een ${g("inkomstenbron")}.`, 30));
    blocks.push(bSec("Levering en installatie", 30, GREEN));
    // De scope-tekst is bewerkbare vrije tekst (offer_details.leveringText); alinea's
    // gescheiden door een lege regel → losse blokken zodat alles netjes herpagineert.
    m.leveringText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .forEach((para, i) => blocks.push(bP(esc(para).replace(/\n/g, "<br/>"), i === 0 ? 8 : 22)));
    // Investering + stelpost/Note als ÉÉN atomair blok (splitst nooit; Note blijft bij het bedrag).
    // Particulier: zelfde stijl als zakelijk (schuin + onderstreept, label tussen haakjes), met de BTW-
    // uitsplitsing eronder. Sluitend afgerond op hele euro's (netto + btw = totaal); geel bij niet ingevuld.
    let priceHtml: string;
    if (m.isPrivate) {
      const net = m.totalInvestment;
      const netR = net == null ? null : Math.round(net);
      const btwR = net == null ? null : Math.round(net * VAT_RATE);
      const totR = net == null ? null : (netR as number) + (btwR as number);
      const fmt = (v: number | null) => v == null ? yel(invFmt(0)) : invFmt(v);
      priceHtml =
        `<div style="display:flex;justify-content:space-between;align-items:baseline"><div>De prijs voor bovenstaande werkzaamheden bedraagt:</div>${priceAmt(fmt(netR), "(exclusief btw)")}</div>` +
        `<div style="display:flex;justify-content:flex-end;margin-top:2px">${priceAmt(fmt(btwR), "(21% btw)")}</div>` +
        `<div style="display:flex;justify-content:flex-end;margin-top:2px">${priceAmt(fmt(totR), "(totaalprijs inclusief btw)")}</div>`;
    } else {
      priceHtml = `<div style="display:flex;justify-content:space-between;align-items:baseline"><div>De investering voor bovenstaande werkzaamheden bedraagt:</div>${priceAmt(mInv(m.totalInvestment), "(totaal excl. BTW)")}</div>`;
    }
    blocks.push(bRaw(
      priceHtml +
      `<div style="font-style:italic;margin-top:30px">Stelpost graafwerkzaamheden: ${mStel(m.stelpost)}<br/>Note: deze kosten zitten dus niet in de offerteprijs.</div>`,
      24));
  } else if (m.withManagement) {
    blocks.push(bBig(`Wij maken van uw ${g("laadpalen")} een ${g("inkomstenbron")}.`, 30));
    // Begeleidende aanpak-tekst (vrije tekst, alinea's gescheiden door een lege regel) zodat pagina 1 netjes
    // vult i.p.v. enkel de kop; zelfde herpaginering als leveringText.
    m.beheerIntroText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .forEach((para, i) => blocks.push(bP(esc(para).replace(/\n/g, "<br/>"), i === 0 ? 18 : 14)));
    // Tarief-instellingen op pagina 1 (gestapeld: label boven, bedrag eronder). Data-gedreven; mEur toont
    // "€ 0,00" (geel) bij nog niet ingevulde tarieven. Bij installatie+beheer staat dit blok op pagina 2.
    if (m.tariffLines.length) {
      blocks.push(bP("De volgende afgesproken instellingen worden in het portaal ingesteld:", 24));
      m.tariffLines.forEach((l, i) => blocks.push(bRaw(
        `<div>${esc(l.label)}:</div><div>${mEur(l.amount)} ${esc(l.unit)}</div>`, i === 0 ? 10 : 8)));
    }
  }

  // --- Beheermodule (alleen bij beheer-scope) — start altijd strak op een nieuwe pagina ---
  if (m.withManagement) {
    blocks.push({ ...bSec("Beheermodule laadpalen", 0, GREEN), brk: true });
    blocks.push(bP(m.withInstallation
      ? "Na de installatie configureren wij voor u de laadpalen en activeren we die in ons eigen platform. Dit houdt onder andere in:"
      : "Wij nemen uw bestaande laadpalen op in ons eigen platform en beheren ze volledig voor u. Dit houdt onder andere in:", 10));
    BEHEER_POINTS.forEach(([t, b], i) => blocks.push(bRaw(
      `<div style="display:flex;gap:16px"><div style="color:${GREEN};font-weight:700;min-width:56px">${String(i + 1).padStart(2, "0")}</div><div><div style="font-weight:700;color:${INK}">${esc(t)}</div><div style="color:${MUTED};margin-top:5px">${esc(m.isPrivate && i === 4 ? "Wij verzorgen transactieverwerking, facturatie en uitbetaling. Elke maand ontvangt u een overzichtelijke maandafrekening en betalen wij uw opbrengst aan u uit." : b)}</div></div></div>`,
      i === 0 ? 14 : 22)));
    blocks.push(bP(`Wij nemen het hele traject van het beheer en de optimalisatie van uw laadinfrastructuur uit handen. Voor onze dienstverlening rekenen wij een service-fee van ${money2(m.isPrivate ? incl(m.serviceFeePerKwh) : m.serviceFeePerKwh)} per geladen kWh${m.isPrivate ? " (incl. BTW)" : ""}. Elke maand ontvangt u de opbrengst van uw palen op uw rekening, met onze service-fee als enige inhouding.`, 24));
    // De eenmalige activatie-/onboardingkosten tonen we alleen onder de voorwaarden (zie hieronder), niet hier.
    // "Een laadpaal die voor u werkt" + de inline-tariefregels alleen bij installatie+beheer; bij alleen-beheer
    // staat dit blok (gestapeld) al op pagina 1.
    if (m.withInstallation) {
      blocks.push(bBig(`Een ${g("laadpaal")} ${g("die")} voor u ${g("werkt")}`, 22));
      if (m.tariffLines.length) {
        blocks.push(bP("De volgende afgesproken instellingen worden in het portaal ingesteld:", 22));
        // 170px label-kolom past "Laadkosten eigen gebruik:" (was 95px voor de korte labels).
        const tariff = (lbl: string, val: string) => `<div style="display:flex"><div style="width:170px">${esc(lbl)}</div><div>${val}</div></div>`;
        m.tariffLines.forEach((l) => blocks.push(bRaw(tariff(`${l.label}:`, `${mEur(l.amount)} ${l.unit}`), 4)));
      }
    }
  }

  // --- Uitgangspunten / voorwaarden ---
  const row2 = (l: string, r: string) => `<div style="display:flex"><div style="width:330px">${l}</div><div>${r}</div></div>`;
  blocks.push({ ...bSec("Uitgangspunten", 0, HEAD), brk: true });
  blocks.push(bFb(`Overleg met ${mStr(m.overlegNaam, "naam")} d.d. ${m.overlegDatum ? esc(m.overlegDatum) : yel("datum")}.`, 8));
  blocks.push(bSec("Prijsstelling", 19, HEAD));
  blocks.push(bFb(m.isPrivate ? "Alle in deze offerte genoemde bedragen zijn inclusief 21% BTW." : "Genoemde netto bedragen zijn exclusief BTW.", 8));
  if (m.withInstallation) blocks.push(bFb("Levering en installatie is inclusief reis- en autokosten.", 5));
  if (m.withManagement) {
    blocks.push(bSec("Storingen", 19, HEAD));
    blocks.push(bP("Storingsmeldingen vanuit het portaal worden opgepakt op basis van de onderstaande tarieven;", 8));
    blocks.push(bRaw(row2("Servicemonteur E-Charging", `${mEur(m.isPrivate ? incl(m.servicemonteurPerHour) : m.servicemonteurPerHour)} per uur`), 6));
    blocks.push(bRaw(row2("Voorrijkosten", `${mEur(m.isPrivate ? incl(m.voorrijkostenPerKm) : m.voorrijkostenPerKm)} p/km`), 1));
    blocks.push(bRaw(row2("Voor werktijden tussen 17.00 uur en 08.00 uur", "75 % toeslag."), 12));
    blocks.push(bRaw(row2("Voor zaterdagen", "75 % toeslag."), 1));
    blocks.push(bRaw(row2("Zon en feestdagen", "125 % toeslag."), 1));
    blocks.push(bP("Over werkzaamheden door derden zal een opslag van 20% als coördinatievergoeding worden berekend.", 16));
    blocks.push(bP("De gebruikte materialen zullen worden berekend volgens de meest actuele prijscourant van de Technische Unie.", 12));
  }
  blocks.push(bSec("Onze voorwaarden bij deze aanbieding", 19, HEAD));
  blocks.push(bFb("De Algemene voorwaarden E-Charging BV.", 8));
  if (m.withInstallation) {
    blocks.push(bFb(`Uitvoering &ldquo;levering en installatie&rdquo; kunnen aaneengesloten plaatsvinden binnen normale werkuren (tussen 07.00 &ndash; 17.00 uur). Indien er buiten deze uren werkzaamheden moeten plaats vinden zullen de volgende toeslagen per werkuur á ${mEur(m.isPrivate ? incl(m.toeslagWerkuur) : m.toeslagWerkuur)} gehanteerd worden:`));
    blocks.push(bSub("50% Avonduren (17.00 &ndash; 23.00 uur)"));
    blocks.push(bSub("75% Nachturen (23.00 &ndash; 07.00 uur) en zaterdag (normale werkuren)"));
    blocks.push(bSub("125% Zon- en feestdagen (normale werkuren)"));
  }
  blocks.push(bFb("Deze aanbieding is 30 dagen geldig na datum van aanbieding."));
  if (m.isPrivate) blocks.push(bFb("Herroepingsrecht: als consument kunt u deze overeenkomst binnen 14 dagen na ondertekening zonder opgaaf van reden ontbinden. Geeft u aan dat wij binnen deze termijn al mogen starten met de uitvoering, dan vervalt het herroepingsrecht zodra de werkzaamheden volledig zijn uitgevoerd.", 8));
  if (m.withManagement) {
    blocks.push(bSec("Activatiekosten, ingangsdatum, contactduur en opzegging beheermodule", 19, HEAD));
    blocks.push(m.withInstallation
      ? bFb(`De activatiekosten bedragen ${mEur(m.isPrivate ? incl(m.activatiekostenPerSocket) : m.activatiekostenPerSocket)} per socket${m.isPrivate ? " (incl. BTW)" : ""}.`, 8)
      : bFb(m.isPrivate
          ? `De eenmalige activatie- en onboardingkosten bedragen ${m.totalInvestment != null ? money2(incl(m.totalInvestment)) : yel(money2(0))} (incl. BTW).`
          : `De eenmalige activatie- en onboardingkosten bedragen ${mEur(m.totalInvestment)} (excl. BTW).`, 8));
    blocks.push(bFb(m.withInstallation
      ? "De overeenkomst gaat in op de eerste dag van de kalendermaand volgend op de opleverdatum."
      : `De ingangsdatum van de overeenkomst is gesteld op ${mStr(m.ingangsdatum, "ingangsdatum")}.`));
    blocks.push(bFb("De overeenkomst wordt aangegaan voor een periode van één (1) jaar, te rekenen vanaf de ingangsdatum. Na afloop van deze periode wordt de overeenkomst telkens stilzwijgend verlengd met een periode van één (1) jaar, tenzij opdrachtgever of aannemer de overeenkomst schriftelijk opzegt met inachtneming van een opzegtermijn van drie (3) maanden vóór het einde van de lopende contractperiode."));
  }
  if (m.withInstallation) {
    blocks.push(bSec("Niet in deze aanbieding opgenomen", 19, HEAD));
    blocks.push(bFb("Hak-, graaf-, frees-, breek-, timmer-, schilder-, kit-, metsel- en stucadoorswerk, tenzij anders omschreven.", 8));
  }

  // --- Aansprakelijkheid / aanpak / handtekening ---
  const sigImg = signature?.signatureDataUrl
    ? `<img src="${signature.signatureDataUrl}" alt="" style="max-height:64px;max-width:90%;display:block" />`
    : "";
  // E-Charging mede-ondertekening (links): snapshot uit de signature, fallback op het sjabloon.
  const ecSigImg = signature?.echargingSignatureDataUrl
    ? `<img src="${signature.echargingSignatureDataUrl}" alt="" style="max-height:64px;max-width:90%;display:block" />`
    : "";
  const ecName = (signature?.echargingSignerName || m.signerName || "").trim();
  const ecFunction = (signature?.echargingSignerFunction || m.signerFunction || "").trim();
  const sigDate = signature?.date ? fmtDateShort(signature.date) : "";
  const dots = "………………….…………";
  blocks.push({ ...bSec("Aansprakelijkheid en betalingsregeling", 0, HEAD), brk: true });
  blocks.push(bFb(esc(m.isPrivate ? AANSPRAKELIJKHEID_CONSUMENT : AANSPRAKELIJKHEID), 9));
  if (m.withInstallation) blocks.push(bFb(`Betalingen levering en installatie: ${esc(m.betaalBijOpdracht)}% bij opdracht, ${esc(m.betaalBijStart)}% bij start werkzaamheden en ${esc(m.betaalNaWerk)}% na werkzaamheden.`));
  if (m.withManagement) blocks.push(bFb(m.isPrivate ? "Betalingen beheermodule: maandelijkse afrekening op basis van een door E-Charging opgemaakte maandafrekening." : "Betalingen beheermodule: maandelijkse afrekening op basis van een door E-Charging opgemaakte self-billing factuur."));
  blocks.push(bFb("Betalingen binnen 14 dagen na factuurdatum."));
  blocks.push(bSec("Onze aanpak", 24, HEAD));
  blocks.push(bP(esc(AANPAK), 9));
  blocks.push(bRaw(`<div style="text-align:center"><div>Heeft u nog vragen of opmerkingen naar aanleiding van deze aanbieding?</div><div style="margin-top:4px">Neem dan gerust contact met ons op.</div></div>`, 40));
  blocks.push(bRaw(`<div style="display:flex;gap:40px"><div style="flex:1"><div>Met vriendelijke groet,</div><div style="height:72px;display:flex;align-items:flex-end">${ecSigImg}</div><div style="font-weight:600">${esc(ecName) || "Naam ondertekenaar"}</div>${ecFunction ? `<div style="margin-top:2px">${esc(ecFunction)}</div>` : ""}<div style="margin-top:2px">E-Charging B.V.</div></div><div style="flex:1"><div>Voor akkoord getekend,</div><div style="height:72px;display:flex;align-items:flex-end">${sigImg}</div><div>Dhr./Mevr: ${esc(signature?.signerName) || dots}</div><div style="margin-top:6px">d.d. ${esc(sigDate) || dots}</div></div></div>`, 44));

  return blocks;
}

// Verdeel de blokken greedy over A4-pagina's (header/footer per pagina herhaald).
function paginateLetter(blocks: Block[], heights: number[]): Block[][] {
  // FOOTER_CLEARANCE: marge boven de footer-hairline zodat geen blok 'm raakt (Note nooit doorgestreept).
  const contentH = PAGE_H - CONTENT_TOP - CONTENT_BOTTOM - FOOTER_CLEARANCE;
  const pages: Block[][] = [];
  let cur: Block[] = [];
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    // Geforceerde paginabreuk vóór een sectie die altijd boven aan een nieuwe pagina hoort.
    if (b.brk && cur.length) { pages.push(cur); cur = []; used = 0; }
    const first = cur.length === 0;
    const selfAdd = heights[i] + (first ? 0 : b.mt);
    let needed = selfAdd;
    if (b.keep && i + 1 < blocks.length) needed += heights[i + 1] + blocks[i + 1].mt;
    if (!first && used + needed > contentH) {
      pages.push(cur);
      cur = [b];
      used = heights[i];
    } else {
      cur.push(b);
      used += selfAdd;
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

// ===========================================================================
// Cover (vast) + automatisch gepagineerde brief. Meet elk blok off-screen op
// contentbreedte (zelfde font als de pagina) en verdeel ze over zoveel A4-pagina's
// als nodig — zo schuift langere/kortere "Levering en installatie"-tekst netjes door.
export function buildOfferPages(
  data: OfferTemplateData,
  assets: { logoUrl: string | null; coverUrl: string | null },
  signature?: OfferTemplateSignature,
): HTMLElement[] {
  const m = resolve(data);
  const cover = coverPage(m, assets.logoUrl, assets.coverUrl);
  const blocks = letterBlocks(m, signature);

  const measure = document.createElement("div");
  measure.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_W}px;font-family:'Outfit',Arial,sans-serif;font-size:${LETTER_FONT}px;line-height:1.4;color:${INK}`;
  const nodes = blocks.map((b) => {
    const d = document.createElement("div");
    d.innerHTML = b.html;
    measure.appendChild(d);
    return d;
  });
  document.body.appendChild(measure);
  const heights = nodes.map((d) => d.offsetHeight);
  document.body.removeChild(measure);

  // Auto-fit: krimp ALLEEN de twee briefkop-witruimtes (datum/aanhef) als pagina 1 (alles vóór de
  // eerste geforceerde paginabreuk) niet binnen het budget past — zodat het investeringsblok boven de
  // footer blijft. Korte teksten passen al → niets doen (nooit vergroten). mt is los van de gemeten
  // hoogtes, dus herpagineren kan zonder hermeten.
  const firstBrk = blocks.findIndex((b) => b.brk);
  const sliceEnd = firstBrk === -1 ? blocks.length : firstBrk;
  let p1Total = 0;
  for (let i = 0; i < sliceEnd; i++) p1Total += heights[i] + blocks[i].mt; // op pagina 1 telt ook blok 0 z'n mt
  const budget = PAGE_H - CONTENT_TOP - CONTENT_BOTTOM - FOOTER_CLEARANCE;
  const overflow = p1Total - budget;
  if (overflow > 0) {
    const dateB = blocks.find((b) => b.tag === "dateGap");
    const aanhefB = blocks.find((b) => b.tag === "aanhefGap");
    const dSlack = Math.max(0, (dateB?.mt ?? 0) - GAP_FLOOR);
    const aSlack = Math.max(0, (aanhefB?.mt ?? 0) - GAP_FLOOR);
    const slack = dSlack + aSlack;
    if (slack > 0 && dateB && aanhefB) {
      const reduce = Math.min(overflow, slack);
      const dCut = Math.round((reduce * dSlack) / slack);
      dateB.mt -= dCut;
      aanhefB.mt -= reduce - dCut; // rest naar de aanhef → som klopt exact
    }
  }

  const pages = paginateLetter(blocks, heights);
  const total = pages.length;
  const letterNodes = pages.map((pageBlocks, idx) => assembleLetterPage(m, assets.logoUrl, idx + 1, total, pageBlocks));
  return [cover, ...letterNodes];
}
