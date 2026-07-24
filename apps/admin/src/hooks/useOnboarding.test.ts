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
  completed_at: null, invoiced_at: null, wefact_invoice_code: null, wefact_invoice_id: null, scheduled_date: null, work_prep_started_at: null, materials_expected_at: null,
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
// base = beheer-klant (managed + needsInstall = null → true). Uitgenodigd = er staat een pending invite.
const invited: OnboardingClient = { ...base, client_invitations: [{ id: "i", status: "pending" }] };

describe("deriveStage", () => {
  // Order-only (clientloos): beheer → account eerst (direct na tekenen); alleen-installatie → installateur-track.
  // De order komt altijd uit een getekende offerte (create_order_from_quote), vandaar quote_id.
  it("order-only, beheer → klant_aanmaken (account direct na tekenen)", () => {
    expect(deriveStage({ ...base, is_order_only: true, installation_orders: [order({ status: "nieuw", quote_id: "q1" })] })).toBe("klant_aanmaken");
  });
  // De fase 'getekend' bestaat niet meer: hij ging op in 'werkvoorbereiding', waar
  // dezelfde knop ("Werkvoorbereiding starten") al stond zolang prep niet gestart is.
  it("order-only, alleen-installatie, niets gestart → werkvoorbereiding", () => {
    expect(deriveStage({ ...base, is_order_only: true, managed: false, installation_orders: [order({ status: "nieuw" })] })).toBe("werkvoorbereiding");
  });
  it("order-only, alleen-installatie, werkvoorbereiding → werkvoorbereiding", () => {
    expect(deriveStage({ ...base, is_order_only: true, managed: false, installation_orders: [order({ work_prep_started_at: "2026-07-14" })] })).toBe("werkvoorbereiding");
  });
  it("order-only, alleen-installatie, doorgestuurd → bij_installateur", () => {
    expect(deriveStage({ ...base, is_order_only: true, managed: false, installation_orders: [order({ egroup_order_id: "EG1" })] })).toBe("bij_installateur");
  });
  it("order-only, alleen-installatie, gefactureerd → archief", () => {
    expect(deriveStage({ ...base, is_order_only: true, managed: false, installation_orders: [order({ completed_at: "2026-06-01", invoiced_at: "2026-06-02" })] })).toBe("archief");
  });

  // Beheer (echte klant): UITNODIGEN komt eerst, vóór installatie en locaties.
  it("beheer-klant nog niet uitgenodigd → klant_uitnodigen (ongeacht order)", () => {
    expect(deriveStage(base)).toBe("klant_uitnodigen");
    expect(deriveStage({ ...base, installation_orders: [order({ status: "nieuw" })] })).toBe("klant_uitnodigen");
  });
  it("uitgenodigd, installatie nog niet gestart → werkvoorbereiding (start-prep)", () => {
    expect(deriveStage({ ...invited, installation_orders: [order({ status: "nieuw" })] })).toBe("werkvoorbereiding");
  });
  it("uitgenodigd + werkvoorbereiding gestart → werkvoorbereiding", () => {
    expect(deriveStage({ ...invited, installation_orders: [order({ work_prep_started_at: "2026-07-14" })] })).toBe("werkvoorbereiding");
  });
  it("uitgenodigd + doorgestuurd → bij_installateur", () => {
    expect(deriveStage({ ...invited, installation_orders: [order({ egroup_order_id: "EG1" })] })).toBe("bij_installateur");
  });
  // Locaties koppelen staat sinds 22-07-2026 VÓÓR factureren: een beheer-klant moet ook door de
  // factureerstap als hij alleen activatiekosten heeft, en de e-Flux-locatie is er dan al.
  it("uitgenodigd + opgeleverd, geen locatie → locaties_koppelen (koppelen gaat vóór factureren)", () => {
    expect(deriveStage({ ...invited, installation_orders: [order({ egroup_order_id: "EG1", completed_at: "2026-06-01" })] })).toBe("locaties_koppelen");
  });
  it("uitgenodigd + opgeleverd (niet gefactureerd), locatie gekoppeld → opgeleverd", () => {
    expect(deriveStage({ ...invited, locations: [{ id: "l1" }], installation_orders: [order({ egroup_order_id: "EG1", completed_at: "2026-06-01" })] })).toBe("opgeleverd");
  });
  it("uitgenodigd + werkvoorbereiding + opgeleverd + locatie → opgeleverd (geen terugval)", () => {
    expect(deriveStage({ ...invited, locations: [{ id: "l1" }], installation_orders: [order({ work_prep_started_at: "2026-07-14", egroup_order_id: "EG1", completed_at: "2026-07-20" })] })).toBe("opgeleverd");
  });
  it("uitgenodigd + gefactureerd, geen locatie → locaties_koppelen", () => {
    expect(deriveStage({ ...invited, installation_orders: [order({ completed_at: "2026-06-01", invoiced_at: "2026-06-02" })] })).toBe("locaties_koppelen");
  });
  it("alleen-beheer, uitgenodigd, geen locatie → locaties_koppelen", () => {
    expect(deriveStage({ ...invited, needs_installation: false })).toBe("locaties_koppelen");
  });
  it("geaccepteerd (portal_user_id), alleen-beheer, locatie gekoppeld, gegevens incompleet → gegevens", () => {
    expect(deriveStage({ ...base, portal_user_id: "u1", needs_installation: false, locations: [{ id: "l1" }] })).toBe("gegevens");
  });
  it("alleen-beheer volledig compleet → archief", () => {
    expect(deriveStage({ ...complete, needs_installation: false, locations: [{ id: "l1" }] })).toBe("archief");
  });
  it("installatie+beheer volledig klaar (uitgenodigd + gefactureerd + locatie + gegevens) → archief", () => {
    expect(deriveStage({ ...complete, installation_orders: [order({ egroup_order_id: "EG1", completed_at: "2026-06-01", invoiced_at: "2026-06-02" })], locations: [{ id: "l1" }] })).toBe("archief");
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
