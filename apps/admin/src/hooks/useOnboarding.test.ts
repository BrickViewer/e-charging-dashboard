import { describe, it, expect, vi } from "vitest";

// useOnboarding importeert de supabase-client + locations-service; die mocken we zodat
// we de pure faselogica kunnen testen zonder echte client/env.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/locations", () => ({ linkLocationToClient: vi.fn() }));

import { deriveOnboardingPhase, hasPendingInvite, type OnboardingClient } from "./useOnboarding";

const base: OnboardingClient = {
  id: "c1", company_name: "Acme", client_number: 101, status: "actief",
  portal_user_id: null, contact_email: "a@b.nl", contact_name: "Jan", created_at: "2026-01-01",
  installation_orders: null, locations: null, client_invitations: null,
};
type O = { id: string; status: string | null; egroup_order_id: string | null; completed_at: string | null };
const order = (o: Partial<O>): O => ({ id: "o", status: null, egroup_order_id: null, completed_at: null, ...o });

describe("deriveOnboardingPhase", () => {
  it("geen order → getekend", () => {
    expect(deriveOnboardingPhase(base)).toBe("getekend");
  });
  it("order 'nieuw' (niet overgedragen) → getekend", () => {
    expect(deriveOnboardingPhase({ ...base, installation_orders: [order({ status: "nieuw" })] })).toBe("getekend");
  });
  it("overgedragen (egroup_order_id) → bij_installateur", () => {
    expect(deriveOnboardingPhase({ ...base, installation_orders: [order({ status: "overgedragen", egroup_order_id: "EG1" })] })).toBe("bij_installateur");
  });
  it("afgerond zonder gekoppelde laadpunten → opgeleverd", () => {
    expect(deriveOnboardingPhase({ ...base, installation_orders: [order({ status: "afgerond", egroup_order_id: "EG1", completed_at: "2026-06-01" })] })).toBe("opgeleverd");
  });
  it("afgerond mét gekoppelde laadpunten → portaal", () => {
    expect(deriveOnboardingPhase({
      ...base,
      installation_orders: [order({ status: "afgerond", egroup_order_id: "EG1", completed_at: "2026-06-01" })],
      locations: [{ id: "l", charge_points: [{ id: "cp" }] }],
    })).toBe("portaal");
  });
  it("locatie zonder laadpunten telt niet als 'koppeld' → blijft opgeleverd", () => {
    expect(deriveOnboardingPhase({
      ...base,
      installation_orders: [order({ status: "afgerond", completed_at: "2026-06-01" })],
      locations: [{ id: "l", charge_points: [] }],
    })).toBe("opgeleverd");
  });
  it("portal_user_id gezet → operationeel, ongeacht de rest", () => {
    expect(deriveOnboardingPhase({ ...base, portal_user_id: "u1", installation_orders: [order({ status: "nieuw" })] })).toBe("operationeel");
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
