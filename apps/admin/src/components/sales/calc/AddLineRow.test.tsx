import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddLineRow } from "./AddLineRow";
import type { CatalogProduct } from "@/hooks/useCatalogProducts";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const product = (partial: Partial<CatalogProduct>): CatalogProduct =>
  ({
    id: "p1",
    name: "Zaptec GO 2",
    kind: "product",
    category: "laadpalen",
    unit: "stuk",
    supplier: null,
    order_number: null,
    gross_price: 834,
    supplier_discount_pct: 0.2,
    sell_adjustment_pct: 0,
    install_time_hours: 0,
    is_active: true,
    ...partial,
  }) as CatalogProduct;

function renderRow(overrides: Partial<Parameters<typeof AddLineRow>[0]> = {}) {
  const props = {
    section: "laadpalen" as const,
    sectionLabel: "Laadpalen",
    products: [product({}), product({ id: "p2", name: "Peblar Home 11kW" })],
    hint: "Artikel zoeken of eigen regel typen…",
    onPickProduct: vi.fn(),
    onCreateFree: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <AddLineRow {...props} />
    </QueryClientProvider>,
  );
  return props;
}

const openPicker = () => fireEvent.click(screen.getByTestId("add-laadpalen"));
const zoekveld = () => screen.getByPlaceholderText("Zoek een artikel of typ een nieuwe naam…");

describe("AddLineRow", () => {
  it("toont één subtiele toevoeg-regel in plaats van losse knoppen", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "Regel toevoegen aan Laadpalen" })).toBeInTheDocument();
    expect(screen.getByText("Artikel zoeken of eigen regel typen…")).toBeInTheDocument();
    expect(screen.queryByText("Vrije regel")).not.toBeInTheDocument();
  });

  it("opent een doorzoekbare lijst met de artikelen van die sectie", () => {
    renderRow();
    openPicker();
    expect(screen.getByText("Zaptec GO 2")).toBeInTheDocument();
    expect(screen.getByText("Peblar Home 11kW")).toBeInTheDocument();
  });

  it("filtert op de zoekterm", () => {
    renderRow();
    openPicker();
    fireEvent.change(zoekveld(), { target: { value: "peblar" } });
    expect(screen.queryByText("Zaptec GO 2")).not.toBeInTheDocument();
    expect(screen.getByText("Peblar Home 11kW")).toBeInTheDocument();
  });

  it("kiest een artikel uit de catalogus", () => {
    const props = renderRow();
    openPicker();
    fireEvent.click(screen.getByText("Peblar Home 11kW"));
    expect(props.onPickProduct).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
  });

  it("maakt een eigen regel van een naam die niet in de catalogus staat", () => {
    const props = renderRow();
    openPicker();
    fireEvent.change(zoekveld(), { target: { value: "Kabelgoot op maat" } });
    fireEvent.click(screen.getByText(/“Kabelgoot op maat” als eigen regel/));
    expect(props.onCreateFree).toHaveBeenCalledWith("Kabelgoot op maat");
  });

  it("biedt geen nieuwe regel aan als het artikel al bestaat", () => {
    renderRow();
    openPicker();
    fireEvent.change(zoekveld(), { target: { value: "Zaptec GO 2" } });
    expect(screen.queryByText(/als eigen regel/)).not.toBeInTheDocument();
  });

  it("biedt de keuze om de nieuwe naam in de catalogus te bewaren", () => {
    renderRow();
    openPicker();
    fireEvent.change(zoekveld(), { target: { value: "Kabelgoot op maat" } });
    fireEvent.click(screen.getByText(/opslaan in de catalogus/));
    // De dialoog opent met de getypte naam al ingevuld, onder de juiste categorie.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Nieuw artikel in de catalogus")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kabelgoot op maat")).toBeInTheDocument();
    expect(screen.getByText("Laadpalen e.d.")).toBeInTheDocument();
  });
});
