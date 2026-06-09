import { jsPDF } from "jspdf";
import logoUrl from "@/assets/logo-full-color.svg";
import { OUTFIT_REGULAR_BASE64, OUTFIT_SEMIBOLD_BASE64 } from "@/assets/fonts/outfit";

// ---------------------------------------------------------------------------
// Offerte-PDF (5 pagina's) — exact volgens het e-charging offerte-ontwerp.
// Eén client-side generator, gebruikt voor (a) de preview in het sales-werkblad
// en (b) de getekende versie op de publieke akkoord-pagina (met handtekening).
// De beheergegevens (laadtarief/blokkeertarief/gratis minuten) staan in de
// VOORWAARDEN van de offerte (pagina 5), niet in de algemene voorwaarden.
// ---------------------------------------------------------------------------

const GREEN: [number, number, number] = [5, 165, 0];     // #05A500
const INK: [number, number, number] = [38, 38, 38];      // #262626
const MUTED: [number, number, number] = [120, 120, 120];
const FAINT: [number, number, number] = [165, 165, 165];
const HAIRLINE: [number, number, number] = [225, 225, 225];

const PAGE_W = 210, PAGE_H = 297, ML = 20, MR = 20;
const CW = PAGE_W - ML - MR;

const eur0 = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const num2 = (n: number) => Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

export interface OfferPdfData {
  quoteNumber: string;
  date?: string | null;            // ISO; default vandaag
  company: string;
  contactName?: string | null;
  contactFunction?: string | null;
  addressLine?: string | null;     // "straat, postcode plaats"
  numChargePoints?: number | null;
  totalInvestment: number;         // hardware + installatie, excl. btw
  withManagement?: boolean;
  durationMonths?: number | null;  // default 12
  noticeMonths?: number | null;    // default 3
  serviceFeePct?: number | null;   // default 20
  chargeTariffPerKwh?: number | null;
  idleFeePerMinute?: number | null;
  idleGraceMinutes?: number | null;
  validUntil?: string | null;
}

export interface OfferSignature {
  signerName: string;
  signatureDataUrl: string;        // PNG data-URL van het handtekening-canvas
  date?: string | null;            // ISO; default vandaag
}

function registerFont(doc: jsPDF): string {
  try {
    doc.addFileToVFS("Outfit-Regular.ttf", OUTFIT_REGULAR_BASE64);
    doc.addFont("Outfit-Regular.ttf", "Outfit", "normal");
    doc.addFileToVFS("Outfit-SemiBold.ttf", OUTFIT_SEMIBOLD_BASE64);
    doc.addFont("Outfit-SemiBold.ttf", "Outfit", "bold");
    return "Outfit";
  } catch { return "helvetica"; }
}

async function rasterizeLogo(url: string): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(url);
    let svg = await res.text();
    let w = 2000, h = 800;
    const vb = svg.match(/viewBox="([\d.\s-]+)"/);
    if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); if (p.length === 4 && p[2] > 0 && p[3] > 0) { w = p[2]; h = p[3]; } }
    svg = svg.replace(/<svg([^>]*)>/, (_m, a: string) => `<svg${a.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "")} width="${w}" height="${h}">`);
    const objUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("logo")); i.src = objUrl;
      });
      const tw = 480, th = Math.round((tw * h) / w);
      const c = document.createElement("canvas"); c.width = tw; c.height = th;
      const ctx = c.getContext("2d"); if (!ctx) return null;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, tw, th); ctx.drawImage(img, 0, 0, tw, th);
      return { dataUrl: c.toDataURL("image/jpeg", 0.92), ratio: w / h };
    } finally { URL.revokeObjectURL(objUrl); }
  } catch { return null; }
}

