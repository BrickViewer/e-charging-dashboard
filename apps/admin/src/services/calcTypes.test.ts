import { describe, expect, it } from "vitest";
import {
  computeTotals,
  hoursSplit,
  r2,
  sectionOfLine,
  sectionSellSubtotal,
  sortLinesBySection,
  type CalcHeaderDraft,
  type CalcLineDraft,
} from "./calcTypes";
import { calcToLineItems } from "./calcPrefill";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
  km_price: 0.75,
  retour_km: 110,
  travel_days: 1,
  stelpost_graafwerk: 900,
  stelpost_note: "",
};

const line = (partial: Partial<CalcLineDraft>): CalcLineDraft => ({
  line_type: "product",
  product_id: null,
  description: "x",
  category: null,
  supplier: null,
  order_number: null,
  unit: "stuk",
  qty: 1,
  unit_gross: 0,
  unit_cost: 0,
  unit_sell: 0,
  unit_hours: 0,
  position: 0,
  ...partial,
});

describe("computeTotals", () => {
  it("spiegelt het Excel-voorbeeld: materiaal + uurloon×uren + voorrijkosten, stelpost apart", () => {
    // Vereenvoudigd naar het Excel-model: 3× Zaptec PRO (verkoop 1151.56, netto 921.248)
    const lines: CalcLineDraft[] = [
      line({ qty: 3, unit_sell: 1151.56, unit_cost: 921.25 }),
      line({ line_type: "uren", description: "Montage + inregelen", unit: "uur", qty: 8, unit_hours: 1 }),
    ];
    const t = computeTotals(lines, header);
    expect(t.materialSell).toBe(3454.68);
    expect(t.materialCost).toBe(2763.75);
    expect(t.marginMaterial).toBe(690.93);
    expect(t.hoursTotal).toBe(8);
    expect(t.laborSell).toBe(480); // 8 × 60 — als in de Excel
    expect(t.travelSell).toBe(82.5); // 110 × 0.75 × 1 — als in de Excel
    expect(t.totalSell).toBe(3454.68 + 480 + 82.5);
    // Stelpost telt NIET mee in de offerteprijs (staat apart in de offerte)
    expect(t.stelpost).toBe(900);
    expect(t.suggestedOfferPrice).toBe(Math.ceil(t.totalSell));
  });

  it("telt calculatietijd op productregels mee in de uren", () => {
    const lines: CalcLineDraft[] = [line({ qty: 2, unit_sell: 100, unit_cost: 80, unit_hours: 1.5 })];
    const t = computeTotals(lines, { ...header, retour_km: 0, stelpost_graafwerk: 0 });
    expect(t.hoursTotal).toBe(3);
    expect(t.laborSell).toBe(180);
    expect(t.totalSell).toBe(200 + 180);
  });
});

describe("sectionOfLine", () => {
  it("routeert urenregels naar arbeid en laadpalen naar hun eigen sectie", () => {
    expect(sectionOfLine(line({ line_type: "uren", category: "arbeid" }))).toBe("arbeid");
    expect(sectionOfLine(line({ category: "laadpalen" }))).toBe("laadpalen");
    expect(sectionOfLine(line({ category: "installatiemateriaal" }))).toBe("installatiemateriaal");
  });

  it("vangt 'overig' en een lege categorie op in installatiemateriaal", () => {
    expect(sectionOfLine(line({ category: "overig" }))).toBe("installatiemateriaal");
    expect(sectionOfLine(line({ category: null }))).toBe("installatiemateriaal");
  });

  it("houdt een materiaalregel met categorie 'arbeid' uit de arbeid-sectie", () => {
    // Kritiek: de arbeid-sectie toont geen kost/verkoop-kolommen, maar
    // computeTotals telt een niet-urenregel WEL mee in materiaal. Zo'n regel
    // mag daar dus nooit landen, anders is zijn kostprijs onzichtbaar.
    expect(sectionOfLine(line({ line_type: "product", category: "arbeid" }))).toBe("installatiemateriaal");
    expect(sectionOfLine(line({ line_type: "vrij", category: "arbeid" }))).toBe("installatiemateriaal");
  });
});

describe("sortLinesBySection", () => {
  const mixed = (): CalcLineDraft[] => [
    line({ description: "uren-1", line_type: "uren", category: "arbeid" }),
    line({ description: "inst-1", category: "installatiemateriaal" }),
    line({ description: "paal-1", category: "laadpalen" }),
    line({ description: "inst-2", category: "overig" }),
    line({ description: "paal-2", category: "laadpalen" }),
  ];
  const namen = (ls: CalcLineDraft[]) => ls.map((l) => l.description);

  it("groepeert in bladvolgorde en houdt de volgorde binnen een sectie", () => {
    expect(namen(sortLinesBySection(mixed()))).toEqual(["paal-1", "paal-2", "inst-1", "inst-2", "uren-1"]);
  });

  it("muteert de invoer niet", () => {
    const input = mixed();
    const voor = namen(input);
    sortLinesBySection(input);
    expect(namen(input)).toEqual(voor);
  });

  it("is idempotent", () => {
    const eenmaal = sortLinesBySection(mixed());
    expect(namen(sortLinesBySection(eenmaal))).toEqual(namen(eenmaal));
  });
});

