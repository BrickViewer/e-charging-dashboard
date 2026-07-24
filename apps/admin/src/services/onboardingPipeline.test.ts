import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS, activeOrder, buildSkipIndex, currentStep, deriveStage, stepStates,
  type OnbOrder, type OnboardingClient,
} from "./onboardingPipeline";

const order = (o: Partial<OnbOrder>): OnbOrder => ({
  id: "o", quote_id: null, status: null, egroup_order_id: null, egroup_order_number: null, external_status: null,
  completed_at: null, invoiced_at: null, wefact_invoice_code: null, wefact_invoice_id: null, scheduled_date: null,
  work_prep_started_at: null, materials_expected_at: null, preparation_notes: null,
  materials_synced_at: null, last_sync_error: null, site_street: null, site_house_number: null, site_postal: null,
  site_city: null, site_contact_name: null, site_contact_email: null, site_contact_phone: null,
  service_summary: null, notes: null, ...o,
});

// Kale klant: beheer + installatie (DB-defaults), geen portaal, geen locatie, geen gegevens.
const base: OnboardingClient = {
  id: "c1", company_name: "Acme", client_number: 101, status: "actief",
  portal_user_id: null, contact_email: "a@b.nl", contact_name: "Jan", contact_phone: null, created_at: "2026-01-01",
  payment_onboarding_status: null, needs_installation: null, managed: null, vat_status: null, kvk: null, btw_number: null,
  billing_address_street: null, billing_address_postal: null, billing_address_city: null,
  installation_orders: null, locations: null, client_invitations: null,
};
const compleet: Partial<OnboardingClient> = {
  portal_user_id: "u1", vat_status: "private", billing_address_street: "Straat 1",
  billing_address_postal: "1234AB", billing_address_city: "Eindhoven", payment_onboarding_status: "saved",
};

const keys = (c: OnboardingClient) =>
  stepStates(c).filter((s) => s.status !== "na").map((s) => `${s.step.key}:${s.status}`);

describe("instroompunten — iedereen loopt dezelfde ladder, alleen op een ander punt", () => {
  it("getekende alleen-beheer-offerte (geen klant, geen order) → klant_aanmaken", () => {
    const q: OnboardingClient = {
      ...base, id: "q1", kind: "quote", is_order_only: true, needs_installation: false,
      _quoteForClient: { id: "q1", quote_number: "210-01-26", prospect_company: "X", prospect_contact: null,
        prospect_email: null, company_id: null, person_id: null, with_management: true, with_installation: false,
        charge_rate_per_kwh: null, energy_cost_per_kwh: null, calculation_snapshot: null, offer_details: null },
    };
    expect(deriveStage(q)).toBe("klant_aanmaken");
    // De installateur-stappen zijn niet van toepassing, niet 'geblokkeerd'.
    expect(keys(q)).toEqual(["klant_aanmaken:todo", "klant_uitnodigen:blocked", "locaties_koppelen:blocked", "gegevens:blocked"]);
  });

  it("clientloze alleen-installatie-order, niets gestart → werkvoorbereiding", () => {
    const o: OnboardingClient = {
      ...base, kind: "order", is_order_only: true, managed: false,
      installation_orders: [order({ status: "nieuw" })],
    };
    expect(deriveStage(o)).toBe("werkvoorbereiding");
  });

  it("clientloze installatie+beheer-order → klant_aanmaken, maar de installatievoortgang blijft zichtbaar", () => {
    const o: OnboardingClient = {
      ...base, kind: "order", is_order_only: true,
      installation_orders: [order({ quote_id: "q1", egroup_order_id: "EG1" })],
    };
    expect(deriveStage(o)).toBe("klant_aanmaken");
    expect(keys(o)).toEqual([
      "klant_aanmaken:todo", "klant_uitnodigen:blocked",
      "werkvoorbereiding:done", "bij_installateur:waiting",
      "locaties_koppelen:blocked", "opgeleverd:blocked", "gegevens:blocked",
    ]);
  });

  it("handmatig aangemaakte klant zonder offerte/order → klant_uitnodigen", () => {
    expect(deriveStage(base)).toBe("klant_uitnodigen");
  });

  it("bestaande klant, uitgenodigd, geen installatie-order → locaties_koppelen (geen dode knop)", () => {
    const c: OnboardingClient = { ...base, portal_user_id: "u1" };
    expect(deriveStage(c)).toBe("locaties_koppelen");
    // De installateur-stappen zijn geblokkeerd (geen order) en worden overgeslagen.
    const st = stepStates(c);
    expect(st.find((s) => s.step.key === "werkvoorbereiding")?.status).toBe("blocked");
    expect(st.find((s) => s.step.key === "werkvoorbereiding")?.reason).toBe("Geen installatie-order");
  });

  it("klant zonder e-mailadres → uitnodigen geblokkeerd met reden, kaart gaat door", () => {
    const c: OnboardingClient = { ...base, contact_email: null };
    const st = stepStates(c);
    expect(st.find((s) => s.step.key === "klant_uitnodigen")?.reason).toBe("Geen e-mailadres bekend");
    expect(deriveStage(c)).toBe("locaties_koppelen");
  });

  it("clientloze order zónder offerte → account aanmaken kan niet, dus installateur-track", () => {
    const o: OnboardingClient = {
      ...base, kind: "order", is_order_only: true, managed: true,
      installation_orders: [order({ status: "nieuw" })],
    };
    const st = stepStates(o);
    expect(st.find((s) => s.step.key === "klant_aanmaken")?.status).toBe("blocked");
    expect(deriveStage(o)).toBe("werkvoorbereiding");
  });
});

