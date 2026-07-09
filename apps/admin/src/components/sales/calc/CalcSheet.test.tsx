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
  uid: "u0",
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

// Bewust door elkaar toegevoegd, zoals een gebruiker doet. De meterkast draagt
// 8 uur calculatietijd; "Zaptec onepole" is de TWEEDE laadpaal maar de DERDE
// regel in de array — die combinatie ontmaskert index-gebaseerd verwijderen.
const lines: CalcLineDraft[] = [
  line({ uid: "u1", description: "Zaptec GO 2", category: "laadpalen", qty: 2, unit_sell: 834, unit_cost: 667.2 }),
  line({ uid: "u2", description: "Meterkast", category: "installatiemateriaal", qty: 1, unit_sell: 2280, unit_cost: 1900, unit_hours: 8 }),
  line({ uid: "u3", description: "Zaptec onepole", category: "laadpalen", qty: 1, unit_sell: 330.55, unit_cost: 264.44 }),
  line({ uid: "u4", description: "Montage", line_type: "uren", category: "arbeid", unit: "uur", qty: 4, unit_hours: 1 }),
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

const row = (uid: string) => screen.getByTestId(`row-${uid}`);
const section = (naam: string) => screen.getByTestId(`section-${naam}`);
const subtotaal = (naam: string) => screen.getByTestId(`subtotal-${naam}`);

describe("CalcSheet", () => {
  it("toont elke sectie met haar eigen subtotaal", () => {
    renderSheet();
    expect(subtotaal("laadpalen")).toHaveTextContent("€ 1.998,55"); // 2×834 + 330,55
    expect(subtotaal("installatiemateriaal")).toHaveTextContent("€ 2.280,00");
    expect(subtotaal("arbeid")).toHaveTextContent("€ 810,00"); // 720 montage + 90 voorrij
  });

  it("groepeert regels onder hun eigen sectie, ongeacht de toevoegvolgorde", () => {
    renderSheet();
    const laadpalen = section("laadpalen");
    expect(within(laadpalen).getByDisplayValue("Zaptec GO 2")).toBeInTheDocument();
    expect(within(laadpalen).getByDisplayValue("Zaptec onepole")).toBeInTheDocument();
    expect(within(laadpalen).queryByDisplayValue("Meterkast")).not.toBeInTheDocument();

    expect(within(section("installatiemateriaal")).getByDisplayValue("Meterkast")).toBeInTheDocument();
    expect(within(section("arbeid")).getByDisplayValue("Montage")).toBeInTheDocument();
  });

  it("verwijdert de aangeklikte regel op uid", () => {
    const props = renderSheet();
    fireEvent.click(within(row("u3")).getByRole("button", { name: "Regel verwijderen" }));
    expect(props.onRemoveLine).toHaveBeenCalledWith("u3");
  });

  it("patcht de aangeklikte regel op uid", () => {
    const props = renderSheet();
    fireEvent.change(within(row("u4")).getByDisplayValue("Montage"), { target: { value: "Montage + inregelen" } });
    expect(props.onPatchLine).toHaveBeenCalledWith("u4", { description: "Montage + inregelen" });
  });

  it("laat de verkoopprijs bewerken zonder uitklappen", () => {
    const props = renderSheet();
    const prijs = within(row("u1")).getByDisplayValue("834,00"); // bedragen tonen NL-komma + 2 decimalen
    fireEvent.change(prijs, { target: { value: "900" } });
    fireEvent.blur(prijs);
    expect(props.onPatchLine).toHaveBeenCalledWith("u1", { unit_sell: 900 });
  });

  it("klapt op de chevron alléén die regel open, met inkoop en montagetijd", () => {
    renderSheet();
    expect(within(row("u2")).queryByText("Inkoop per stuk")).not.toBeInTheDocument();
    fireEvent.click(within(row("u2")).getByRole("button", { name: "Details tonen" }));
    expect(within(row("u2")).getByText("Inkoop per stuk")).toBeInTheDocument();
    expect(within(row("u2")).getByText("Montagetijd per stuk")).toBeInTheDocument();
    // De andere regels blijven dicht.
    expect(within(row("u1")).queryByText("Inkoop per stuk")).not.toBeInTheDocument();
  });

  it("toont de montagetijd al vóór het uitklappen, maar alleen als er tijd op staat", () => {
    renderSheet();
    // Zonder deze hint zou de 8 uur van de meterkast ongezien in het
    // montagebedrag verdwijnen.
    expect(within(row("u2")).getByText(/8 u montagetijd per stuk/)).toBeInTheDocument();
    expect(within(row("u1")).queryByText(/montagetijd/)).not.toBeInTheDocument();
  });

  it("zet op een urenregel de uren rechts, geen bedrag", () => {
    renderSheet();
    expect(within(row("u4")).getByText("4 u")).toBeInTheDocument();
    expect(within(row("u4")).getByText("per uur")).toBeInTheDocument();
    expect(within(row("u4")).queryByText(/€/)).not.toBeInTheDocument();
  });

  it("maakt de herkomst van de montage-uren zichtbaar", () => {
    renderSheet();
    const arbeid = section("arbeid");
    expect(within(arbeid).getByText("Calculatietijd uit materiaalregels")).toBeInTheDocument();
    expect(within(arbeid).getByText("8 u")).toBeInTheDocument();
    // 4 (urenregel) + 8 (materiaal) = 12 u × € 60,00 = € 720,00
    expect(within(arbeid).getByText(/€\/uur × 12 u/)).toBeInTheDocument();
    expect(within(arbeid).getByText("€ 720,00")).toBeInTheDocument();
  });

  it("verbergt de calculatietijd-regel als er geen uren op materiaal staan", () => {
    const zonder = [lines[0], lines[3]];
    renderSheet({ lines: zonder, totals: computeTotals(zonder, header) });
    expect(screen.queryByText("Calculatietijd uit materiaalregels")).not.toBeInTheDocument();
  });

  it("laat een vrije regel de categorie van haar sectie erven", () => {
    const props = renderSheet();
    fireEvent.click(within(section("installatiemateriaal")).getByRole("button", { name: /Vrije regel/ }));
    expect(props.onAddFree).toHaveBeenCalledWith("vrij", "installatiemateriaal");
  });

  it("biedt onder Arbeid alleen een urenregel aan — nooit een vrije regel", () => {
    const props = renderSheet();
    const arbeid = section("arbeid");
    expect(within(arbeid).queryByRole("button", { name: /Vrije regel/ })).not.toBeInTheDocument();
    fireEvent.click(within(arbeid).getByRole("button", { name: /Urenregel/ }));
    expect(props.onAddFree).toHaveBeenCalledWith("uren", "arbeid");
  });

  it("toont een lege sectie met kop en toevoegknoppen", () => {
    renderSheet({ lines: [], totals: computeTotals([], header) });
    expect(screen.getByText("Laadpalen")).toBeInTheDocument();
    expect(screen.getAllByText("Nog geen regels")).toHaveLength(2);
    expect(screen.getByText("Nog geen arbeidsregels")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Artikel/ })).toHaveLength(2);
  });

  it("is bevroren leesbaar: geen knoppen, wel chevrons, alle velden disabled", () => {
    renderSheet({ frozen: true });
    expect(screen.queryByRole("button", { name: "Regel verwijderen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Artikel|Vrije regel|Urenregel|Arbeidsregel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /opnieuw berekenen/ })).not.toBeInTheDocument();
    // Uitklappen om inkoop te lezen blijft wél mogelijk.
    expect(within(row("u2")).getByRole("button", { name: "Details tonen" })).toBeInTheDocument();
    for (const veld of screen.getAllByRole("textbox")) expect(veld).toBeDisabled();
    expect(subtotaal("laadpalen")).toHaveTextContent("€ 1.998,55");
  });

  it("meldt handmatig ingevoerde kilometers terug via onHeaderChange", () => {
    const props = renderSheet();
    const kmVeld = screen.getByDisplayValue("120");
    fireEvent.change(kmVeld, { target: { value: "80" } });
    fireEvent.blur(kmVeld); // NumField commit op blur
    expect(props.onHeaderChange).toHaveBeenCalledWith({ retour_km: 80 });
  });
});
