import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-full-color.svg";
import { OUTFIT_REGULAR_BASE64, OUTFIT_SEMIBOLD_BASE64 } from "@/assets/fonts/outfit";
import { getSettlementSessions } from "@/services/sessions";
import { settlementVat } from "@/services/calculations";
import { MONTH_LABELS_LONG } from "@/lib/period";
import {
  effectiveVatStatus,
  validateSelfBillingInvoiceData,
  type InvoiceValidationIssue,
} from "@/services/invoiceValidation";

// Maandelijkse afrekening met de laadpaaleigenaar (commissionairsregeling, art. 3 lid 6
// Wet OB). E-Charging koopt de stroom van de eigenaar (afnameprijs) en verkoopt door aan
// Road; de eigenaar krijgt maandelijks geld, nooit een factuur van ons. Twee documenttypen,
// bepaald door de bevestigde BTW-status van de eigenaar:
//
//   vat_liable → SELF-BILLING FACTUUR: de klant is leverancier ("Van"), E-Charging de
//     afnemer die uitreikt en uitbetaalt ("Naar"). Regel "Levering elektriciteit", 21% btw,
//     Wet OB art. 35a "Factuur uitgereikt door afnemer" + de aanvaardingsclausule.
//   kor / private → BETAALSPECIFICATIE: E-Charging is opsteller ("Van"), de klant afnemer
//     ("Naar"). Regel "Afname elektriciteit", géén btw, met "Geen omzetbelasting in rekening
//     gebracht." + de reden (KOR / geen ondernemer). Geen art. 35a.
//
// Het document toont UITSLUITEND het netto stroombedrag (= client_payout). De brutomarge en
// de bruto laadopbrengst staan NERGENS op het document. Activatiekosten staan er ook NIET op
// (aparte factuur via een extern programma) — saldering op één document is niet toegestaan.
// Renderen wordt GEWEIGERD (InvoiceValidationError) zolang verplichte gegevens ontbreken.
//
// Pagina 1: één regel "Levering/Afname elektriciteit {maand}" = client_payout, + evt. btw.
// Pagina 2+: transactiespecificatie met een NETTO bedrag per sessie dat optelt tot het
// pagina-1-totaal (transparant, maar de brutomarge blijft afgeschermd).

/** Wordt geworpen als verplichte factuurgegevens ontbreken; `issues` bevat de
 *  ontbrekende velden met NL-labels en de plek waar ze in te vullen zijn. */
export class InvoiceValidationError extends Error {
  constructor(public issues: InvoiceValidationIssue[]) {
    super(`Factuur kan niet worden gegenereerd — ontbrekend: ${issues.map((i) => i.label).join(", ")}`);
    this.name = "InvoiceValidationError";
  }
}

const BRAND_GREEN: [number, number, number] = [5, 165, 0];   // logo-groen #05A500
const GREEN_FOOT: [number, number, number] = [4, 127, 0];    // logo donkergroen #047F00
const ZEBRA: [number, number, number] = [248, 250, 248];
const INK: [number, number, number] = [38, 38, 38];
const MUTED: [number, number, number] = [120, 120, 120];
const HAIRLINE: [number, number, number] = [229, 229, 229];

const nlNum = (v: number | null | undefined, d: number) =>
  Number(v || 0).toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (v: number | null | undefined) => `€ ${nlNum(v, 2)}`;

// "2026-04-01" / "2026-04-01T..." -> "01-04-2026"
const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
};
const fmtDuration = (min: number | null | undefined): string => {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
};

