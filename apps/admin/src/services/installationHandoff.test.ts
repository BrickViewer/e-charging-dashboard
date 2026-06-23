import { describe, expect, it } from "vitest";
import {
  buildHandoffPayload,
  deriveServiceSummary,
  mapEgroupStatus,
  splitDutchAddress,
  validateSiteForHandoff,
} from "./installationHandoff";

describe("splitDutchAddress", () => {
  it("splitst straat en huisnummer met toevoeging", () => {
    expect(splitDutchAddress("Dorpsstraat 12A")).toEqual({ street: "Dorpsstraat", house_number: "12A" });
    expect(splitDutchAddress("Lange Nieuwstraat 4")).toEqual({ street: "Lange Nieuwstraat", house_number: "4" });
    expect(splitDutchAddress("Industrieweg 5-7")).toEqual({ street: "Industrieweg", house_number: "5-7" });
  });

  it("gaat netjes om met lege en huisnummerloze invoer", () => {
    expect(splitDutchAddress("")).toEqual({ street: "", house_number: "" });
    expect(splitDutchAddress(null)).toEqual({ street: "", house_number: "" });
    expect(splitDutchAddress("Postbus")).toEqual({ street: "Postbus", house_number: "" });
  });
});

describe("mapEgroupStatus", () => {
  it("mapt de E-Group lifecycle naar interne status", () => {
    expect(mapEgroupStatus("bevestigd")).toEqual({ status: "overgedragen", completed: false });
    expect(mapEgroupStatus("te_plannen")).toEqual({ status: "overgedragen", completed: false });
    expect(mapEgroupStatus("ingepland")).toEqual({ status: "ingepland", completed: false });
    expect(mapEgroupStatus("in_uitvoering")).toEqual({ status: "geinstalleerd", completed: false });
    expect(mapEgroupStatus("gereed")).toEqual({ status: "afgerond", completed: true });
    expect(mapEgroupStatus("afgerond")).toEqual({ status: "afgerond", completed: true });
  });

  it("laat onbekende status ongemoeid (alleen external_status)", () => {
    expect(mapEgroupStatus("iets_anders")).toEqual({ status: null, completed: false });
    expect(mapEgroupStatus(null)).toEqual({ status: null, completed: false });
  });
});

describe("validateSiteForHandoff", () => {
  it("blokkeert bij ontbrekende verplichte site-velden", () => {
    const res = validateSiteForHandoff({ id: "x", site_street: "Industrieweg", site_house_number: "5" });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["Postcode", "Plaats"]);
  });

  it("slaagt bij compleet adres", () => {
    const res = validateSiteForHandoff({
      id: "x",
      site_street: "Industrieweg",
      site_house_number: "5",
      site_postal: "5678 CD",
      site_city: "Utrecht",
    });
    expect(res).toEqual({ ok: true, missing: [] });
  });
});

describe("deriveServiceSummary", () => {
  it("vormt een leesbare samenvatting", () => {
    expect(deriveServiceSummary({ estimated_charge_points: 10, charger_type: "AC 22kW" })).toBe(
      "10 laadpunten - AC 22kW",
    );
    expect(deriveServiceSummary({ estimated_charge_points: 1 })).toBe("1 laadpunt");
    expect(deriveServiceSummary({ estimated_charge_points: null })).toBeNull();
    expect(deriveServiceSummary(null)).toBeNull();
  });
});