describe("de ladder is sequentieel", () => {
  it("een latere stap dringt niet voor terwijl een eerdere nog loopt", () => {
    const bijInstallateur: OnboardingClient = {
      ...base, portal_user_id: "u1", installation_orders: [order({ egroup_order_id: "EG1" })],
    };
    // locaties_koppelen staat open, maar de installateur is nog bezig.
    expect(deriveStage(bijInstallateur)).toBe("bij_installateur");
  });

  it("INVARIANT: de huidige stap is altijd de eerste openstaande stap in tabelvolgorde", () => {
    const gevallen: OnboardingClient[] = [
      base,
      { ...base, portal_user_id: "u1" },
      { ...base, kind: "order", is_order_only: true, managed: false, installation_orders: [order({ status: "nieuw" })] },
      { ...base, portal_user_id: "u1", installation_orders: [order({ egroup_order_id: "EG1", completed_at: "2026-06-01" })] },
      { ...base, ...compleet, locations: [{ id: "l1" }], needs_installation: false },
    ];
    for (const c of gevallen) {
      const states = stepStates(c);
      const cur = currentStep(states);
      const open = states.filter((s) => s.status === "todo" || s.status === "waiting");
      expect(cur).toBe(open[0] ?? null);
      // en de volgorde volgt ONBOARDING_STEPS, niet een prioriteit
      if (cur) {
        const idx = ONBOARDING_STEPS.findIndex((s) => s.key === cur.step.key);
        expect(states.slice(0, idx).every((s) => s.status !== "todo" && s.status !== "waiting")).toBe(true);
      }
    }
  });

  it("geblokkeerd is nooit de huidige stap", () => {
    const c: OnboardingClient = { ...base, portal_user_id: "u1" };
    const states = stepStates(c);
    expect(currentStep(states)?.status).not.toBe("blocked");
  });
});

describe("activeOrder", () => {
  it("negeert een geannuleerde order", () => {
    const c: OnboardingClient = {
      ...base,
      installation_orders: [order({ id: "nieuw", status: "geannuleerd" }), order({ id: "echt", status: "nieuw" })],
    };
    expect(activeOrder(c)?.id).toBe("echt");
  });

  it("herhaalklant: de nieuwe, nog niet gefactureerde order telt (niet de oude gefactureerde)", () => {
    const c: OnboardingClient = {
      ...base, portal_user_id: "u1", locations: [{ id: "l1" }],
      installation_orders: [
        order({ id: "nieuw", status: "nieuw" }),
        order({ id: "oud", completed_at: "2026-01-01", invoiced_at: "2026-01-02" }),
      ],
    };
    expect(activeOrder(c)?.id).toBe("nieuw");
    // ...en de installatiestappen staan dus wéér open in plaats van 'afgerond'.
    expect(deriveStage(c)).toBe("werkvoorbereiding");
  });

  it("alles gefactureerd → de nieuwste order", () => {
    const c: OnboardingClient = {
      ...base,
      installation_orders: [order({ id: "nieuwste", invoiced_at: "2026-05-01" }), order({ id: "ouder", invoiced_at: "2026-01-01" })],
    };
    expect(activeOrder(c)?.id).toBe("nieuwste");
  });
});

describe("stappen overslaan", () => {
  it("een overgeslagen stap schuift de kaart door en houdt de reden vast", () => {
    const c: OnboardingClient = { ...base, portal_user_id: "u1" };
    expect(deriveStage(c)).toBe("locaties_koppelen");
    const skips = buildSkipIndex([
      { step_key: "locaties_koppelen", client_id: "c1", installation_order_id: null, quote_id: null, reason: "Klant heeft geen palen" },
    ]);
    expect(deriveStage(c, skips)).toBe("gegevens");
    expect(stepStates(c, skips).find((s) => s.step.key === "locaties_koppelen")).toMatchObject({
      status: "skipped", reason: "Klant heeft geen palen",
    });
  });

  it("alle resterende stappen overslaan = onboarding afgesloten → archief", () => {
    const c: OnboardingClient = { ...base, portal_user_id: "u1" };
    const skips = buildSkipIndex(
      ["werkvoorbereiding", "bij_installateur", "opgeleverd", "locaties_koppelen", "gegevens"].map((step_key) => ({
        step_key, client_id: "c1", installation_order_id: null, quote_id: null, reason: "Handmatig afgesloten",
      })),
    );
    expect(deriveStage(c, skips)).toBe("archief");
  });

  it("installatiestappen hangen aan de ORDER, klantstappen aan de KLANT — een skip overleeft de order→klant-overgang", () => {
    const alsOrder: OnboardingClient = {
      ...base, id: "o1", kind: "order", is_order_only: true,
      installation_orders: [order({ id: "o1", quote_id: "q1" })],
    };
    const skips = buildSkipIndex([
      { step_key: "werkvoorbereiding", client_id: null, installation_order_id: "o1", quote_id: null, reason: "Materiaal lag er al" },
    ]);
    expect(stepStates(alsOrder, skips).find((s) => s.step.key === "werkvoorbereiding")?.status).toBe("skipped");

    // Zelfde order, nu gekoppeld aan een echte klant: de kaart-id verandert, het anker niet.
    const alsKlant: OnboardingClient = { ...base, id: "c9", portal_user_id: "u1", installation_orders: [order({ id: "o1", quote_id: "q1" })] };
    expect(stepStates(alsKlant, skips).find((s) => s.step.key === "werkvoorbereiding")?.status).toBe("skipped");
  });
});