export interface SelfBillingSettlement {
  client_id?: string | null;
  year: number;
  month: number;
  total_kwh: number | null;
  total_sessions: number | null;
  // Bruto/fee zijn optioneel: het portaal levert ze niet aan (netto-only). Alleen de
  // admin-fallback gebruikt echarging_fee_per_kwh om netto per sessie uit te rekenen.
  gross_revenue?: number | null;
  echarging_fee_per_kwh?: number | null;
  echarging_revenue?: number | null;
  client_payout: number | null;
  // Eenmalige activatiekosten (excl BTW). Wordt NIET meer op dit document getoond of
  // gesaldeerd — activatie loopt via een aparte factuur (extern programma). Veld blijft
  // voor historie/backwards-compat maar heeft geen effect op de afrekening.
  activation_cost?: number | null;
  vat_rate?: number | null;   // 0.21 (BTW-plichtig) of 0; default 0.21
  period_start: string;
  period_end: string;
  // Toegekend bij goedkeuring (doorlopende reeks); verplicht om te renderen.
  invoice_number?: string | null;
  // Snapshot van de BTW-status op het moment van goedkeuren.
  vat_status?: string | null;
}

export interface SelfBillingClient {
  id?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  client_number?: number | null;
  kvk?: string | null;
  btw_number?: string | null;
  billing_address_street?: string | null;
  billing_address_postal?: string | null;
  billing_address_city?: string | null;
  country?: string | null;
  vat_status?: string | null;
  vat_status_confirmed_at?: string | null;
}

export interface SelfBillingPaymentDetails {
  payout_account_holder_name?: string | null;
  payout_iban?: string | null;
  payout_bic?: string | null;
}

export interface SelfBillingOrg {
  name?: string | null;
  kvk?: string | null;
  btw_number?: string | null;
  iban?: string | null;
  bic?: string | null;
  address?: string | null;          // legacy enkelvoudig adres (fallback)
  address_street?: string | null;
  address_postal?: string | null;
  address_city?: string | null;
  country?: string | null;
  email?: string | null;
}

interface InvoiceSessionRow {
  started_at: string | null;
  duration_minutes: number | null;
  kwh_delivered: number | null;
  reimbursement_amount: number | null;
  charge_points: { name: string | null } | null;
  locations: { name: string | null } | null;
}

// Netto sessielijn voor de specificatie. Het portaal levert deze aan (server-side
// berekend, geen bruto/fee in de browser). De admin laat 'm leeg en valt terug op
// een eigen fetch + netto-berekening uit de bruto.
export interface InvoiceSessionLine {
  started_at: string | null;
  charge_point_name: string | null;
  location_name: string | null;
  duration_minutes: number | null;
  kwh_delivered: number | null;
  vergoeding: number | null;
}

// Registreer de Outfit-merkfonts op het document. Valt stil terug op Helvetica.
function registerFont(doc: jsPDF): string {
  try {
    doc.addFileToVFS("Outfit-Regular.ttf", OUTFIT_REGULAR_BASE64);
    doc.addFont("Outfit-Regular.ttf", "Outfit", "normal");
    doc.addFileToVFS("Outfit-SemiBold.ttf", OUTFIT_SEMIBOLD_BASE64);
    doc.addFont("Outfit-SemiBold.ttf", "Outfit", "bold");
    return "Outfit";
  } catch {
    return "helvetica";
  }
}

// Rasteriseer de logo-SVG compact (480×192 JPEG op witte achtergrond) — voorkomt
// de 6 MB-bloat van een 2000×800 PNG én randartefacten ("scheef") door de witte bg.
async function rasterizeLogo(url: string): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(url);
    let svg = await res.text();
    let w = 2000, h = 800;
    const vb = svg.match(/viewBox="([\d.\s-]+)"/);
    if (vb) {
      const p = vb[1].trim().split(/\s+/).map(Number);
      if (p.length === 4 && p[2] > 0 && p[3] > 0) { w = p[2]; h = p[3]; }
    }
    svg = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
      const cleaned = attrs.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");
      return `<svg${cleaned} width="${w}" height="${h}">`;
    });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("logo load failed"));
        i.src = objUrl;
      });
      const targetW = 480;
      const targetH = Math.round((targetW * h) / w);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), ratio: w / h };
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

/** Bouwt het PDF-document en geeft het terug (testbaar, geen download).
 *  Werpt InvoiceValidationError zolang verplichte gegevens ontbreken. */
/** Een particulier (niet-ondernemer) én een KOR-leverancier krijgen geen self-billing btw-factuur,
 *  maar een betaalspecificatie (geen art. 35a-markering, 0% btw, richting E-Charging → klant).
 *  Alleen een btw-ondernemer (vat_liable) krijgt een self-billing factuur. */
