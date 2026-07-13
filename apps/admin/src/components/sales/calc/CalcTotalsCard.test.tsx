import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CalcTotalsCard } from "./CalcTotalsCard";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "@/services/calcTypes";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
  labor_cost_rate: 50,
  km_price: 0.75,
  retour_km: 110,
  travel_days: 1,
  stelpost_graafwerk: 0,
  stelpost_note: "",
};

// materiaal 3.454,68 + montage 480 + voorrij 82,50 = 4.017,18 → voorstel 4.018
const lines: CalcLineDraft[] = [
  { uid: "u1", line_type: "product", product_id: null, description: "Zaptec PRO", category: "laadpalen", supplier: null, order_number: null, unit: "stuk", qty: 3, unit_gross: 0, unit_cost: 921.25, unit_sell: 1151.56, unit_hours: 0, position: 0 },
  { uid: "u2", line_type: "uren", product_id: null, description: "Arbeid", category: "arbeid", supplier: null, order_number: null, unit: "uur", qty: 8, unit_gross: 0, unit_cost: 0, unit_sell: 0, unit_hours: 1, position: 1 },
];
const totals = computeTotals(lines, header);

function renderCard(overrides: Partial<React.ComponentProps<typeof CalcTotalsCard>> = {}) {
  const props = {
    totals,
    commercialPrice: totals.suggestedCommercialPrice,
    roundStep: null,
    frozen: false,
    onCommercialPriceCommit: vi.fn(),
    onPickRoundStep: vi.fn(),
    ...overrides,
  };
  render(<CalcTotalsCard {...props} />);
  return props;
}

const pill = (stap: number) => screen.getByRole("button", { name: `€ ${stap}` });

describe("CalcTotalsCard", () => {
  it("noemt de arbeidspost 'Arbeid', net als op het blad", () => {
    renderCard();
    expect(screen.getByText("Arbeid")).toBeInTheDocument();
    expect(screen.queryByText("Montage")).not.toBeInTheDocument();
  });

  it("laat inkoop en marge over aan de Marge-kaart", () => {
    renderCard();
    // Exact matchen: "Materiaal (verkoop)" blijft wél staan.
    expect(screen.getByText("Materiaal (verkoop)")).toBeInTheDocument();
    expect(screen.queryByText("Materiaal (inkoop netto)")).not.toBeInTheDocument();
    expect(screen.queryByText("Marge materiaal")).not.toBeInTheDocument();
  });

  it("kiest met één klik een afrondstap", () => {
    const props = renderCard();
    expect(totals.totalSell).toBe(4017.18);
    fireEvent.click(pill(50));
    expect(props.onPickRoundStep).toHaveBeenCalledWith(50);
    // Niet het bedrag bevriezen: de stap is de keuze.
    expect(props.onCommercialPriceCommit).not.toHaveBeenCalled();
  });

  it("toont per stap welk bedrag eruit komt", () => {
    renderCard();
    // formatEuro zet een harde spatie na het euroteken; toets op de cijfers.
    expect(pill(25).getAttribute("title")).toContain("4.025,00");
    expect(pill(50).getAttribute("title")).toContain("4.050,00");
    expect(pill(100).getAttribute("title")).toContain("4.100,00");
  });

  it("markeert de gekozen stap, niet een toevallig gelijk bedrag", () => {
    renderCard({ roundStep: 50, commercialPrice: 4050 });
    expect(pill(50)).toHaveAttribute("aria-pressed", "true");
    expect(pill(25)).toHaveAttribute("aria-pressed", "false");
  });

  it("laat het bedrag ook handmatig invoeren", () => {
    const props = renderCard();
    const veld = screen.getByDisplayValue("4018");
    fireEvent.change(veld, { target: { value: "3950" } });
    fireEvent.blur(veld);
    expect(props.onCommercialPriceCommit).toHaveBeenCalledWith(3950);
  });

  it("waarschuwt als de prijs onder de calculatie ligt", () => {
    renderCard({ commercialPrice: 3950 });
    expect(screen.getByText(/ligt onder de calculatie van € 4.017,18/)).toBeInTheDocument();
  });

  it("waarschuwt niet bij een prijs op of boven de calculatie", () => {
    renderCard({ commercialPrice: 4018 });
    expect(screen.queryByText(/onder de calculatie/)).not.toBeInTheDocument();
  });

  it("verbergt de afrondknoppen bij een bevroren calculatie", () => {
    renderCard({ frozen: true });
    expect(screen.queryByRole("button", { name: /€ 25/ })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("4018")).toBeDisabled();
  });
});
