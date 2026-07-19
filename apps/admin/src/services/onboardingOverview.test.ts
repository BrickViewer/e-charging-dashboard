import { describe, expect, it } from "vitest";
import { attentionFor, summarizeOnboarding, onboardingName } from "./onboardingOverview";
import type { OnboardingClient, OnbOrder } from "@/hooks/useOnboarding";

// Minimale factory: alleen de velden die deriveStage/attentionFor lezen; de rest
// is voor deze test niet relevant (order-only paden raken isDetailsComplete niet).
function mkOrder(over: Partial<OnbOrder> = {}): OnbOrder {
  return {
    id: "o", quote_id: null, status: null, egroup_order_id: null, egroup_order_number: null,
    external_status: null, completed_at: null, invoiced_at: null, scheduled_date: null,
    work_prep_started_at: null, materials_expected_at: null, preparation_notes: null,
    materials_synced_at: null, last_sync_error: null, site_street: null, site_house_number: null,
    site_postal: null, site_city: null, site_contact_name: null, site_contact_email: null,
    site_contact_phone: null, service_summary: null, notes: null, installation_order_materials: [],
    ...over,
  };
}
function mkItem(order: OnbOrder, over: Partial<OnboardingClient> = {}): OnboardingClient {
  return {
    id: "c", company_name: "Testklant", client_number: null, status: null, portal_user_id: null,
    contact_email: null, contact_name: null, contact_phone: null, created_at: "2026-07-01T00:00:00Z",
    payment_onboarding_status: null, needs_installation: true, managed: false,
    vat_status: null, kvk: null, btw_number: null,
    billing_address_street: null, billing_address_postal: null, billing_address_city: null,
    installation_orders: [order], locations: [], client_invitations: [], is_order_only: true,
    ...over,
  };
}

const opgeleverd = mkItem(mkOrder({ egroup_order_id: "e", completed_at: "2026-07-15T00:00:00Z" }));
const nietIngepland = mkItem(mkOrder({ egroup_order_id: "e" }));
const ingepland = mkItem(mkOrder({ egroup_order_id: "e", scheduled_date: "2026-07-20" }));
const syncFout = mkItem(mkOrder({ egroup_order_id: "e", last_sync_error: "boom" }));
const materialen = mkItem(mkOrder({ work_prep_started_at: "2026-07-10T00:00:00Z", installation_order_materials: [{ status: "te_bestellen" }, { status: "besteld" }] }));

describe("attentionFor", () => {
  it("opgeleverd → te factureren (actie)", () => {
    const a = attentionFor(opgeleverd);
    expect(a.stage).toBe("opgeleverd");
    expect(a.actionable).toBe(true);
    expect(a.label).toBe("Te factureren");
  });
  it("bij installateur zonder datum → nog in te plannen (actie)", () => {
    const a = attentionFor(nietIngepland);
    expect(a.stage).toBe("bij_installateur");
    expect(a.actionable).toBe(true);
    expect(a.label).toBe("Nog in te plannen");
  });
  it("bij installateur mét datum → passief (op koers)", () => {
    const a = attentionFor(ingepland);
    expect(a.actionable).toBe(false);
    expect(a.label).toMatch(/^Ingepland ·/);
  });
  it("sync-fout wint van alles, hoogste prioriteit", () => {
    const a = attentionFor(syncFout);
    expect(a.priority).toBe(0);
    expect(a.label).toMatch(/Sync-fout/);
  });
  it("werkvoorbereiding met open materiaal telt de openstaande regels", () => {
    const a = attentionFor(materialen);
    expect(a.stage).toBe("werkvoorbereiding");
    expect(a.label).toBe("Materialen: 1 te bestellen");
  });
});

describe("summarizeOnboarding", () => {
  it("telt per fase en sorteert de aandachtslijst op urgentie", () => {
    const s = summarizeOnboarding([ingepland, opgeleverd, syncFout, nietIngepland, materialen]);
    expect(s.stageCounts.opgeleverd).toBe(1);
    expect(s.stageCounts.bij_installateur).toBe(3); // ingepland + nietIngepland + syncFout
    expect(s.stageCounts.werkvoorbereiding).toBe(1);
    expect(s.total).toBe(5); // geen archief
    // Alleen actionable in de aandachtslijst → 'ingepland' (passief) valt weg.
    expect(s.attention.map((a) => a.item)).not.toContain(ingepland);
    // Volgorde: sync-fout (0) < te factureren (1) < nog in te plannen (2) < materialen (3).
    expect(s.attention[0].item).toBe(syncFout);
    expect(s.attention[1].item).toBe(opgeleverd);
    expect(s.attention[2].item).toBe(nietIngepland);
    expect(s.attention[3].item).toBe(materialen);
  });
});

describe("onboardingName", () => {
  it("valt terug op het ordernummer bij een naamloze order-only onboarding", () => {
    const item = mkItem(mkOrder({ egroup_order_number: "OPD-00048" }), { company_name: "" });
    expect(onboardingName(item)).toBe("Order OPD-00048");
  });
});