describe("het blad reconcilieert met de totalen", () => {
  // Een gemengd blad: laadpaal, meterkast (draagt 8 uur calculatietijd),
  // vrije regel zonder categorie, en een losse urenregel van 4 uur.
  const lines: CalcLineDraft[] = [
    line({ description: "Zaptec GO 2", category: "laadpalen", qty: 2, unit_sell: 834, unit_cost: 667.2 }),
    line({ description: "Meterkast", category: "installatiemateriaal", qty: 1, unit_sell: 2280, unit_cost: 1900, unit_hours: 8 }),
    line({ description: "Vrije regel", line_type: "vrij", category: null, qty: 1, unit_sell: 50, unit_cost: 40 }),
    line({ description: "Montage", line_type: "uren", category: "arbeid", unit: "uur", qty: 4, unit_hours: 1 }),
  ];

  it("de sectie-subtotalen tellen exact op tot materialSell", () => {
    const t = computeTotals(lines, header);
    const laadpalen = sectionSellSubtotal(lines, "laadpalen");
    const installatie = sectionSellSubtotal(lines, "installatiemateriaal");
    expect(laadpalen).toBe(1668);
    expect(installatie).toBe(2330); // meterkast 2280 + vrije regel 50
    expect(r2(laadpalen + installatie)).toBe(t.materialSell);
    // De arbeid-sectie levert geen materiaal — anders telde een regel dubbel.
    expect(sectionSellSubtotal(lines, "arbeid")).toBe(0);
  });

  it("materiaal + montage + voorrijkosten is het totaal dat rechts staat", () => {
    const t = computeTotals(lines, header);
    expect(r2(t.materialSell + t.laborSell + t.travelSell)).toBe(t.totalSell);
  });

  it("splitst de uren in eigen urenregels en calculatietijd uit materiaal", () => {
    const t = computeTotals(lines, header);
    const { fromUrenLines, fromProductLines } = hoursSplit(lines);
    expect(fromUrenLines).toBe(4); // de urenregel
    expect(fromProductLines).toBe(8); // de meterkast
    expect(r2(fromUrenLines + fromProductLines)).toBe(t.hoursTotal);
    expect(t.laborSell).toBe(12 * 60);
  });

  it("sorteren op sectie verandert geen enkel bedrag", () => {
    const voor = computeTotals(lines, header);
    const na = computeTotals(sortLinesBySection(lines), header);
    expect(na).toEqual(voor);
  });
});

describe("calcToLineItems", () => {
  it("materiaal op verkoopprijs + één montage-regel die optelt tot de afgeronde prijs; geen uren", () => {
    const lines: CalcLineDraft[] = [
      line({ description: "Zaptec PRO", qty: 3, unit_sell: 1151.56, unit_cost: 921.25 }),
      line({ line_type: "uren", description: "Montage", unit: "uur", qty: 8, unit_hours: 1 }),
    ];
    const totals = computeTotals(lines, header);
    const offerPrice = totals.suggestedOfferPrice; // 4018
    const items = calcToLineItems(lines, totals, offerPrice);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ description: "Zaptec PRO", qty: 3, unit_price: 1151.56 });
    expect(items[1].description).toBe("Installatie & montage");
    // Som van de klantregels = exact de afgeronde offerteprijs
    const sum = items.reduce((acc, i) => acc + i.total, 0);
    expect(Math.round(sum * 100) / 100).toBe(offerPrice);
    // Nooit uren of kostprijzen richting klant
    expect(JSON.stringify(items)).not.toContain("921.25");
    expect(JSON.stringify(items)).not.toContain('"8"');
  });

  it("afgeronde prijs lager dan materiaal-verkoop → kortingsregel houdt de som kloppend", () => {
    const lines: CalcLineDraft[] = [line({ description: "Zaptec PRO", qty: 2, unit_sell: 1000, unit_cost: 800 })];
    const totals = computeTotals(lines, { ...header, retour_km: 0, stelpost_graafwerk: 0 });
    const items = calcToLineItems(lines, totals, 1900); // handmatig onder materiaal-verkoop (2000)
    const korting = items.find((i) => i.description === "Korting");
    expect(korting?.total).toBe(-100);
    const sum = items.reduce((acc, i) => acc + i.total, 0);
    expect(Math.round(sum * 100) / 100).toBe(1900);
  });

  it("sorteren op sectie hergroepeert de offerteregels zonder de som te raken", () => {
    const lines: CalcLineDraft[] = [
      line({ description: "Kabel", category: "installatiemateriaal", qty: 10, unit_sell: 20 }),
      line({ description: "Zaptec PRO", category: "laadpalen", qty: 2, unit_sell: 1000 }),
      line({ description: "Montage", line_type: "uren", category: "arbeid", unit: "uur", qty: 4, unit_hours: 1 }),
    ];
    const totals = computeTotals(lines, header);
    const prijs = totals.suggestedOfferPrice;
    const gesorteerd = calcToLineItems(sortLinesBySection(lines), totals, prijs);
    // Laadpalen staan nu vóór installatiemateriaal, en uren gaan nooit mee.
    expect(gesorteerd.map((i) => i.description)).toEqual(["Zaptec PRO", "Kabel", "Installatie & montage"]);
    const som = gesorteerd.reduce((acc, i) => acc + i.total, 0);
    expect(r2(som)).toBe(prijs);
    expect(r2(som)).toBe(r2(calcToLineItems(lines, totals, prijs).reduce((acc, i) => acc + i.total, 0)));
  });

  it("lege omschrijving krijgt een nette fallback (geen em-dash naar de klant)", () => {
    const lines: CalcLineDraft[] = [line({ description: "  ", qty: 1, unit_sell: 100 })];
    const totals = computeTotals(lines, { ...header, retour_km: 0, stelpost_graafwerk: 0 });
    const items = calcToLineItems(lines, totals, 100);
    expect(items[0].description).toBe("Materiaal");
    expect(JSON.stringify(items)).not.toContain("—");
  });
});
