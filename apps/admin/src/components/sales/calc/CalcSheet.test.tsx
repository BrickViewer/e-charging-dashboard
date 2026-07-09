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
    // De urenregel draagt alleen het aantal en verschijnt niet als eigen regel.
    expect(screen.queryByDisplayValue("Montage")).not.toBeInTheDocument();
  });

  it("verwijdert de aangeklikte regel op uid", () => {
    const props = renderSheet();
    fireEvent.click(within(row("u3")).getByRole("button", { name: "Regel verwijderen" }));
    expect(props.onRemoveLine).toHaveBeenCalledWith("u3");
  });

  it("patcht de aangeklikte regel op uid", () => {
    const props = renderSheet();
    fireEvent.change(within(row("u2")).getByDisplayValue("Meterkast"), { target: { value: "Meterkast XL" } });
    expect(props.onPatchLine).toHaveBeenCalledWith("u2", { description: "Meterkast XL" });
  });

  it("laat de verkoopprijs bewerken zonder uitklappen", () => {
    const props = renderSheet();
    const prijs = within(row("u1")).getByDisplayValue("834,00"); // bedragen tonen NL-komma + 2 decimalen
    fireEvent.change(prijs, { target: { value: "900" } });
    fireEvent.blur(prijs);
    expect(props.onPatchLine).toHaveBeenCalledWith("u1", { unit_sell: 900 });
  });

  it("stapt het aantal van een artikelregel", () => {
    const props = renderSheet();
    fireEvent.click(within(row("u1")).getByRole("button", { name: "Aantal verhogen" }));
    expect(props.onPatchLine).toHaveBeenCalledWith("u1", { qty: 3 });
  });

  it("stapt de kilometers van de voorrijkosten", () => {
    const props = renderSheet();
    fireEvent.click(within(row("voorrijkosten")).getByRole("button", { name: "Kilometers verhogen" }));
    expect(props.onHeaderChange).toHaveBeenCalledWith({ retour_km: 121 });
  });

  it("klapt op de chevron alléén die regel open, met inkoop en montagetijd", () => {
    renderSheet();
    expect(screen.queryByText("Inkoop per stuk")).not.toBeInTheDocument();
    fireEvent.click(within(row("u2")).getByRole("button", { name: "Details tonen" }));
    // Eén regel open ⇒ precies één inkoop- en één montagetijd-regel op het blad.
    expect(screen.getByText("Inkoop per stuk")).toBeInTheDocument();
    expect(screen.getByText("Montagetijd per stuk")).toBeInTheDocument();
    expect(document.getElementById("calc-detail-u2")).toBeInTheDocument();
    expect(document.getElementById("calc-detail-u1")).not.toBeInTheDocument();
  });

  it("toont de montagetijd al vóór het uitklappen, maar alleen als er tijd op staat", () => {
    renderSheet();
    // Zonder deze hint zou de 8 uur van de meterkast ongezien in het
    // montagebedrag verdwijnen.
    expect(within(row("u2")).getByText(/8 u montagetijd per stuk/)).toBeInTheDocument();
    expect(within(row("u1")).queryByText(/montagetijd/)).not.toBeInTheDocument();
  });

  it("leest Arbeid als een gewone regel: uren × uurloon = bedrag", () => {
    renderSheet();
    const arbeid = row("arbeid");
    expect(within(arbeid).getByDisplayValue("12")).toBeInTheDocument(); // 4 urenregel + 8 meterkast
    expect(within(arbeid).getByText("Arbeid")).toBeInTheDocument();
    expect(within(arbeid).getByDisplayValue("60,00")).toBeInTheDocument();
    expect(within(arbeid).getByText("per uur")).toBeInTheDocument();
    expect(within(arbeid).getByText("€ 720,00")).toBeInTheDocument();
  });

  describe("uren stappen op de Arbeid-regel", () => {
    // Getoond wordt het TOTAAL (12 = 4 urenregel + 8 calculatietijd), maar de
    // knoppen verstellen alleen de onzichtbare urenregel — de calculatietijd
    // hoort bij een materiaalregel en mag niet weggestapt worden.
    it("verhoogt de urenregel, niet de calculatietijd", () => {
      const props = renderSheet();
      fireEvent.click(within(row("arbeid")).getByRole("button", { name: "Uren verhogen" }));
      expect(props.onPatchLine).toHaveBeenCalledWith("u4", { qty: 5, unit_hours: 1 });
    });

    it("verlaagt de urenregel", () => {
      const props = renderSheet();
      fireEvent.click(within(row("arbeid")).getByRole("button", { name: "Uren verlagen" }));
      expect(props.onPatchLine).toHaveBeenCalledWith("u4", { qty: 3, unit_hours: 1 });
    });

    it("laat je het totaal ook intypen", () => {
      const props = renderSheet();
      const veld = within(row("arbeid")).getByDisplayValue("12");
      fireEvent.change(veld, { target: { value: "20" } });
      fireEvent.blur(veld);
      expect(props.onPatchLine).toHaveBeenCalledWith("u4", { qty: 12, unit_hours: 1 }); // 20 − 8 calculatietijd
    });

    it("maakt de urenregel aan als die er nog niet is, zonder hem te tonen", () => {
      const zonder = [lines[0], lines[1]]; // laadpaal + meterkast (8 u calculatietijd)
      const props = renderSheet({ lines: zonder, totals: computeTotals(zonder, header) });
      const arbeid = row("arbeid");
      expect(within(arbeid).getByRole("button", { name: "Uren verlagen" })).toBeDisabled();
      fireEvent.click(within(arbeid).getByRole("button", { name: "Uren verhogen" }));
      expect(props.onAddFree).toHaveBeenCalledWith("uren", "arbeid", { description: "Arbeid", qty: 1 });
    });

    it("verwijdert de urenregel als je hem op nul zet", () => {
      const enkel = [lines[3]]; // alleen de urenregel van 4 u
      const props = renderSheet({ lines: enkel, totals: computeTotals(enkel, header) });
      const veld = within(row("arbeid")).getByDisplayValue("4");
      fireEvent.change(veld, { target: { value: "0" } });
      fireEvent.blur(veld);
      expect(props.onRemoveLine).toHaveBeenCalledWith("u4");
    });
  });

  it("leest Voorrijkosten als een gewone regel: km × €/km × dagen = bedrag", () => {
    renderSheet();
    const voorrij = row("voorrijkosten");
    expect(within(voorrij).getByDisplayValue("120")).toBeInTheDocument();
    expect(within(voorrij).getByText("Voorrijkosten")).toBeInTheDocument();
    expect(within(voorrij).getByDisplayValue("0,75")).toBeInTheDocument();
    expect(within(voorrij).getByDisplayValue("1")).toBeInTheDocument(); // dagen
    expect(within(voorrij).getByText("€ 90,00")).toBeInTheDocument();
  });

  it("houdt de arbeidsectie bij twee regels: Arbeid en Voorrijkosten", () => {
    renderSheet();
    const arbeid = section("arbeid");
    // Geen urenregel, geen toevoeg-regel: de + op Arbeid hoogt alleen het getal op.
    expect(screen.queryByTestId("row-u4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-arbeid")).not.toBeInTheDocument();
    expect(within(arbeid).getAllByTestId(/^row-/)).toHaveLength(2);
  });

  it("laat Arbeid en Voorrijkosten niet openklappen", () => {
    renderSheet();
    expect(within(row("arbeid")).queryByRole("button", { name: "Details tonen" })).not.toBeInTheDocument();
    expect(within(row("voorrijkosten")).queryByRole("button", { name: "Details tonen" })).not.toBeInTheDocument();
    // Materiaalregels houden hun chevron wél.
    expect(within(row("u2")).getByRole("button", { name: "Details tonen" })).toBeInTheDocument();
  });

  it("laat onder Arbeid zien hoe de uren zijn opgebouwd", () => {
    renderSheet();
    // 12 u = 4 u urenregel + 8 u calculatietijd op de meterkast. Zonder deze
    // hint is nergens te zien waar die 8 uur vandaan komt.
    const arbeid = row("arbeid");
    expect(within(arbeid).getByDisplayValue("12")).toBeInTheDocument();
    expect(within(arbeid).getByText(/waarvan 8 u uit materiaalregels/)).toBeInTheDocument();
    expect(within(arbeid).getByText("€ 720,00")).toBeInTheDocument();
  });

  it("verbergt de calculatietijd-hint als er geen uren op materiaal staan", () => {
    const zonder = [lines[0], lines[3]];
    renderSheet({ lines: zonder, totals: computeTotals(zonder, header) });
    expect(screen.queryByText(/uit materiaalregels/)).not.toBeInTheDocument();
  });

  it("herberekent de kilometers vanaf de Voorrijkosten-regel zelf", () => {
    const props = renderSheet();
    fireEvent.click(within(row("voorrijkosten")).getByRole("button", { name: "Afstand opnieuw berekenen" }));
    expect(props.onRecomputeKm).toHaveBeenCalled();
  });

  it("toont een lege sectie als kop met alleen de toevoeg-regel", () => {
    renderSheet({ lines: [], totals: computeTotals([], header) });
    expect(screen.getByText("Laadpalen")).toBeInTheDocument();
    expect(screen.queryByText(/Nog geen/)).not.toBeInTheDocument();
    expect(screen.getByTestId("add-laadpalen")).toBeInTheDocument();
    expect(screen.getByTestId("add-installatiemateriaal")).toBeInTheDocument();
    // Arbeid en Voorrijkosten staan er altijd, ook zonder regels.
    expect(row("arbeid")).toBeInTheDocument();
    expect(row("voorrijkosten")).toBeInTheDocument();
  });

  it("houdt de toevoeg-regel onder de bestaande regels, zodat je door kunt", () => {
    renderSheet();
    const laadpalen = section("laadpalen");
    const kinderen = [...laadpalen.children];
    expect(kinderen.at(-1)).toBe(screen.getByTestId("add-laadpalen"));
    expect(within(laadpalen).getByDisplayValue("Zaptec onepole")).toBeInTheDocument();
  });

  it("is bevroren leesbaar: geen knoppen, wel chevrons, alle velden disabled", () => {
    renderSheet({ frozen: true });
    expect(screen.queryByRole("button", { name: "Regel verwijderen" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-laadpalen")).not.toBeInTheDocument();
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
