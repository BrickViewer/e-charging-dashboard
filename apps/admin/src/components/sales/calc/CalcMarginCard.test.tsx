import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalcMarginCard } from "./CalcMarginCard";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "@/services/calcTypes";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
  labor_cost_rate: 50,
  km_price: 0,
  retour_km: 0,
  travel_days: 1,
  stelpost_graafwerk: 0,
  stelpost_note: "",
};

const materiaal = (unit_cost: number): CalcLineDraft => ({
  uid: "u1",
  line_type: "product",
  product_id: null,
  description: "Zaptec PRO",
  category: "laadpalen",
  supplier: null,
  order_number: null,
  unit: "stuk",
  qty: 3,
  unit_gross: 0,
  unit_cost,
  unit_sell: 1151.56,
  unit_hours: 0,
  position: 0,
});

const uren = (qty: number): CalcLineDraft => ({
  uid: "u2",
  line_type: "uren",
  product_id: null,
  description: "Montage",
  category: "arbeid",
  supplier: null,
  order_number: null,
  unit: "uur",
  qty,
  unit_gross: 0,
  unit_cost: 0,
  unit_sell: 0,
  unit_hours: 1,
  position: 1,
});

/** 3 × 921,25 = € 2.763,75 netto inkoop. */
const totalsMetMateriaal = computeTotals([materiaal(921.25)], header);
const totalsZonderMateriaal = computeTotals([], header);
/** Zelfde materiaal + 8 montage-uren → € 400 arbeidsinkoop bij e-group. */
const totalsMetUren = computeTotals([materiaal(921.25), uren(8)], header);

const kaart = (totals: typeof totalsMetMateriaal, commercialPrice: number) =>
  render(<CalcMarginCard totals={totals} commercialPrice={commercialPrice} laborCostRate={header.labor_cost_rate} />);

/** De waarde-span naast een label. `selector: "span"` onderscheidt het
    rij-label van de gelijknamige kaarttitel. */
const waarde = (label: string | RegExp) =>
  screen.getByText(label, { selector: "span" }).parentElement!.querySelector("span:last-child")!;
const marge = () => waarde("Marge");
const margePct = () => waarde("Marge %");
const arbeidEgroup = () => waarde(/− Arbeid e-group/);

describe("CalcMarginCard", () => {
  it("toont de som: commerciële prijs − materiaalinkoop − arbeid e-group = marge, met percentage", () => {
    kaart(totalsMetMateriaal, 4050);
    expect(screen.getByText("Commerciële prijs")).toBeInTheDocument();
    expect(screen.getByText("− Materiaal inkoop")).toBeInTheDocument();
    expect(screen.getByText(/− Arbeid e-group/)).toBeInTheDocument();
    expect(marge()).toHaveTextContent("1.286,25");
    expect(margePct()).toHaveTextContent("31,8%");
    expect(marge()).toHaveClass("text-primary");
  });

  it("trekt de arbeidsinkoop bij e-group van de marge af en toont uren × tarief", () => {
    kaart(totalsMetUren, 4050);
    // 8 u × € 50 = € 400 inkoop; marge 4050 − 2763,75 − 400 = 886,25
    expect(screen.getByText(/− Arbeid e-group \(8 u ×/)).toBeInTheDocument();
    expect(arbeidEgroup()).toHaveTextContent("400,00");
    expect(marge()).toHaveTextContent("886,25");
  });

  it("rekent 100% marge als er geen materiaal en arbeid in de calculatie zit", () => {
    kaart(totalsZonderMateriaal, 500);
    expect(arbeidEgroup()).toHaveTextContent("0,00");
    expect(marge()).toHaveTextContent("500,00");
    expect(margePct()).toHaveTextContent("100,0%");
    expect(marge()).toHaveClass("text-primary");
  });

  it("kleurt rood als de prijs onder de materiaalinkoop ligt", () => {
    kaart(totalsMetMateriaal, 2000);
    expect(marge()).toHaveTextContent("-763,75");
    expect(margePct()).toHaveTextContent("-38,2%");
    expect(marge()).toHaveClass("text-destructive");
    expect(margePct()).toHaveClass("text-destructive");
  });

  it("toont een streepje en kleurt rood bij een lege calculatie", () => {
    // pct is dan null, maar de marge is nul — en nul hoort al op te vallen.
    kaart(totalsZonderMateriaal, 0);
    expect(marge()).toHaveTextContent("0,00");
    expect(margePct()).toHaveTextContent("—");
    expect(marge()).toHaveClass("text-destructive");
  });
});