export function isBetaalspecificatie(vatStatus: string | null | undefined): boolean {
  return vatStatus === "private" || vatStatus === "kor";
}

export async function buildSelfBillingInvoicePdf(
  settlement: SelfBillingSettlement,
  client: SelfBillingClient,
  org?: SelfBillingOrg | null,
  paymentDetails?: SelfBillingPaymentDetails | null,
  sessionLines?: InvoiceSessionLine[] | null,
): Promise<jsPDF> {
  // ── Wet OB-validatie: geen compliant gegevens → geen factuur ──
  const validation = validateSelfBillingInvoiceData({ settlement, client, org, paymentDetails });
  if (!validation.ok) {
    throw new InvoiceValidationError(validation.missing);
  }
  const vatStatus = effectiveVatStatus({ settlement, client, org, paymentDetails });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const FONT = registerFont(doc);
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();   // 297
  const L = 18;
  const R = pageW - 18;                              // 192
  const W = R - L;                                   // 174
  const setFont = (weight: "normal" | "bold") => doc.setFont(FONT, weight);

  const orgName = org?.name || "E-Charging";
  const monthName = MONTH_LABELS_LONG[settlement.month - 1] ?? "";
  const mm = String(settlement.month).padStart(2, "0");
  const periodLabel = `${monthName} ${settlement.year}`;
  // Opgeslagen doorlopend nummer (toegekend bij goedkeuring; validatie garandeert aanwezigheid)
  const invoiceNr = (settlement.invoice_number ?? "").trim();
  // Factuurdatum in Europe/Amsterdam (dd-mm-jjjj), onafhankelijk van de browser-tijdzone.
  const todayStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date()).replace(/\//g, "-");

  // Bedragen — UITSLUITEND het netto stroombedrag verschijnt. Bruto/marge blijven intern.
  // Activatiekosten staan hier bewust NIET op: die lopen via een aparte factuur (extern
  // programma). Saldering op één document is niet toegestaan (commissionairs-handboek).
  const feePerKwh = Number(settlement.echarging_fee_per_kwh || 0);
  const totalKwh = Number(settlement.total_kwh || 0);
  // BTW alleen voor BTW-plichtige leveranciers (vat_rate 0.21); anders 0 → geen BTW-regel.
  const vat = settlementVat({
    clientPayout: Number(settlement.client_payout || 0),
    vatRate: Number(settlement.vat_rate ?? 0.21),
  });
  const subtotal = vat.net;        // netto stroombedrag (excl. btw)
  const btw = vat.vatAmount;
  const inclBtw = vat.inclVat;
  const hasVat = vat.vatRate > 0;
  const vatPct = (vat.vatRate * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  // Particulier of KOR → betaalspecificatie (E-Charging → klant); vat_liable → self-billing factuur.
  const isPrivate = isBetaalspecificatie(vatStatus);
  const docTitle = isPrivate ? "Betaalspecificatie" : "Vergoedingsfactuur";
  const docNrLabel = isPrivate ? "Betaalspecificatie" : "Factuur";
  // Commissionair-framing: de betaalspecificatie beschrijft de AFNAME door E-Charging,
  // de self-billing factuur de LEVERING door de klant.
  const lineLabel = isPrivate ? "Afname elektriciteit" : "Levering elektriciteit";

  // ── Logo (links) ─────────────────────────────────────────
  const logo = await rasterizeLogo(logoUrl);
  if (logo) {
    const lw = 40;
    const lh = lw / logo.ratio;
    doc.addImage(logo.dataUrl, "JPEG", L, 17, lw, lh);
  } else {
    setFont("bold");
    doc.setFontSize(20);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("E-CHARGING", L, 28);
  }

  // ── Titel (rechts) ───────────────────────────────────────
  setFont("bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(docTitle, R, 24, { align: "right" });
  if (!isPrivate) {
    setFont("bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("SELFBILLING", R, 29.5, { align: "right" });
  }
  setFont("normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${docNrLabel} #${invoiceNr}  ·  ${todayStr}`, R, 35, { align: "right" });

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(L, 42, R, 42);

  // ── Van / Naar ───────────────────────────────────────────
  const partyTop = 52;
  const rightX = 110;

  const drawParty = (x: number, heading: string, lines: string[], mutedFrom: number): number => {
    setFont("bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_GREEN);
    doc.text(heading, x, partyTop);
    let yy = partyTop + 6;
    lines.forEach((ln, i) => {
      setFont(i === 0 ? "bold" : "normal");
      doc.setFontSize(i === 0 ? 9.5 : 9);
      doc.setTextColor(...(i >= mutedFrom ? MUTED : INK));
      doc.text(ln, x, yy);
      yy += i === 0 ? 5.2 : 4.6;
    });
    return yy;
  };

  const postalCity = [client.billing_address_postal, client.billing_address_city].filter(Boolean).join(" ");
  const clientLines = [
    client.company_name || "Klant",
    client.contact_name || "",
    client.billing_address_street || "",
    postalCity,
    client.country || "Nederland",
    client.client_number ? `Klantnr. ${client.client_number}` : "",
    client.kvk ? `KVK ${client.kvk}` : "",
    client.btw_number ? `BTW ${client.btw_number}` : "",
  ].filter((l) => l && l.trim().length > 0);
  // KVK/BTW/klantnr (de muted regels) staan achteraan; bepaal vanaf welke index muted.
  const clientMutedFrom = clientLines.findIndex((l) => l.startsWith("Klantnr.") || l.startsWith("KVK") || l.startsWith("BTW"));

  // Gesplitst org-adres; legacy enkelvoudig adres alleen als defensieve fallback.
  const orgPostalCity = [org?.address_postal, org?.address_city].filter(Boolean).join(" ");
  const orgLines = [
    orgName,
    org?.address_street || (orgPostalCity ? "" : org?.address || ""),
    orgPostalCity,
    org?.country || "Nederland",
    org?.email || "",
    org?.kvk ? `KVK ${org.kvk}` : "",
    org?.btw_number ? `BTW ${org.btw_number}` : "",
  ].filter((l) => l && l.trim().length > 0);
  const orgMutedFrom = orgLines.findIndex((l) => l.startsWith("KVK") || l.startsWith("BTW"));

  // Richting hangt af van het documenttype (commissionairs-handboek):
  //   self-billing factuur → Van = klant (leverancier), Naar = E-Charging (afnemer)
  //   betaalspecificatie   → Van = E-Charging (opsteller), Naar = klant
  const leftLines = isPrivate ? orgLines : clientLines;
  const leftMutedFrom = isPrivate ? orgMutedFrom : clientMutedFrom;
  const rightLines = isPrivate ? clientLines : orgLines;
  const rightMutedFrom = isPrivate ? clientMutedFrom : orgMutedFrom;

  const leftBottom = drawParty(L, "VAN", leftLines, leftMutedFrom < 0 ? leftLines.length : leftMutedFrom);
  const rightBottom = drawParty(rightX, "NAAR", rightLines, rightMutedFrom < 0 ? rightLines.length : rightMutedFrom);

  let cursor = Math.max(leftBottom, rightBottom) + 10;

  // ── Uitbetaal-notitie (groen, geen kader) ────────────────
  const iban = paymentDetails?.payout_iban;
  const holder = paymentDetails?.payout_account_holder_name;
  setFont("bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(
    isPrivate
      ? "Deze betaalspecificatie wordt aan u uitbetaald. U hoeft niets te betalen."
      : "Deze factuur wordt aan u uitbetaald. U hoeft niets te betalen.",
    L, cursor,
  );
  cursor += 4.5;
  // Uitbetaalrekening van de klant (de eigenaar ontvangt het geld).
  if (iban || holder) {
    setFont("normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const payParts = [iban ? `Uitbetaling op ${iban}` : "", holder ? `t.n.v. ${holder}` : ""].filter(Boolean);
    doc.text(payParts.join("  ·  "), L, cursor);
    cursor += 5;
  }
  // Self-billing-markering (Wet OB art. 35a) geldt alleen voor een btw-ondernemer-leverancier.
  // Een particulier/KOR reikt geen btw-factuur uit → betaalspecificatie zonder deze vermelding.
  if (!isPrivate) {
    setFont("bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text("Factuur uitgereikt door afnemer", L, cursor);
    cursor += 4.2;
    setFont("normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `Self-billing: opgesteld en uitgereikt door ${orgName} (afnemer) namens ${client.company_name || "de leverancier"}.`,
      L, cursor,
    );
    cursor += 4;
    doc.text("Geen bezwaar binnen 14 dagen geldt als aanvaarding.", L, cursor);
    cursor += 9;
  } else {
    cursor += 4.5;
  }

  // ── Meta-rij (geen vlak, alleen dunne regels) ────────────
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(L, cursor, R, cursor);
  const meta: Array<[string, string]> = [
    [isPrivate ? "SPECIFICATIENR" : "FACTUURNR", `#${invoiceNr}`],
    ["DATUM", todayStr],
    ["PERIODE", `${fmtDate(settlement.period_start)} – ${fmtDate(settlement.period_end)}`],
    ["BETAALTERMIJN", "30 dagen"],
  ];
  const colW = W / meta.length;
  meta.forEach(([label, value], i) => {
    const cx = L + i * colW;
    setFont("bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label, cx, cursor + 5);
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(value, cx, cursor + 10);
  });
  cursor += 13;
  doc.line(L, cursor, R, cursor);
  cursor += 12;

  // ── Regelitem (één netto-regel) ──────────────────────────
  setFont("bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("OMSCHRIJVING", L, cursor);
  doc.text("BEDRAG", R, cursor, { align: "right" });
  cursor += 2.5;
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.3);
  doc.line(L, cursor, R, cursor);
  cursor += 7;

  setFont("normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(`${lineLabel} ${periodLabel}`, L, cursor);
  setFont("bold");
  doc.text(euro(subtotal), R, cursor, { align: "right" });
  cursor += 4.5;
  setFont("normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${settlement.total_sessions ?? 0} ${(settlement.total_sessions ?? 0) === 1 ? "laadsessie" : "laadsessies"} · ${nlNum(totalKwh, 2)} kWh`, L, cursor);
  cursor += 12;

  // ── Totalen (rechts) — alléén de stroom; geen activatie/saldering ──
  const labelX = 128;
  const totalRow = (label: string, value: string) => {
    doc.text(label, labelX, cursor);
    doc.text(value, R, cursor, { align: "right" });
    cursor += 5.5;
  };
  if (hasVat) {
    setFont("normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    totalRow("Subtotaal (excl. BTW)", euro(subtotal));
    totalRow(`BTW ${vatPct}%`, euro(btw));
    cursor -= 2; // strak vóór de scheidingslijn
  }
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.3);
  doc.line(labelX, cursor, R, cursor);
  cursor += 5.5;
  setFont("bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(hasVat ? "Totaal incl. BTW" : "Totaal", labelX, cursor);
  doc.text(euro(hasVat ? inclBtw : subtotal), R, cursor, { align: "right" });

  // 0%-vermelding (Wet OB: de reden moet op het document staan). Op de betaalspecificatie
  // letterlijk zoals het handboek: "Geen omzetbelasting in rekening gebracht." + de reden.
  if (!hasVat) {
    cursor += 5;
    setFont("normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Geen omzetbelasting in rekening gebracht.", R, cursor, { align: "right" });
    cursor += 3.6;
    const reason = vatStatus === "kor"
      ? "Kleineondernemersregeling van toepassing."
      : vatStatus === "private"
      ? "Leverancier is geen ondernemer voor de omzetbelasting."
      : "Geen BTW van toepassing.";
    doc.text(reason, R, cursor, { align: "right" });
  }

  // ── Pagina 2+: transactiespecificatie (netto per sessie) ─
  // Portaal levert netto sessielijnen aan (geen bruto/fee in de browser); de admin
  // laat ze leeg en haalt ze zelf op, met netto = bruto − fee×kWh.
  let lines: InvoiceSessionLine[] = [];
  if (sessionLines && sessionLines.length > 0) {
    lines = sessionLines;
  } else {
    const clientId = settlement.client_id ?? client.id ?? null;
    if (clientId) {
      try {
        const { data } = await getSettlementSessions(clientId, settlement.year, settlement.month);
        const rows = (data ?? []) as unknown as InvoiceSessionRow[];
        lines = rows.map((s) => ({
          started_at: s.started_at,
          charge_point_name: s.charge_points?.name ?? null,
          location_name: s.locations?.name ?? null,
          duration_minutes: s.duration_minutes,
          kwh_delivered: s.kwh_delivered,
          vergoeding: Number(s.reimbursement_amount || 0) - feePerKwh * Number(s.kwh_delivered || 0),
        }));
      } catch {
        lines = [];
      }
    }
  }
  // Chronologisch oplopend voor de specificatie (RPC levert aflopend).
  lines = [...lines].sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""));

  if (lines.length > 0) {
    doc.addPage();
    setFont("bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text("Specificatie van de laadsessies", L, 22);
    setFont("normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Laadsessies ${periodLabel} — ${lines.length} ${lines.length === 1 ? "sessie" : "sessies"}`, L, 28);
    doc.setFontSize(8);
    doc.text(`Onderstaande laadsessies vormen samen het bedrag over ${periodLabel}.`, L, 33);

    const body = lines.map((l) => [
      fmtDate(l.started_at),
      l.charge_point_name ?? "—",
      l.location_name ?? "—",
      fmtDuration(l.duration_minutes),
      nlNum(l.kwh_delivered, 3),
      euro(l.vergoeding),
    ]);

    autoTable(doc, {
      startY: 38,
      margin: { top: 22, left: L, right: 18, bottom: 16 },
      head: [["Datum", "Laadpunt", "Locatie", "Duur", "kWh", "Vergoeding"]],
      body,
      foot: [[
        { content: "Totaal", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: euro(subtotal), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      showHead: "everyPage",
      showFoot: "lastPage",
      theme: "striped",
      styles: {
        font: FONT,
        fontSize: 8,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
        textColor: INK,
        lineColor: [235, 235, 235],
        lineWidth: 0.1,
        overflow: "ellipsize",
        valign: "middle",
      },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 },
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: ZEBRA },
      footStyles: {
        fillColor: [235, 255, 235],
        textColor: GREEN_FOOT,
        fontStyle: "bold",
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 34 },
        2: { cellWidth: 48 },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 26, halign: "right" },
      },
    });

    const afterTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
    if (afterTableY > 0 && afterTableY < pageH - 24) {
      setFont("normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text("Dit totaal komt overeen met het bedrag op pagina 1 (excl. BTW).", L, afterTableY + 6);
    }
  }

  // ── Footer + paginanummers (slot-loop) ───────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setFont("normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(L, pageH - 13, R, pageH - 13);
    if (p === 1 && org?.email) doc.text(`Vragen? ${org.email}`, L, pageH - 9);
    doc.text(`Pagina ${p} / ${pageCount}`, R, pageH - 9, { align: "right" });
  }

  return doc;
}

/** Genereert en downloadt de factuur (browser). Werpt InvoiceValidationError
 *  met een NL-veldenlijst zolang verplichte gegevens ontbreken. */
export async function generateSelfBillingInvoicePdf(
  settlement: SelfBillingSettlement,
  client: SelfBillingClient,
  org?: SelfBillingOrg | null,
  paymentDetails?: SelfBillingPaymentDetails | null,
  sessionLines?: InvoiceSessionLine[] | null,
): Promise<void> {
  const doc = await buildSelfBillingInvoicePdf(settlement, client, org, paymentDetails, sessionLines);
  const mm = String(settlement.month).padStart(2, "0");
  const safeName = (client.company_name || "klant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const kind = isBetaalspecificatie(settlement.vat_status ?? client.vat_status) ? "betaalspecificatie" : "vergoedingsfactuur";
  doc.save(`${kind}-${safeName}-${settlement.year}-${mm}.pdf`);
}