export async function generateOfferPdf(data: OfferPdfData, signature?: OfferSignature): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const FONT = registerFont(doc);
  const logo = await rasterizeLogo(logoUrl);

  const dateStr = fmtDate(data.date ?? new Date().toISOString());
  const duration = data.durationMonths ?? 12;
  const notice = data.noticeMonths ?? 3;
  const feePct = data.serviceFeePct ?? 20;
  const ref = data.quoteNumber;

  const set = (size: number, style: "normal" | "bold", color: [number, number, number] = INK) => {
    doc.setFont(FONT, style); doc.setFontSize(size); doc.setTextColor(...color);
  };
  // Letter-spaced kapitaaltjes (sectielabels).
  const label = (txt: string, x: number, y: number, color = MUTED) => {
    set(8, "bold", color); doc.text(txt.toUpperCase(), x, y, { charSpace: 1.2 });
  };
  // Alinea; geeft de nieuwe y terug.
  const para = (txt: string, x: number, y: number, w: number, size = 10.5, lh = 5.4, color = INK, style: "normal" | "bold" = "normal") => {
    set(size, style, color);
    const lines = doc.splitTextToSize(txt, w) as string[];
    doc.text(lines, x, y);
    return y + lines.length * lh;
  };
  const hairline = (y: number) => { doc.setDrawColor(...HAIRLINE); doc.setLineWidth(0.2); doc.line(ML, y, PAGE_W - MR, y); };

  const innerHeader = (pageNum: number) => {
    if (logo) { const w = 34, h = w / logo.ratio; doc.addImage(logo.dataUrl, "JPEG", ML, 12, w, h); }
    set(7, "normal", FAINT);
    doc.text([`${dateStr} ▪`, `${ref} ▪`, `Pagina ${pageNum} van 5 ▪`], PAGE_W - MR, 14, { align: "right", lineHeightFactor: 1.5 });
  };
  const innerFooter = () => {
    hairline(272);
    set(7.5, "normal", MUTED);
    const cols: [number, string[]][] = [
      [ML, ["Dwarsweg 8", "5301 KT Zaltbommel", "0418 684272"]],
      [PAGE_W / 2 - 18, ["www.e-charging.nl", "info@e-charging.nl"]],
      [PAGE_W - MR, ["KvK 30241843", "BTW NL8213.92.402.B01", "IBAN NL33RABO0143928449"]],
    ];
    cols.forEach(([x, lines], i) => doc.text(lines, x, 278, { align: i === 2 ? "right" : "left", lineHeightFactor: 1.45 }));
  };

  // ===== PAGINA 1 — cover ===================================================
  if (logo) { const w = 56, h = w / logo.ratio; doc.addImage(logo.dataUrl, "JPEG", ML, 64, w, h); }
  label("Offerte", ML, 116, MUTED);
  set(26, "bold", INK); doc.text("Wij plaatsen uw laadpalen.", ML, 132);
  set(26, "normal", MUTED); doc.text("U verdient eraan.", ML, 145);
  hairline(168);
  label("Voor", ML, 182, MUTED);
  set(16, "bold", GREEN); doc.text(data.company || "—", ML, 192);
  set(10.5, "normal", MUTED);
  const voor = [data.contactName && data.contactFunction ? `${data.contactName}, ${data.contactFunction}` : (data.contactName || ""), data.addressLine || ""].filter(Boolean);
  if (voor.length) doc.text(voor, ML, 199, { lineHeightFactor: 1.4 });
  hairline(216);
  label("Referentie", ML, 230, MUTED);
  set(11, "normal", GREEN); doc.text(ref, ML, 237);
  label("Datum", PAGE_W / 2, 230, MUTED);
  set(11, "normal", GREEN); doc.text(dateStr || "—", PAGE_W / 2, 237);
  label("e-charging", ML, 285, FAINT);

  // ===== PAGINA 2 — levering & investering ==================================
  doc.addPage(); innerHeader(2);
  let y = 52;
  set(11, "normal", INK); doc.text(`Geachte ${data.contactName || "heer/mevrouw"},`, ML, y); y += 10;
  y = para("In deze offerte vindt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur.", ML, y, CW); y += 3;
  y = para(`Wij maken van uw laadpalen een inkomstenbron. U koopt de palen, wij zorgen dat ze draaien, verdienen en blijven werken. Elk kwartaal ontvangt u ${100 - feePct}% van de netto opbrengsten en de volledige stroomvergoeding op uw rekening.`, ML, y, CW); y += 8;
  set(16, "bold", INK); doc.text("Levering en installatie", ML, y); y += 9;
  y = para(`Wij leveren en installeren ${data.numChargePoints ?? "[aantal]"} laadpalen op uw locatie. Een complete oplevering: hardware, montage, aansluiting op uw groepenkast, koppeling met het laadplatform en certificering volgens NEN norm.`, ML, y, CW); y += 3;
  y = para("Na oplevering en betaling zijn de laadpalen uw eigendom. Vanaf dag één staan ze klaar om te laden en verdienen.", ML, y, CW); y += 8;
  label("Inbegrepen in deze prijs", ML, y, FAINT); y += 8;
  const incl = [
    "Hardware en laadpalen", "Configuratie en NEN keuring",
    "Volledige montage en installatie", "Activatie op het E-Charging platform",
    "Aansluiting op uw groepenkast", "24 maanden hardware garantie",
  ];
  set(10.5, "normal", INK);
  for (let i = 0; i < incl.length; i += 2) {
    doc.text(incl[i], ML, y);
    if (incl[i + 1]) doc.text(incl[i + 1], PAGE_W / 2, y);
    y += 7;
  }
  y += 10;
  label("Eenmalige investering", ML, y, FAINT); y += 12;
  set(30, "bold", GREEN); doc.text(eur0(data.totalInvestment), ML, y);
  const bedragW = doc.getTextWidth(eur0(data.totalInvestment));
  set(10, "normal", MUTED); doc.text("excl. BTW", ML + bedragW + 4, y); y += 9;
  para("Voor de complete oplevering. Inclusief reis en autokosten.", ML, y, CW, 10, 5.4, MUTED);
  innerFooter();

  // ===== PAGINA 3 — beheer (6 punten) =======================================
  doc.addPage(); innerHeader(3);
  y = 50;
  set(16, "bold", INK); doc.text("Een laadpaal die voor u werkt", ML, y); y += 9;
  y = para(`Wij nemen het hele traject van het beheer en de optimalisatie van uw laadinfrastructuur uit handen. Voor onze dienstverlening rekenen wij een service-fee van ${feePct}% over uw netto inkomsten. Elk kwartaal ontvangt u de overige ${100 - feePct}% van de netto opbrengsten en de volledige stroomvergoeding op uw rekening. Dit is wat wij voor u doen:`, ML, y, CW); y += 6;
  const items: [string, string][] = [
    ["Eén persoonlijk dashboard", "In uw eigen online dashboard ziet u realtime wat uw palen doen: opbrengsten, verbruik en gebruik per paal. Eén plek voor inzicht, controle en rapportage. 24/7 inzichtelijk."],
    ["Uw palen blijven up en running", "Wij krijgen direct een melding bij een storing en lossen het meestal op voordat u het in de gaten heeft. Eerst op afstand; lukt dat niet, dan komen wij kosteloos ter plaatse voor een diagnose. U en uw laadgebruikers kunnen ons 24/7 bereiken."],
    ["Doorlopende optimalisatie van rendement", "Wij analyseren continu het werkelijke gebruik van uw palen en passen tarieven, blokkeerregels en tijdsvensters daarop aan. Uw palen brengen het maximale op, ook als de markt of het gebruik verandert."],
    ["Hulp met ERE-onboarding", "Wij regelen dat uw palen meedraaien in de laadbeloningsregeling, zodat u geen subsidie misloopt."],
    ["Per kwartaal geld op uw rekening", `Wij regelen transactieverwerking, facturatie en uitbetaling. Binnen 14 dagen na kwartaalafsluiting staat uw ${100 - feePct}% aandeel en de volledige stroomvergoeding op uw rekening.`],
    ["Mandaat voor directe reparaties", "Vooraf afgesproken budget waarbinnen wij storingen direct kunnen verhelpen, zonder dat u telkens een offerte hoeft goed te keuren. Kosten verrekend met de opbrengst van uw palen."],
  ];
  items.forEach(([title, body], i) => {
    set(15, "bold", GREEN); doc.text(String(i + 1).padStart(2, "0"), ML, y);
    set(11, "bold", INK); doc.text(title, ML + 12, y);
    const yEnd = para(body, ML + 12, y + 5.5, CW - 12, 9.5, 4.9, MUTED);
    y = yEnd + 3.5;
  });
  innerFooter();

  // ===== PAGINA 4 — service-fee, looptijd, exclusies ========================
  doc.addPage(); innerHeader(4);
  y = 50;
  label("Onze service-fee", ML, y, FAINT); y += 8;
  set(16, "bold", INK); doc.text("Wij verdienen wanneer u verdient", ML, y); y += 9;
  y = para(`In plaats van vaste kosten of abonnementen vragen wij een service-fee van ${feePct}% over uw netto rendement. Hoe hoger de opbrengst van uw palen, hoe meer wij ons werk hebben gedaan. Onze belangen lopen één op één met die van u op.`, ML, y, CW); y += 3;
  y = para("Geen activatiekosten. Geen maandelijkse platformbijdrage. Geen losse facturen voor support, monitoring of optimalisatie. Alleen onze service-fee, automatisch verrekend bij uw kwartaalafrekening.", ML, y, CW); y += 12;
  label("Looptijd en flexibiliteit", ML, y, FAINT); y += 14;
  const stats: [string, string][] = [[`${duration}`, "maanden looptijd"], [`${notice}`, "maanden opzegtermijn"], [`${feePct}%`, "service-fee"]];
  stats.forEach(([big, sub], i) => {
    const cx = ML + 12 + i * (CW / 3);
    set(24, "bold", INK); doc.text(big, cx, y, { align: "center" });
    label(sub, cx, y + 7, MUTED);
  });
  y += 24;
  label("Niet in deze offerte opgenomen", ML, y, FAINT); y += 8;
  para("Stroomkosten en eventuele netverzwaring van uw aansluiting blijven voor uw rekening. Vergunningen en kadastrale werkzaamheden vallen buiten de scope, evenals schade door externe oorzaken zoals overspanning, blikseminslag, vandalisme of water. Hardware-reparatie of vervanging boven het afgesproken mandaat loopt via een separate offerte.", ML, y, CW, 9.5, 5, MUTED);
  innerFooter();

  // ===== PAGINA 5 — akkoord + voorwaarden + handtekening ====================
  doc.addPage(); innerHeader(5);
  y = 48;
  set(16, "bold", INK); doc.text("Akkoord", ML, y); y += 8;
  y = para("Door ondertekening gaat u akkoord met de levering, installatie en het doorlopende beheer zoals omschreven, alsmede met de bijgevoegde Algemene Voorwaarden en Verwerkersovereenkomst E-Charging.", ML, y, CW, 9.5, 5); y += 5;

  const bulletBlock = (heading: string, bullets: string[]) => {
    set(10.5, "bold", INK); doc.text(heading, ML, y); y += 5.5;
    set(9.5, "normal", INK);
    bullets.forEach((b) => {
      doc.text("•", ML + 1, y);
      const lines = doc.splitTextToSize(b, CW - 6) as string[];
      doc.text(lines, ML + 5, y);
      y += lines.length * 4.7 + 1.2;
    });
    y += 4;
  };

  bulletBlock("Prijsstelling", [
    "Genoemde bedragen zijn exclusief BTW.",
    "Eenmalige investering inclusief reis- en autokosten binnen Nederland.",
    `De service-fee van ${feePct}% over het netto rendement blijft gedurende de looptijd ongewijzigd.`,
  ]);

  // Beheergegevens (de afgesproken laadinstellingen) horen HIER, in de offerte-voorwaarden.
  const tarief: string[] = [];
  if (data.withManagement && data.chargeTariffPerKwh != null) tarief.push(`Laadtarief: € ${num2(data.chargeTariffPerKwh)} per kWh.`);
  if (data.withManagement && data.idleFeePerMinute != null) {
    const grace = data.idleGraceMinutes != null ? ` na ${data.idleGraceMinutes} gratis minuten` : "";
    tarief.push(`Blokkeertarief: € ${num2(data.idleFeePerMinute)} per minuut${grace}.`);
  }
  bulletBlock("Onze voorwaarden bij deze aanbieding", [
    "De Algemene Voorwaarden E-Charging en de Verwerkersovereenkomst E-Charging zijn van toepassing.",
    ...tarief,
    "Uitvoering en oplevering in overleg na schriftelijke opdracht.",
    "Installatiewerkzaamheden binnen normale werkuren (07:00 tot 17:00 uur), aaneengesloten.",
    `Looptijd ${duration} maanden vanaf oplevering, daarna stilzwijgend verlengd. Opzegtermijn ${notice} maanden.`,
    "Deze aanbieding is 2 maanden geldig na datum van aanbieding en vrijblijvend.",
  ]);

  bulletBlock("Betalingsregeling", [
    "Eenmalige investering: 50% bij ondertekening, 50% bij oplevering.",
    `Kwartaalafrekening ${100 - feePct}% klantaandeel binnen 14 werkdagen na kwartaalafsluiting per bankoverschrijving, op basis van een door E-Charging opgemaakte self-billing factuur.`,
    "Betalingstermijn facturen: 30 dagen na factuurdatum.",
  ]);

  // Handtekening-blokken
  y = Math.max(y, 226);
  const colL = ML, colR = PAGE_W / 2 + 4, colW = CW / 2 - 4;
  label("Opdrachtgever", colL, y, FAINT);
  set(11, "normal", GREEN); doc.text(data.company || "—", colL, y + 6);
  label("E - Charging", colR, y, FAINT);
  set(11, "normal", INK); doc.text("E-Group B.V. h/o E-Charging", colR, y + 6);
  let sy = y + 16;
  // Handtekening (opdrachtgever) — afbeelding indien getekend.
  label("Handtekening", colL, sy, FAINT);
  label("Handtekening", colR, sy, FAINT);
  if (signature?.signatureDataUrl) {
    try { doc.addImage(signature.signatureDataUrl, "PNG", colL, sy + 1.5, 48, 16); } catch { /* ignore */ }
  }
  sy += 22;
  label("Naam", colL, sy, FAINT);
  label("Naam", colR, sy, FAINT);
  set(10.5, "normal", INK);
  if (signature?.signerName) doc.text(signature.signerName, colL, sy + 6);
  doc.text("Willi-Jan Jonkers", colR, sy + 6);
  sy += 13;
  label("Functie", colL, sy, FAINT);
  label("Functie", colR, sy, FAINT);
  set(10.5, "normal", INK);
  if (data.contactFunction) doc.text(data.contactFunction, colL, sy + 6);
  doc.text("Directeur", colR, sy + 6);
  sy += 13;
  label("Datum", colL, sy, FAINT);
  label("Datum", colR, sy, FAINT);
  set(10.5, "normal", INK);
  if (signature) doc.text(fmtDate(signature.date ?? new Date().toISOString()), colL, sy + 6);
  innerFooter();

  return doc;
}

// Hulpfuncties voor de twee gebruikers.
export async function offerPdfBlob(data: OfferPdfData, signature?: OfferSignature): Promise<Blob> {
  return (await generateOfferPdf(data, signature)).output("blob");
}
// Base64 (zonder data-URL-prefix), voor verzending naar de edge function.
export async function offerPdfBase64(data: OfferPdfData, signature?: OfferSignature): Promise<string> {
  const uri = (await generateOfferPdf(data, signature)).output("datauristring");
  return uri.split(",")[1] ?? "";
}
