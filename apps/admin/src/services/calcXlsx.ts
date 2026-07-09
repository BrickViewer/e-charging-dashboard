// Genereert het interne calculatie-Excel (xlsx) voor het SharePoint-dossier.
// Drie tabbladen naar het model van de oude werk-Excel:
//   Voorblad    — project/offertenummer, totalen, offerteprijs, stelpost
//   Calculatie  — alle regels met inkoop/verkoop/uren + marge en kostenblokken
//   Bestellijst — te bestellen materiaal, gegroepeerd per leverancier (netto)
// exceljs wordt lazy geïmporteerd zodat het niet in de hoofdbundle zit.

import type { CalcHeaderDraft, CalcLineDraft, CalcSummary, CalcTotals } from "./calcTypes";
import { lineTotals } from "./calcTypes";

export interface CalcXlsxInput {
  quoteNumber: string;
  projectLabel: string;
  header: CalcHeaderDraft;
  summary: CalcSummary;
  totals: CalcTotals;
  offerPrice: number;
  lines: CalcLineDraft[];
}

const EURO_FMT = '€ #,##0.00';

export async function buildCalcXlsx(input: CalcXlsxInput): Promise<Uint8Array> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "E-Charging dashboard";

  const bold = { bold: true } as const;

  // ---- Voorblad -------------------------------------------------------------
  const cover = wb.addWorksheet("Voorblad");
  cover.columns = [{ width: 30 }, { width: 18 }, { width: 40 }];
  cover.addRow(["Calculatie laadpaal"]).font = { bold: true, size: 14 };
  cover.addRow([]);
  cover.addRow(["Project:", input.projectLabel]);
  cover.addRow(["Offertenummer:", input.quoteNumber]);
  cover.addRow(["Retour project (km):", input.header.retour_km]);
  cover.addRow([]);
  const rMat = cover.addRow(["Materiaal (verkoop):", input.totals.materialSell]);
  const rMatIn = cover.addRow(["Materiaal (inkoop netto):", input.totals.materialCost]);
  const rMarge = cover.addRow(["Marge materiaal:", input.totals.marginMaterial]);
  const rMont = cover.addRow([`Montage (${input.totals.hoursTotal} u × € ${input.header.hourly_rate}):`, input.totals.laborSell]);
  const rVoor = cover.addRow(["Voorrijkosten:", input.totals.travelSell]);
  const rTot = cover.addRow(["Totaal calculatie:", input.totals.totalSell]);
  const rPrijs = cover.addRow(["Offerteprijs installatie:", input.offerPrice]);
  rTot.font = bold;
  rPrijs.font = bold;
  for (const row of [rMat, rMatIn, rMarge, rMont, rVoor, rTot, rPrijs]) row.getCell(2).numFmt = EURO_FMT;
  if (input.header.stelpost_graafwerk > 0) {
    const rStel = cover.addRow(["Stelpost graafwerk (apart in offerte):", input.header.stelpost_graafwerk, input.header.stelpost_note || ""]);
    rStel.getCell(2).numFmt = EURO_FMT;
  }
  cover.addRow([]);
  const s = input.summary;
  if (s.chargerModel || s.numSockets || s.eindgroepen) {
    cover.addRow(["Installatie"]).font = bold;
    if (s.chargerModel) cover.addRow(["Laadpaal-model:", s.chargerModel]);
    if (s.numSockets) cover.addRow(["Laadpunten:", s.numSockets]);
    if (s.numPoles) cover.addRow(["Laadpalen (fysiek):", s.numPoles]);
    if (s.loadBalancerModel) cover.addRow(["Load balancer:", s.loadBalancerModel]);
    if (s.eindgroepen) cover.addRow(["Eindgroepen:", `${s.eindgroepen}× ${s.eindgroepAmperage ?? ""}A`]);
  }

  // ---- Calculatie -----------------------------------------------------------
  const sheet = wb.addWorksheet("Calculatie");
  sheet.columns = [
    { header: "Artikel", width: 52 },
    { header: "Leverancier", width: 14 },
    { header: "Bestelnummer", width: 20 },
    { header: "Eenheid", width: 9 },
    { header: "Aantal", width: 9 },
    { header: "Inkoop bruto", width: 13 },
    { header: "Inkoop netto", width: 13 },
    { header: "Verkoop p/st", width: 13 },
    { header: "Totaal inkoop", width: 14 },
    { header: "Totaal verkoop", width: 14 },
    { header: "Uren", width: 9 },
  ];
  sheet.getRow(1).font = bold;
  for (const l of input.lines) {
    const t = lineTotals(l);
    const row = sheet.addRow([
      l.description,
      l.supplier ?? "",
      l.order_number ?? "",
      l.unit,
      l.qty,
      l.line_type === "uren" ? null : l.unit_gross,
      l.line_type === "uren" ? null : l.unit_cost,
      l.line_type === "uren" ? null : l.unit_sell,
      l.line_type === "uren" ? null : t.cost,
      l.line_type === "uren" ? null : t.sell,
      t.hours || null,
    ]);
    for (const c of [6, 7, 8, 9, 10]) row.getCell(c).numFmt = EURO_FMT;
  }
  sheet.addRow([]);
  const totalRow = sheet.addRow(["Totaal materiaal", "", "", "", "", "", "", "", input.totals.materialCost, input.totals.materialSell, input.totals.hoursTotal]);
  totalRow.font = bold;
  totalRow.getCell(9).numFmt = EURO_FMT;
  totalRow.getCell(10).numFmt = EURO_FMT;
  const margeRow = sheet.addRow(["Marge materiaal", "", "", "", "", "", "", "", "", input.totals.marginMaterial]);
  margeRow.getCell(10).numFmt = EURO_FMT;
  sheet.addRow([]);
  const uurloonRow = sheet.addRow([`Uurloon € ${input.header.hourly_rate} × ${input.totals.hoursTotal} uur`, "", "", "", "", "", "", "", "", input.totals.laborSell]);
  uurloonRow.getCell(10).numFmt = EURO_FMT;
  const voorRow = sheet.addRow([`Voorrijkosten ${input.header.retour_km} km × € ${input.header.km_price} × ${input.header.travel_days} dag(en)`, "", "", "", "", "", "", "", "", input.totals.travelSell]);
  voorRow.getCell(10).numFmt = EURO_FMT;
  const eindRow = sheet.addRow(["TOTAAL", "", "", "", "", "", "", "", "", input.totals.totalSell]);
  eindRow.font = bold;
  eindRow.getCell(10).numFmt = EURO_FMT;

  // ---- Bestellijst (per leverancier) -----------------------------------------
  const order = wb.addWorksheet("Bestellijst");
  order.columns = [
    { header: "Leverancier", width: 16 },
    { header: "Bestelnummer", width: 20 },
    { header: "Artikel", width: 52 },
    { header: "Aantal", width: 9 },
    { header: "Eenheid", width: 9 },
    { header: "Netto p/st", width: 12 },
    { header: "Totaal netto", width: 13 },
  ];
  order.getRow(1).font = bold;
  const material = input.lines.filter((l) => l.line_type !== "uren" && l.qty > 0);
  const bySupplier = new Map<string, CalcLineDraft[]>();
  for (const l of material) {
    const key = (l.supplier ?? "").trim() || "Onbekend / n.t.b.";
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), l]);
  }
  for (const [supplier, items] of [...bySupplier.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const l of items) {
      const row = order.addRow([supplier, l.order_number ?? "", l.description, l.qty, l.unit, l.unit_cost, lineTotals(l).cost]);
      row.getCell(6).numFmt = EURO_FMT;
      row.getCell(7).numFmt = EURO_FMT;
    }
    order.addRow([]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
