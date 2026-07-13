import { describe, expect, it } from "vitest";
import {
  commercialMargin,
  commercialPriceFor,
  computeTotals,
  GEEN_COMMERCIELE_PRIJS_KEUZE,
  hoursSplit,
  r2,
  restoreCommercialPriceChoice,
  roundUpTo,
  sectionOfLine,
  sectionSellSubtotal,
  sortLinesBySection,
  type CalcHeaderDraft,
  type CalcLineDraft,
} from "./calcTypes";
import { calcToLineItems } from "./calcPrefill";
import { formatPercent } from "./calculations";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
  labor_cost_rate: 50,
  km_price: 0.75,
  retour_km: 110,
  travel_days: 1,
  stelpost_graafwerk: 900,
  stelpost_note: "",
};

const line = (partial: Partial<CalcLineDraft>): CalcLineDraft => ({
  uid: "u0", // vast, niet via nextUid() — tests moeten deterministisch zijn
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
    expect(t.laborCost).toBe(400); // 8 × 50 — inkoop bij e-group, alleen marge
    expect(t.travelSell).toBe(82.5); // 110 × 0.75 × 1 — als in de Excel
    // De arbeidsinkoop zit NIET in het verkooptotaal
    expect(t.totalSell).toBe(3454.68 + 480 + 82.5);
    // Stelpost telt NIET mee in de commerciële prijs (staat apart in de offerte)
    expect(t.stelpost).toBe(900);
    expect(t.suggestedCommercialPrice).toBe(Math.ceil(t.totalSell));
  });

  it("telt calculatietijd op productregels mee in de uren", () => {
    const lines: CalcLineDraft[] = [line({ qty: 2, unit_sell: 100, unit_cost: 80, unit_hours: 1.5 })];
    const t = computeTotals(lines, { ...header, retour_km: 0, stelpost_graafwerk: 0 });
    expect(t.hoursTotal).toBe(3);
    expect(t.laborSell).toBe(180);
    expect(t.laborCost).toBe(150);
    expect(t.totalSell).toBe(200 + 180);
  });

  it("het inkooptarief raakt het verkooptotaal en het prijsvoorstel nooit", () => {
    const lines: CalcLineDraft[] = [line({ line_type: "uren", unit: "uur", qty: 8, unit_hours: 1 })];
    const goedkoop = computeTotals(lines, { ...header, labor_cost_rate: 10 });
    const duur = computeTotals(lines, { ...header, labor_cost_rate: 90 });
    expect(duur.totalSell).toBe(goedkoop.totalSell);
    expect(duur.suggestedCommercialPrice).toBe(goedkoop.suggestedCommercialPrice);
    expect(duur.laborCost - goedkoop.laborCost).toBe(8 * 80);
  });
});

describe("roundUpTo", () => {
  it("rondt altijd naar boven af — nooit onder de calculatie", () => {
    expect(roundUpTo(6050.95, 25)).toBe(6075);
    expect(roundUpTo(6050.95, 50)).toBe(6100);
    expect(roundUpTo(6050.95, 100)).toBe(6100);
  });

  it("laat een bedrag dat al op de stap valt ongemoeid (idempotent)", () => {
    expect(roundUpTo(6100, 50)).toBe(6100);
    expect(roundUpTo(roundUpTo(6050.95, 25), 25)).toBe(6075);
  });

  it("struikelt niet over centen", () => {
    expect(roundUpTo(6100.01, 100)).toBe(6200);
    expect(roundUpTo(3454.68 + 480 + 82.5, 25)).toBe(4025); // = 4017,18
  });

  it("geeft nul terug bij een lege of ongeldige calculatie", () => {
    expect(roundUpTo(0, 50)).toBe(0);
    expect(roundUpTo(-10, 50)).toBe(0);
    expect(roundUpTo(1234.5, 0)).toBe(1234.5);
  });
});

describe("commercialMargin", () => {
  it("trekt de materiaalinkoop van de commerciële prijs af", () => {
    const { amount, pct } = commercialMargin(4050, 2763.75, 0, 0);
    expect(amount).toBe(1286.25);
    expect(formatPercent(pct!)).toBe("31,8%");
  });

  it("trekt óók de arbeidsinkoop bij e-group af", () => {
    // Excel-voorbeeld: 8 uur × € 50 inkoop = 400 extra kosten in de marge.
    const { amount, pct } = commercialMargin(4050, 2763.75, 400, 0);
    expect(amount).toBe(886.25);
    expect(pct).toBe(886.25 / 4050);
  });

  it("trekt óók de voorrijkosten af — die gaan één-op-één naar e-group", () => {
    // 110 km × € 0,75 × 1 dag = € 82,50; er wordt niets op verdiend.
    const { amount } = commercialMargin(4050, 2763.75, 400, 82.5);
    expect(amount).toBe(803.75);
  });

  it("geeft een rauwe fractie terug, niet een afgerond percentage", () => {
    // Zou commercialMargin zelf afronden, dan rondde Intl daar nog eens overheen.
    expect(commercialMargin(4050, 2763.75, 0, 0).pct).toBe(1286.25 / 4050);
  });

  it("is 100% als er geen materiaal, arbeid en voorrijkosten in de calculatie zitten", () => {
    const { amount, pct } = commercialMargin(500, 0, 0, 0);
    expect(amount).toBe(500);
    expect(formatPercent(pct!)).toBe("100,0%");
  });

  it("wordt negatief als de prijs onder de inkoop ligt", () => {
    const { amount, pct } = commercialMargin(2000, 2763.75, 0, 0);
    expect(amount).toBe(-763.75);
    expect(formatPercent(pct!)).toBe("-38,2%");
  });

  it("heeft geen percentage zonder commerciële prijs", () => {
    expect(commercialMargin(0, 0, 0, 0)).toEqual({ amount: 0, pct: null });
    expect(commercialMargin(0, 500, 0, 0)).toEqual({ amount: -500, pct: null });
  });
});

