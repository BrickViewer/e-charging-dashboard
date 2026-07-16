import { describe, expect, it } from "vitest";
// De Deno edge-module (plain TS, geen Deno-globals), zoals hash.parity.test.ts.
// Pint het compat-gedrag van de zakelijke adresvalidatie vast: de website
// stuurt sinds juli 2026 losse adresvelden, oudere gecachte bundles nog één
// adres-string; beide vormen moeten blijven werken.
import {
  BadRequest,
  buildSummary,
  computeTriage,
  locatieAdresRegel,
  parseZakelijk,
} from "../../../../supabase/functions/quote-intake/validate";

function basis(locatie: Record<string, unknown>, schaal: Record<string, unknown> = {}) {
  return {
    organisatie: {
      bedrijfsnaam: "Voorbeeld BV",
      contactpersoon: "Piet Jansen",
      email: "piet@voorbeeld.nl",
      telefoon: "0612345678",
      type_organisatie: "bedrijf",
    },
    locatie: { type_locatie: "parkeergarage", ...locatie },
    schaal: { aantal_laadpunten: "4", ...schaal },
    techniek: {},
    afronden: { privacy_akkoord: true },
  };
}

const nieuwAdres = { straat: "Dwarsweg", huisnummer: "8", postcode: "5301 KT", plaats: "Zaltbommel" };

describe("parseZakelijk: adres-compat (nieuwe en oude vorm)", () => {
  it("accepteert de nieuwe vorm met losse adresvelden", () => {
    const d = parseZakelijk(basis(nieuwAdres));
    expect(d.locatie.straat).toBe("Dwarsweg");
    expect(d.locatie.adres).toBe("");
    expect(locatieAdresRegel(d.locatie)).toBe("Dwarsweg 8, 5301 KT Zaltbommel");
    const summary = buildSummary("zakelijk", d, computeTriage("zakelijk", d));
    expect(summary).toContain("Adres: Dwarsweg 8, 5301 KT Zaltbommel");
  });

  it("accepteert de oude vorm met één adres-string", () => {
    const d = parseZakelijk(basis({ adres: "Dwarsweg 8, Zaltbommel" }));
    expect(d.locatie.adres).toBe("Dwarsweg 8, Zaltbommel");
    expect(locatieAdresRegel(d.locatie)).toBe("Dwarsweg 8, Zaltbommel");
  });

  it("weigert een aanvraag zonder enige adresvorm", () => {
    expect(() => parseZakelijk(basis({}))).toThrow(BadRequest);
    expect(() => parseZakelijk(basis({}))).toThrow("Straat van de locatie is verplicht");
  });

  it("weigert een gedeeltelijk ingevulde nieuwe vorm", () => {
    expect(() => parseZakelijk(basis({ straat: "Dwarsweg" }))).toThrow(
      "Huisnummer van de locatie is verplicht",
    );
  });

  it("weigert een ongeldige postcode in de nieuwe vorm", () => {
    expect(() => parseZakelijk(basis({ ...nieuwAdres, postcode: "12AB" }))).toThrow(
      "Ongeldige postcode",
    );
  });

  it("negeert een meegestuurd (verwijderd) laadtype van een oude bundle", () => {
    const d = parseZakelijk(basis({ adres: "Dwarsweg 8, Zaltbommel" }, { laadtype: "dc_snelladen" }));
    expect("laadtype" in d.schaal).toBe(false);
    const summary = buildSummary("zakelijk", d, computeTriage("zakelijk", d));
    expect(summary).not.toContain("laadtype");
  });
});
