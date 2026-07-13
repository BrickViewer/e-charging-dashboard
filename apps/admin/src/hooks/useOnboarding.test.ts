import { describe, it, expect, vi } from "vitest";

// useOnboarding importeert de supabase-client + locations-service; die mocken we zodat
// we de pure stagelogica kunnen testen zonder echte client/env.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/locations", () => ({ linkLocationToClient: vi.fn() }));

import { deriveStage, isDetailsComplete, hasPendingInvite, type OnboardingClient, type OnbOrder } from "./useOnboarding";

const base: OnboardingClient = {
  id: "c1", company_name: "Acme", client_number: 101, status: "actief",
  portal_user_id: null, contact_email: "a@b.nl", contact_name: "Jan", contact_phone: null, created_at: "2026-01-01",
  payment_onboarding_status: null, needs_installation: null, managed: null, vat_status: null, kvk: null, btw_number: null,
  billing_address_street: null, billing_address_postal: null, billing_address_city: null,
  installation_orders: null, locations: null, client_invitations: null,
};

const order = (o: Partial<OnbOrder>): OnbOrder => ({
  id: "o", quote_id: null, status: null, egroup_order_id: null, egroup_order_number: null, external_status: null,
  completed_at: null, invoiced_at: null, scheduled_date: null, work_prep_started_at: null, materials_expected_at: null,
  preparation_notes: null, materials_synced_at: null, last_sync_error: null,
  site_street: null, site_house_number: null, site_postal: null,
  site_city: null, site_contact_name: null, site_contact_email: null, site_contact_phone: null,
  service_summary: null, notes: null, ...o,
});

// Klant met alle gegevens compleet (particulier: geen KvK/BTW nodig).
const complete: OnboardingClient = {
  ...base, portal_user_id: "u1", vat_status: "private",
  billing_address_street: "Straat 1", billing_address_postal: "1234AB", billing_address_city: "Eindhoven",
  payment_onboarding_status: "saved",
};

describe("deriveStage", () => {
  it("geen order → getekend", () => {
    expect(deriveStage(base)).toBe("getekend");
  });
  it("order 'nieuw' (niet doorgestuurd) → getekend", () => {
    expect(deriveStage({ ...base, installation_orders: [order({ status: "nieuw" })] })).toBe("getekend");
  });
  it("doorgestuurd (egroup_order_id) → bij_installateur", () => {
    expect(deriveStage({ ...base, installation_orders: [order({ status: "overgedragen", egroup_order_id: "EG1" })] })).toBe("bij_installateur");
  });
  it("werkvoorbereiding gestart, nog niet doorgestuurd → werkvoorbereiding", () => {
    expect(deriveStage({ ...base, installation_orders: [order({ status: "nieuw", work_prep_started_at: "2026-07-14" })] })).toBe("werkvoorbereiding");
  });
  it("werkvoorbereiding + doorgestuurd → bij_installateur (geen terugval)", () => {
    expect(deriveStage({
      ...base,
      installation_orders: [order({ status: "overgedragen", work_prep_started_at: "2026-07-14", egroup_order_id: "EG1" })],
    })).toBe("bij_installateur");
  });
  it("werkvoorbereiding + opgeleverd → opgeleverd (geen terugval)", () => {
    expect(deriveStage({
      ...base,
      installation_orders: [order({ status: "afgerond", work_prep_started_at: "2026-07-14", egroup_order_id: "EG1", completed_at: "2026-07-20" })],
    })).toBe("opgeleverd");
  });
  it("order-only: werkvoorbereiding gestart → werkvoorbereiding", () => {
    expect(deriveStage({
      ...base, is_order_only: true, managed: false,
      installation_orders: [order({ status: "nieuw", work_prep_started_at: "2026-07-14" })],
    })).toBe("werkvoorbereiding");
  });
  it("tweede, al verstuurde order trekt de fase niet terug naar werkvoorbereiding", () => {
    expect(deriveStage({
      ...base,
      installation_orders: [
        order({ id: "o1", status: "overgedragen", work_prep_started_at: "2026-07-01", egroup_order_id: "EG1" }),
      ],
    })).toBe("bij_installateur");
  });
  it("opgeleverd (afgerond), niet gefactureerd → opgeleverd", () => {
    expect(deriveStage({ ...base, installation_orders: [order({ status: "afgerond", egroup_order_id: "EG1", completed_at: "2026-06-01" })] })).toBe("opgeleverd");
  });
  it("gefactureerd, geen locatie → locaties_koppelen", () => {
    expect(deriveStage({ ...base, installation_orders: [order({ status: "afgerond", completed_at: "2026-06-01", invoiced_at: "2026-06-02" })] })).toBe("locaties_koppelen");
  });
  it("locatie gekoppeld, nog niet geaccepteerd → klant_uitnodigen", () => {
    expect(deriveStage({
      ...base,
      installation_orders: [order({ status: "afgerond", completed_at: "2026-06-01", invoiced_at: "2026-06-02" })],
      locations: [{ id: "l1" }],
    })).toBe("klant_uitnodigen");
  });
  it("uitnodiging geaccepteerd (portal_user_id), gegevens incompleet → gegevens", () => {
    expect(deriveStage({ ...base, portal_user_id: "u1", locations: [{ id: "l1" }] })).toBe("gegevens");
  });
  it("gegevens compleet → archief (ongeacht de rest)", () => {
    expect(deriveStage(complete)).toBe("archief");
  });
});

describe("isDetailsComplete", () => {
  it("particulier met adres + bank saved → compleet", () => {
    expect(isDetailsComplete(complete)).toBe(true);
  });
  it("bank ontbreekt → niet compleet", () => {
    expect(isDetailsComplete({ ...complete, payment_onboarding_status: "missing" })).toBe(false);
  });
  it("vat_liable zonder BTW-nummer → niet compleet", () => {
    expect(isDetailsComplete({ ...complete, vat_status: "vat_liable", kvk: "12345678", btw_number: null })).toBe(false);
  });
  it("vat_liable mét KvK + BTW → compleet", () => {
    expect(isDetailsComplete({ ...complete, vat_status: "vat_liable", kvk: "12345678", btw_number: "NL123456789B01" })).toBe(true);
  });
});

describe("hasPendingInvite", () => {
  it("pending → true", () => {
    expect(hasPendingInvite({ ...base, client_invitations: [{ id: "i", status: "pending" }] })).toBe(true);
  });
  it("accepted → false", () => {
    expect(hasPendingInvite({ ...base, client_invitations: [{ id: "i", status: "accepted" }] })).toBe(false);
  });
});
