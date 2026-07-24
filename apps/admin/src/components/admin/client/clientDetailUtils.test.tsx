import { describe, expect, it } from "vitest";

import { toOnboardingItem } from "./clientDetailUtils";
import { stepStates } from "@/services/onboardingPipeline";
import type { ClientWithRelations } from "@/types/db";

// Alleen-beheer-klant zoals Albert Vos (#102): geen installatie-order, wél € 18,50
// verkochte activatiekosten die nog niet gefactureerd zijn.
const beheerKlant = {
  id: "c1",
  company_name: "Albert Vos",
  client_number: 102,
  status: "actief",
  portal_user_id: "u1",
  contact_email: "a@b.nl",
  contact_name: "Albert Vos",
  contact_phone: null,
  created_at: "2026-07-07",
  payment_onboarding_status: "missing",
  needs_installation: false,
  managed: true,
  vat_status: "private",
  kvk: null,
  btw_number: null,
  billing_address_street: "Alfred Smithlaan 37",
  billing_address_postal: "5301VE",
  billing_address_city: "Zaltbommel",
  activation_fee_total: 18.5,
  activation_invoiced_total: 0,
  locations: [{ id: "l1", archived_at: null }],
  client_invitations: [],
} as unknown as ClientWithRelations;

const factuurStatus = (client: ClientWithRelations) =>
  stepStates(toOnboardingItem(client, [])).find((s) => s.step.key === "opgeleverd")?.status;

describe("toOnboardingItem", () => {
  // Regressie: zonder deze twee velden rekende de klantpagina met activationOpen = 0 en
  // toonde ze 'Factureren' als n.v.t., terwijl het onboarding-bord de stap wél openzette.
  it("geeft de activatievelden door aan het onboarding-model", () => {
    const item = toOnboardingItem(beheerKlant, []);
    expect(item.activation_fee_total).toBe(18.5);
    expect(item.activation_invoiced_total).toBe(0);
  });

  it("factuurstap staat open bij openstaande activatiekosten zonder installatie-order", () => {
    expect(factuurStatus(beheerKlant)).toBe("todo");
  });

  it("factuurstap blijft open bij een deelfactuur", () => {
    expect(factuurStatus({ ...beheerKlant, activation_fee_total: 111, activation_invoiced_total: 92.5 })).toBe("todo");
  });

  // Niets (meer) te factureren = de stap bestaat niet voor een beheer-klant; zie
  // `applies` in onboardingPipeline.ts. Geldt zowel na volledige facturatie als
  // wanneer er nooit activatiekosten zijn verkocht.
  it("factuurstap verdwijnt zodra er niets meer te factureren valt", () => {
    expect(factuurStatus({ ...beheerKlant, activation_invoiced_total: 18.5 })).toBe("na");
    expect(factuurStatus({ ...beheerKlant, activation_fee_total: 0 })).toBe("na");
  });
});
