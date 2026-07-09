import { describe, expect, it } from "vitest";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "./calcTypes";
import { generateLeveringText } from "./calcLeveringText";
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

describe("generateLeveringText", () => {
  it("bouwt de alinea's uit de samenvatting (meervoud + amperage)", () => {
    const text = generateLeveringText({
      chargerModel: "Zaptec GO 2 Asphalt Black",
      numSockets: 10,
      numPoles: 5,
      loadBalancerModel: "Zaptec Sense",
      eindgroepen: 5,
      eindgroepAmperage: 32,
    });
    expect(text).toContain("10 stuks Zaptec GO 2 Asphalt Black gemonteerd op 5 stuks nieuwe laadpalen.");
    expect(text).toContain("Zaptec Sense geplaatst");
    expect(text).toContain("5 eindgroepen van 32A.");
    expect(text.split("\n\n")).toHaveLength(3);
  });

  it("enkelvoud en weggelaten onderdelen", () => {
    const text = generateLeveringText({ chargerModel: "Peblar Home 11kW", numSockets: 1, eindgroepen: 1 });
    expect(text).toContain("1 stuk Peblar Home 11kW.");
    expect(text).not.toContain("load balancing");
    expect(text).toContain("1 eindgroep.");
  });

  it("leeg bij ontbrekende kerngegevens", () => {
    expect(generateLeveringText({})).toBe("");
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
});