describe("commerciële prijs volgt de calculatie", () => {
  const totalsVoor = computeTotals([line({ qty: 1, unit_sell: 4017.18 })], { ...header, retour_km: 0, stelpost_graafwerk: 0 });
  const totalsNa = computeTotals([line({ qty: 1, unit_sell: 4500 })], { ...header, retour_km: 0, stelpost_graafwerk: 0 });

  it("volgt zonder keuze het voorstel", () => {
    expect(commercialPriceFor(totalsVoor, GEEN_COMMERCIELE_PRIJS_KEUZE)).toBe(4018);
    expect(commercialPriceFor(totalsNa, GEEN_COMMERCIELE_PRIJS_KEUZE)).toBe(4500);
  });

  it("laat een afrondstap MEEBEWEGEN met de calculatie", () => {
    // De kern van de bug: een pill is een regel, geen bevroren bedrag.
    const keuze = { roundStep: 50, manual: null };
    expect(commercialPriceFor(totalsVoor, keuze)).toBe(4050);
    expect(commercialPriceFor(totalsNa, keuze)).toBe(4500);
  });

  it("laat een handmatig bedrag juist wél staan", () => {
    const keuze = { roundStep: null, manual: 3950 };
    expect(commercialPriceFor(totalsVoor, keuze)).toBe(3950);
    expect(commercialPriceFor(totalsNa, keuze)).toBe(3950);
  });

  describe("terughalen van een opgeslagen prijs", () => {
    it("herkent een afrondstap en herstelt de regel", () => {
      expect(restoreCommercialPriceChoice(totalsVoor, 4050)).toEqual({ roundStep: 50, manual: null });
      expect(restoreCommercialPriceChoice(totalsVoor, 4100)).toEqual({ roundStep: 100, manual: null });
    });

    it("ziet het voorstel als 'geen keuze', zodat de prijs blijft volgen", () => {
      expect(restoreCommercialPriceChoice(totalsVoor, 4018)).toEqual(GEEN_COMMERCIELE_PRIJS_KEUZE);
      expect(restoreCommercialPriceChoice(totalsVoor, null)).toEqual(GEEN_COMMERCIELE_PRIJS_KEUZE);
    });

    it("houdt een afwijkend bedrag als handmatige keuze", () => {
      expect(restoreCommercialPriceChoice(totalsVoor, 3950)).toEqual({ roundStep: null, manual: 3950 });
    });
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
    const commercialPrice = totals.suggestedCommercialPrice; // 4018
    const items = calcToLineItems(lines, totals, commercialPrice);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ description: "Zaptec PRO", qty: 3, unit_price: 1151.56 });
    expect(items[1].description).toBe("Installatie & montage");
    // Som van de klantregels = exact de afgeronde commerciële prijs
    const sum = items.reduce((acc, i) => acc + i.total, 0);
    expect(Math.round(sum * 100) / 100).toBe(commercialPrice);
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
    const prijs = totals.suggestedCommercialPrice;
    const gesorteerd = calcToLineItems(sortLinesBySection(lines), totals, prijs);
    // Laadpalen staan nu vóór installatiemateriaal, en uren gaan nooit mee.
    expect(gesorteerd.map((i) => i.description)).toEqual(["Zaptec PRO", "Kabel", "Installatie & montage"]);
    const som = gesorteerd.reduce((acc, i) => acc + i.total, 0);
    expect(r2(som)).toBe(prijs);
    expect(r2(som)).toBe(r2(calcToLineItems(lines, totals, prijs).reduce((acc, i) => acc + i.total, 0)));
  });

  it("laat het client-side regel-id nooit naar de klantregels lekken", () => {
    // calcToLineItems noemt zijn velden expliciet; deze test bewaakt dat een
    // toekomstige `{...line}`-spread `uid` niet stilletjes meesmokkelt.
    const lines: CalcLineDraft[] = [line({ uid: "UID-LEK-CANARY", description: "Zaptec PRO", qty: 1, unit_sell: 100 })];
    const totals = computeTotals(lines, header);
    expect(JSON.stringify(calcToLineItems(lines, totals, 100))).not.toContain("UID-LEK-CANARY");
  });

  it("lege omschrijving krijgt een nette fallback (geen em-dash naar de klant)", () => {
    const lines: CalcLineDraft[] = [line({ description: "  ", qty: 1, unit_sell: 100 })];
    const totals = computeTotals(lines, { ...header, retour_km: 0, stelpost_graafwerk: 0 });
    const items = calcToLineItems(lines, totals, 100);
    expect(items[0].description).toBe("Materiaal");
    expect(JSON.stringify(items)).not.toContain("—");
  });
});