// Factureren staat sinds 22-07-2026 NÁ locaties koppelen, en geldt óók voor een beheer-klant
// zonder installatie die nog activatiekosten open heeft staan.
describe("factuurstap: installatie én losse activatiekosten", () => {
  const beheerKlant: OnboardingClient = {
    ...base, needs_installation: false, portal_user_id: "u1", locations: [{ id: "l1" }],
    vat_status: "private", billing_address_street: "Straat 1", billing_address_postal: "1234AB",
    billing_address_city: "Eindhoven", payment_onboarding_status: "saved",
  };

  it("beheer-klant met openstaande activatiekosten → opgeleverd (Factureren)", () => {
    expect(deriveStage({ ...beheerKlant, activation_fee_total: 18.5 })).toBe("opgeleverd");
  });

  it("activatie 0 → de stap bestaat niet eens (n.v.t.), klant is gewoon klaar", () => {
    const c = { ...beheerKlant, activation_fee_total: 0 };
    expect(stepStates(c).find((s) => s.step.key === "opgeleverd")?.status).toBe("na");
    expect(deriveStage(c)).toBe("archief");
  });

  it("al gefactureerd → stap klaar, kaart loopt door", () => {
    expect(deriveStage({ ...beheerKlant, activation_fee_total: 18.5, activation_invoiced_total: 18.5 })).toBe("archief");
  });

  it("deels gefactureerd → blijft openstaan", () => {
    expect(deriveStage({ ...beheerKlant, activation_fee_total: 111, activation_invoiced_total: 92.5 })).toBe("opgeleverd");
  });

  it("locaties koppelen gaat vóór factureren", () => {
    const zonderLocatie = { ...beheerKlant, locations: [], activation_fee_total: 18.5 };
    expect(deriveStage(zonderLocatie)).toBe("locaties_koppelen");
  });

  it("anker is de ORDER bij een installatie en de KLANT bij losse activatie", () => {
    const metOrder: OnboardingClient = {
      ...base, portal_user_id: "u1", locations: [{ id: "l1" }],
      installation_orders: [order({ id: "o9", egroup_order_id: "EG1", completed_at: "2026-06-01" })],
    };
    expect(stepStates(metOrder).find((s) => s.step.key === "opgeleverd")?.anchor).toBe("order");
    expect(stepStates({ ...beheerKlant, activation_fee_total: 18.5 }).find((s) => s.step.key === "opgeleverd")?.anchor).toBe("client");
  });

  it("installatie+beheer zonder bruikbare order valt terug op de activatievariant", () => {
    const c: OnboardingClient = {
      ...base, portal_user_id: "u1", locations: [{ id: "l1" }], activation_fee_total: 18.5,
      installation_orders: [order({ id: "x", status: "geannuleerd" })],
    };
    // Geen levende order → geen 'Wacht op oplevering'-blokkade, wél te factureren activatie.
    expect(deriveStage(c)).toBe("opgeleverd");
    expect(stepStates(c).find((s) => s.step.key === "opgeleverd")?.anchor).toBe("client");
  });

  it("order-only kaarten hebben geen activatie → gedrag ongewijzigd", () => {
    const o: OnboardingClient = {
      ...base, kind: "order", is_order_only: true, managed: false,
      installation_orders: [order({ egroup_order_id: "EG1", completed_at: "2026-06-01" })],
    };
    expect(deriveStage(o)).toBe("opgeleverd");
  });
});

describe("activeOrder: alles geannuleerd", () => {
  it("geeft null (geen dode knop op een geannuleerde order)", () => {
    const c: OnboardingClient = { ...base, installation_orders: [order({ id: "x", status: "geannuleerd" })] };
    expect(activeOrder(c)).toBeNull();
    expect(stepStates(c).find((s) => s.step.key === "werkvoorbereiding")?.reason).toBe("Geen installatie-order");
  });
});
