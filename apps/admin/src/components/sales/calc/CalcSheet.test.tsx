import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CalcSheet } from "./CalcSheet";
import { computeTotals, type CalcHeaderDraft, type CalcLineDraft } from "@/services/calcTypes";

// De artikelkiezer trekt de supabase-client mee via useCatalogProducts; het blad
// zelf praat niet met de database.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const header: CalcHeaderDraft = {
  hourly_rate: 60,
  km_price: 0.75,
  retour_km: 120,
  travel_days: 1,
  stelpost_graafwerk: 1500,
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

// Bewust door elkaar toegevoegd, zoals een gebruiker doet: laadpaal, meterkast,
// laadpaal, urenregel. Het blad hoort ze gegroepeerd te tonen.
const lines: CalcLineDraft[] = [
  line({ description: "Zaptec GO 2", category: "laadpalen", qty: 2, unit_sell: 834, unit_cost: 667.2 }), // globale index 0
  line({ description: "Meterkast", category: "installatiemateriaal", qty: 1, unit_sell: 2280, unit_cost: 1900, unit_hours: 8 }), // 1
  line({ description: "Zaptec onepole", category: "laadpalen", qty: 1, unit_sell: 330.55, unit_cost: 264.44 }), // 2
  line({ description: "Montage", line_type: "uren", category: "arbeid", unit: "uur", qty: 4, unit_hours: 1 }), // 3
];

function renderSheet(overrides: Partial<ComponentProps<typeof CalcSheet>> = {}) {
  const props: ComponentProps<typeof CalcSheet> = {
    lines,
    header,
    totals: computeTotals(lines, header),
    frozen: false,
    catalog: [],
    kmBusy: false,
    kmHint: null,
    onAddProduct: vi.fn(),
    onAddFree: vi.fn(),
    onPatchLine: vi.fn(),
    onRemoveLine: vi.fn(),
    onHeaderChange: vi.fn(),
    onRecomputeKm: vi.fn(),
    ...overrides,
  };
  render(<CalcSheet {...props} />);
  return props;
}

/** De <tbody> van één sectie — alles wat onder die categoriekop hangt. */
const sectionBody = (kop: string) => screen.getByText(kop).closest("tbody") as HTMLElement;
/** De kop-<tr> zelf — daar staat het subtotaal van de sectie. */
const sectionHead = (kop: string) => screen.getByText(kop).closest("tr") as HTMLElement;

