import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OnboardingMaterialsDialog, type MaterialsDialogOrder } from "./OnboardingMaterialsDialog";
import type { OrderMaterial } from "@/hooks/useOrderMaterials";

// De dialog praat via de hooks-module met supabase; die mocken we volledig zodat
// de gate-/render-logica zonder client of query-provider testbaar is.
const h = vi.hoisted(() => ({
  materials: [] as unknown[],
  updateStatus: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  prepInfo: vi.fn(),
  queueSync: vi.fn(),
}));

vi.mock("@/hooks/useOrderMaterials", () => ({
  useOrderMaterials: () => ({ data: h.materials, isLoading: false }),
  useUpdateMaterialStatus: () => ({ mutate: h.updateStatus }),
  useAddMaterial: () => ({ mutate: h.add, isPending: false }),
  useRemoveMaterial: () => ({ mutate: h.remove }),
  useUpdateOrderPrepInfo: () => ({ mutate: h.prepInfo }),
  queueMaterialSync: h.queueSync,
}));

const material = (partial: Partial<OrderMaterial>): OrderMaterial => ({
  id: "m1",
  installation_order_id: "ord1",
  source_line_id: "src1",
  product_id: null,
  description: "Zaptec GO 2",
  supplier: "Elektramat",
  order_number: "401169463",
  unit: "stuk",
  qty: 2,
  status: "te_bestellen",
  position: 0,
  catalog_products: null,
  ...partial,
});

const order = (partial: Partial<MaterialsDialogOrder> = {}): MaterialsDialogOrder => ({
  id: "ord1",
  egroup_order_id: null,
  egroup_order_number: null,
  materials_expected_at: null,
  preparation_notes: null,
  last_sync_error: null,
  ...partial,
});

const renderDialog = (o: MaterialsDialogOrder, onSend = vi.fn()) => {
  render(<OnboardingMaterialsDialog order={o} title="Acme B.V." onClose={vi.fn()} onSend={onSend} />);
  return onSend;
};

beforeEach(() => {
  h.materials = [];
  vi.clearAllMocks();
});

describe("OnboardingMaterialsDialog", () => {
  it("toont de materialen met aantal, leverancier en bestelnummer", () => {
    h.materials = [material({})];
    renderDialog(order());
    expect(screen.getByText(/Zaptec GO 2/)).toBeInTheDocument();
    expect(screen.getByText(/2×/)).toBeInTheDocument();
    expect(screen.getByText("Elektramat · 401169463")).toBeInTheDocument();
  });

  it("blokkeert Doorsturen zolang er iets te bestellen is", () => {
    h.materials = [material({ id: "m1", status: "besteld" }), material({ id: "m2", status: "te_bestellen" })];
    renderDialog(order());
    expect(screen.getByText(/Nog 1 materiaal te bestellen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Doorsturen naar installateur/ })).toBeDisabled();
  });

  it("geeft Doorsturen vrij zodra alles besteld/binnen/niet_nodig is en meldt dat aan de parent", () => {
    h.materials = [
      material({ id: "m1", status: "besteld" }),
      material({ id: "m2", status: "binnen" }),
      material({ id: "m3", status: "niet_nodig" }),
    ];
    const onSend = renderDialog(order());
    const knop = screen.getByRole("button", { name: /Doorsturen naar installateur/ });
    expect(knop).toBeEnabled();
    fireEvent.click(knop);
    expect(onSend).toHaveBeenCalled();
  });

  it("laat een lege lijst direct door (geen calculatie = niets te bestellen)", () => {
    renderDialog(order());
    expect(screen.getByText("Geen materialen uit de calculatie — voeg zo nodig zelf regels toe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Doorsturen naar installateur/ })).toBeEnabled();
  });

  it("toont ná de handoff het opdrachtnummer i.p.v. de Doorsturen-knop, maar blijft bewerkbaar", () => {
    h.materials = [material({ status: "besteld" })];
    renderDialog(order({ egroup_order_id: "EG1", egroup_order_number: "OPD-00099" }));
    expect(screen.queryByRole("button", { name: /Doorsturen naar installateur/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Verstuurd · OPD-00099/)).toBeInTheDocument();
    // Status blijft aanpasbaar (binnen melden) en regels toevoegen kan nog.
    expect(screen.getByLabelText("Status Zaptec GO 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regel toevoegen/ })).toBeInTheDocument();
  });

  it("maakt alleen handmatige regels verwijderbaar; calc-regels zet je op niet_nodig", () => {
    h.materials = [
      material({ id: "m1", description: "Uit calculatie", source_line_id: "src1" }),
      material({ id: "m2", description: "Handmatig", source_line_id: null }),
    ];
    renderDialog(order());
    expect(screen.queryByRole("button", { name: "Regel Uit calculatie verwijderen" })).not.toBeInTheDocument();
    const del = screen.getByRole("button", { name: "Regel Handmatig verwijderen" });
    fireEvent.click(del);
    expect(h.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m2", orderId: "ord1", handedOff: false }),
      expect.anything(),
    );
  });

  it("voegt een handmatige regel toe via het invoerrijtje", () => {
    renderDialog(order());
    fireEvent.click(screen.getByRole("button", { name: /Regel toevoegen/ }));
    fireEvent.change(screen.getByLabelText("Omschrijving"), { target: { value: "Kabelgoot" } });
    fireEvent.change(screen.getByLabelText("Aantal"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));
    expect(h.add).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord1", description: "Kabelgoot", qty: 3 }),
      expect.anything(),
    );
  });

  it("biedt een retry aan als de sync naar e-portal is mislukt", () => {
    h.materials = [material({ status: "binnen" })];
    renderDialog(order({ egroup_order_id: "EG1", last_sync_error: "Materiaalsync: E-Group 500" }));
    fireEvent.click(screen.getByRole("button", { name: /opnieuw syncen/i }));
    expect(h.queueSync).toHaveBeenCalledWith("ord1");
  });
});
