import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CalcTotalsCard } from "./CalcTotalsCard";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "@/services/calcTypes";

const header: CalcHeaderDraft = {
  hourly_rate: 60,
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
    offerPrice: totals.suggestedOfferPrice,
    frozen: false,
    onOfferPriceCommit: vi.fn(),
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

  it("rondt met één klik naar boven af op 25, 50 of 100", () => {
    const props = renderCard();
    expect(totals.totalSell).toBe(4017.18);

    fireEvent.click(pill(25));
    expect(props.onOfferPriceCommit).toHaveBeenLastCalledWith(4025);

    fireEvent.click(pill(50));
    expect(props.onOfferPriceCommit).toHaveBeenLastCalledWith(4050);

    fireEvent.click(pill(100));
    expect(props.onOfferPriceCommit).toHaveBeenLastCalledWith(4100);
  });

  it("rondt altijd vanaf de calculatie, niet vanaf de huidige prijs", () => {
    // Anders zou 100 → 50 blijven hangen op 4.100 in plaats van 4.050 te geven.
    const props = renderCard({ offerPrice: 4100 });
    fireEvent.click(pill(50));
    expect(props.onOfferPriceCommit).toHaveBeenCalledWith(4050);
  });

  it("markeert de stap die bij de huidige prijs hoort", () => {
    renderCard({ offerPrice: 4025 });
    expect(pill(25)).toHaveAttribute("aria-pressed", "true");
    expect(pill(50)).toHaveAttribute("aria-pressed", "false");
  });

  it("laat het bedrag ook handmatig invoeren", () => {
    const props = renderCard();
    const veld = screen.getByDisplayValue("4018");
    fireEvent.change(veld, { target: { value: "3950" } });
    fireEvent.blur(veld);
    expect(props.onOfferPriceCommit).toHaveBeenCalledWith(3950);
  });

  it("verbergt de afrondknoppen bij een bevroren calculatie", () => {
    renderCard({ frozen: true });
    expect(screen.queryByRole("button", { name: /€ 25/ })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("4018")).toBeDisabled();
  });
});