describe("CalcSheet", () => {
  it("toont elke sectie met haar eigen subtotaal", () => {
    renderSheet();
    expect(within(sectionHead("Laadpalen")).getByText("€ 1.998,55")).toBeInTheDocument(); // 2×834 + 330,55
    expect(within(sectionHead("Installatiemateriaal")).getByText("€ 2.280,00")).toBeInTheDocument();
    expect(within(sectionHead("Arbeid & voorrijkosten")).getByText("€ 810,00")).toBeInTheDocument(); // 720 montage + 90 voorrij
    expect(within(sectionHead("Stelpost graafwerk")).getByText("€ 1.500,00")).toBeInTheDocument();
  });

  it("groepeert regels onder hun eigen sectie, ongeacht de toevoegvolgorde", () => {
    renderSheet();
    const laadpalen = sectionBody("Laadpalen");
    expect(within(laadpalen).getByDisplayValue("Zaptec GO 2")).toBeInTheDocument();
    expect(within(laadpalen).getByDisplayValue("Zaptec onepole")).toBeInTheDocument();
    expect(within(laadpalen).queryByDisplayValue("Meterkast")).not.toBeInTheDocument();

    expect(within(sectionBody("Installatiemateriaal")).getByDisplayValue("Meterkast")).toBeInTheDocument();
    expect(within(sectionBody("Arbeid & voorrijkosten")).getByDisplayValue("Montage")).toBeInTheDocument();
  });

  it("verwijdert op de GLOBALE index, niet die van de gefilterde sectie", () => {
    const props = renderSheet();
    const rij = screen.getByDisplayValue("Zaptec onepole").closest("tr") as HTMLElement;
    fireEvent.click(within(rij).getByRole("button"));
    // "Zaptec onepole" is de tweede laadpaal (filter-index 1) maar staat op
    // globale index 2. Bij index 1 zou de meterkast sneuvelen.
    expect(props.onRemoveLine).toHaveBeenCalledWith(2);
  });

  it("patcht op de globale index", () => {
    const props = renderSheet();
    fireEvent.change(screen.getByDisplayValue("Montage"), { target: { value: "Montage + inregelen" } });
    expect(props.onPatchLine).toHaveBeenCalledWith(3, { description: "Montage + inregelen" });
  });

  it("maakt de herkomst van de montage-uren zichtbaar", () => {
    renderSheet();
    const arbeid = sectionBody("Arbeid & voorrijkosten");
    // De 8 uur calculatietijd zit op de meterkast, niet op een arbeidsregel.
    expect(within(arbeid).getByText("Calculatietijd uit materiaalregels")).toBeInTheDocument();
    expect(within(arbeid).getByText("8 u")).toBeInTheDocument();
    // 4 (urenregel) + 8 (materiaal) = 12 u × € 60,00 = € 720,00
    expect(within(arbeid).getByText(/Montage — 12 u × € 60,00/)).toBeInTheDocument();
    expect(within(arbeid).getByText("€ 720,00")).toBeInTheDocument();
  });

  it("verbergt de calculatietijd-regel als er geen uren op materiaal staan", () => {
    const zonder = [lines[0], lines[3]];
    renderSheet({ lines: zonder, totals: computeTotals(zonder, header) });
    expect(screen.queryByText("Calculatietijd uit materiaalregels")).not.toBeInTheDocument();
  });

  it("laat een vrije regel de categorie van haar sectie erven", () => {
    const props = renderSheet();
    fireEvent.click(within(sectionBody("Installatiemateriaal")).getByRole("button", { name: /Vrije regel/ }));
    expect(props.onAddFree).toHaveBeenCalledWith("vrij", "installatiemateriaal");
  });

  it("biedt onder Arbeid alleen een urenregel aan — nooit een vrije regel", () => {
    const props = renderSheet();
    const arbeid = sectionBody("Arbeid & voorrijkosten");
    expect(within(arbeid).queryByRole("button", { name: /Vrije regel/ })).not.toBeInTheDocument();
    fireEvent.click(within(arbeid).getByRole("button", { name: /Urenregel/ }));
    expect(props.onAddFree).toHaveBeenCalledWith("uren", "arbeid");
  });

  it("toont een lege sectie met kop en toevoegknoppen", () => {
    renderSheet({ lines: [], totals: computeTotals([], header) });
    expect(screen.getByText("Laadpalen")).toBeInTheDocument();
    expect(screen.getAllByText("Nog geen regels")).toHaveLength(2);
    expect(screen.getByText("Nog geen arbeidsregels")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Artikel uit catalogus/ })).toHaveLength(2);
  });

  it("is bevroren leesbaar, zonder invoer of toevoegknoppen", () => {
    renderSheet({ frozen: true });
    expect(screen.queryByRole("button", { name: /uit catalogus/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vrije regel|Urenregel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /opnieuw berekenen/ })).not.toBeInTheDocument();
    for (const veld of screen.getAllByRole("textbox")) expect(veld).toBeDisabled();
    expect(screen.getByText("Laadpalen")).toBeInTheDocument();
    expect(within(sectionHead("Laadpalen")).getByText("€ 1.998,55")).toBeInTheDocument();
  });

  it("meldt handmatig ingevoerde kilometers terug via onHeaderChange", () => {
    const props = renderSheet();
    const kmVeld = screen.getByDisplayValue("120");
    fireEvent.change(kmVeld, { target: { value: "80" } });
    fireEvent.blur(kmVeld); // NumField commit op blur
    expect(props.onHeaderChange).toHaveBeenCalledWith({ retour_km: 80 });
  });
});