describe("buildHandoffPayload", () => {
  const base = {
    callbackUrl: "https://ec.example/functions/v1/installation-completion-webhook",
    order: {
      id: "order-uuid-1",
      notes: "Vanuit getekende offerte OFF-2026-00012",
      service_category: "e_charging",
      service_summary: "10 laadpunten",
      site_street: "Industrieweg",
      site_house_number: "5",
      site_postal: "5678 CD",
      site_city: "Utrecht",
      site_contact_name: "Jan Jansen",
      site_contact_email: "jan@acme.nl",
      site_contact_phone: "+31612345678",
    },
    client: {
      company_name: "Acme BV",
      kvk: "12345678",
      btw_number: "NL001234567B01",
      contact_name: "Piet Klant",
      contact_email: "info@acme.nl",
      contact_phone: "+31201234567",
      billing_address_street: "Dorpsstraat 12A",
      billing_address_postal: "1234 AB",
      billing_address_city: "Amsterdam",
      country: "NL",
      client_number: 142,
    },
    lead: {
      company_name: "Acme BV - hoofdkantoor",
      contact_role: "Facility Manager",
      address_street: "Industrieweg 5",
      postal_code: "5678 CD",
      city: "Utrecht",
      estimated_charge_points: 10,
      charger_type: "AC 22kW",
    },
    quote: {
      quote_number: "OFF-2026-00012",
      line_items: [
        { description: "Levering laadpaal AC 22kW", qty: 10, unit_price: 950, total: 9500 },
        { description: "Installatie en aansluiting", qty: 1, unit_price: 7500, total: 7500 },
      ],
      total_hardware_cost: 9500,
      total_installation_cost: 7500,
      with_management: true,
    },
  };

  it("bouwt een compleet, contract-conform payload", () => {
    const p = buildHandoffPayload(base);
    expect(p.external_reference).toBe("order-uuid-1");
    expect(p.external_system).toBe("e-charging");
    expect(p.service_category).toBe("e_charging");
    expect(p.source).toBe("e_charging_dashboard");
    expect(p.idempotency_key).toBe("order-uuid-1");
    expect(p.customer.name).toBe("Acme BV");
    expect(p.customer.kvk_number).toBe("12345678");
    expect(p.customer.street).toBe("Dorpsstraat");
    expect(p.customer.house_number).toBe("12A");
    expect(p.site.street).toBe("Industrieweg");
    expect(p.site.house_number).toBe("5");
    expect(p.site.postal_code).toBe("5678 CD");
    // Back-office contact = algemeen klantcontact; site_contact = on-site snapshot.
    expect(p.contact).toEqual({ name: "Piet Klant", email: "info@acme.nl", phone: "+31201234567" });
    expect(p.site_contact).toEqual({ name: "Jan Jansen", phone: "+31612345678", email: "jan@acme.nl" });
    expect(p.order_lines).toHaveLength(1);
    expect(p.order_lines[0]).toEqual({
      description: "Levering & installatie — 10 laadpunten",
      qty: 1,
      unit_price: 0,
      total: 0,
    });
    expect(p.totals).toEqual({ hardware_cost: 9500, installation_cost: 7500, with_management: true });
  });

  it("valt terug op company en lead als client-velden ontbreken", () => {
    const p = buildHandoffPayload({
      callbackUrl: base.callbackUrl,
      order: { id: "o2", site_street: "A", site_house_number: "1", site_postal: "1", site_city: "X" },
      company: { name: "Bedrijf BV", kvk: "87654321", address_street: "Kerkstraat 9" },
      lead: { contact_email: "lead@x.nl", estimated_charge_points: 3 },
      quote: null,
    });
    expect(p.customer.name).toBe("Bedrijf BV");
    expect(p.customer.kvk_number).toBe("87654321");
    expect(p.customer.street).toBe("Kerkstraat");
    expect(p.customer.email).toBe("lead@x.nl");
    expect(p.order_lines).toEqual([
      { description: "Levering & installatie — laadinfrastructuur", qty: 1, unit_price: 0, total: 0 },
    ]);
    expect(p.totals.hardware_cost).toBeNull();
  });

  it("stuurt altijd één samenvattende werkregel (e-portal toont één rij per order_line)", () => {
    const p = buildHandoffPayload({
      callbackUrl: base.callbackUrl,
      order: { id: "o3", service_summary: "3 laadpunten", site_street: "A", site_house_number: "1", site_postal: "1", site_city: "X" },
      quote: { line_items: [{ description: "Hardware", qty: 3, unit_price: 5 }, { description: "Installatie", qty: 1, unit_price: 5 }] },
    });
    expect(p.order_lines).toEqual([
      { description: "Levering & installatie — 3 laadpunten", qty: 1, unit_price: 0, total: 0 },
    ]);
  });

  it("scheidt back-office contact (klant) van site_contact (snapshot)", () => {
    const p = buildHandoffPayload({
      callbackUrl: base.callbackUrl,
      order: {
        id: "o4", site_street: "A", site_house_number: "1", site_postal: "1", site_city: "X",
        site_contact_name: "Piet op Locatie", site_contact_phone: "+31600000001", site_contact_email: "piet@loc.nl",
      },
      client: { company_name: "Acme", contact_name: "Admin Anita", contact_email: "admin@acme.nl", contact_phone: "+31200000002" },
    });
    expect(p.contact).toEqual({ name: "Admin Anita", email: "admin@acme.nl", phone: "+31200000002" });
    expect(p.site_contact).toEqual({ name: "Piet op Locatie", phone: "+31600000001", email: "piet@loc.nl" });
  });

  it("site_contact valt terug op het lead-contact als het snapshot leeg is", () => {
    const p = buildHandoffPayload({
      callbackUrl: base.callbackUrl,
      order: { id: "o5", site_street: "A", site_house_number: "1", site_postal: "1", site_city: "X" },
      client: { company_name: "Acme", contact_name: "Admin Anita", contact_phone: "+31200000002" },
      lead: { contact_name: "Lead Lars", contact_phone: "+31600000009" },
    });
    expect(p.contact.name).toBe("Admin Anita");
    expect(p.site_contact.name).toBe("Lead Lars");
    expect(p.site_contact.phone).toBe("+31600000009");
  });
});
