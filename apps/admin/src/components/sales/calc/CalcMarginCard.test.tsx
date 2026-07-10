import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalcMarginCard } from "./CalcMarginCard";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "@/services/calcTypes";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
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

/** 3 × 921,25 = € 2.763,75 netto inkoop. */
const totalsMetMateriaal = computeTotals([materiaal(921.25)], header);
const totalsZonderMateriaal = computeTotals([], header);

/** De waarde-span naast een label. `selector: "span"` onderscheidt het
    rij-label van de gelijknamige kaarttitel. */
const waarde = (label: string) =>
  screen.getByText(label, { selector: "span" }).parentElement!.querySelector("span:last-child")!;
const marge = () => waarde("Marge");
const margePct = () => waarde("Marge %");

describe("CalcMarginCard", () => {
  it("toont de som: offerteprijs − materiaalinkoop = marge, met percentage", () => {
    render(<CalcMarginCard totals={totalsMetMateriaal} offerPrice={4050} />);
    expect(screen.getByText("Offerteprijs")).toBeInTheDocument();
    expect(screen.getByText("− Materiaal inkoop")).toBeInTheDocument();
    expect(marge()).toHaveTextContent("1.286,25");
    expect(margePct()).toHaveTextContent("31,8%");
    expect(marge()).toHaveClass("text-primary");
  });

  it("rekent 100% marge als er geen materiaal in de calculatie zit", () => {
    render(<CalcMarginCard totals={totalsZonderMateriaal} offerPrice={500} />);
    expect(marge()).toHaveTextContent("500,00");
    expect(margePct()).toHaveTextContent("100,0%");
    expect(marge()).toHaveClass("text-primary");
  });

  it("kleurt rood als de prijs onder de materiaalinkoop ligt", () => {
    render(<CalcMarginCard totals={totalsMetMateriaal} offerPrice={2000} />);
    expect(marge()).toHaveTextContent("-763,75");
    expect(margePct()).toHaveTextContent("-38,2%");
    expect(marge()).toHaveClass("text-destructive");
    expect(margePct()).toHaveClass("text-destructive");
  });

  it("toont een streepje en kleurt rood bij een lege calculatie", () => {
    // pct is dan null, maar de marge is nul — en nul hoort al op te vallen.
    render(<CalcMarginCard totals={totalsZonderMateriaal} offerPrice={0} />);
    expect(marge()).toHaveTextContent("0,00");
    expect(margePct()).toHaveTextContent("—");
    expect(marge()).toHaveClass("text-destructive");
  });
});
