import { describe, expect, it } from "vitest";
// De Deno edge-module (plain TS, geen Deno-globals), zoals hash.parity.test.ts.
// Pint het compat-gedrag van de zakelijke adresvalidatie vast: de website
// stuurt sinds juli 2026 losse adresvelden, oudere gecachte bundles nog één
// adres-string; beide vormen moeten blijven werken.
import {
  BadRequest,
  buildSummary,
  combineHuisnummer,
  computeTriage,
  locatieAdresRegel,
  parseParticulier,
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

  it("neemt de huisnummer-toevoeging mee in de adresregel", () => {
    expect(combineHuisnummer("8", "A")).toBe("8 A");
    expect(combineHuisnummer("8", "")).toBe("8");
    const d = parseZakelijk(basis({ ...nieuwAdres, toevoeging: "A" }));
    expect(locatieAdresRegel(d.locatie)).toBe("Dwarsweg 8 A, 5301 KT Zaltbommel");
  });
});

/* ─────────────────────── particulier: verzwaring en sliders ─────────────────────── */

function particulierBasis(extra: {
  gegevens?: Record<string, unknown>;
  meterkast?: Record<string, unknown>;
  verrekenen?: Record<string, unknown>;
} = {}) {
  return {
    gegevens: {
      naam: "Jan de Vries",
      straat: "Dwarsweg",
      huisnummer: "8",
      postcode: "5301 KT",
      plaats: "Zaltbommel",
      email: "jan@voorbeeld.nl",
      telefoon: "0612345678",
      ...extra.gegevens,
    },
    meterkast: { kruipruimte: "ja", aansluiting: "1_fase", ...extra.meterkast },
    aantal_laadpalen: 1,
    laadpalen: [{ vaste_kabel: "nee", kleur_front: "zwart" }],
    verrekenen: {
      zakelijk_verrekenen: "ja",
      dynamisch_contract: "nee",
      laadtarief: "kostenvergoeding_marge",
      ...extra.verrekenen,
    },
    afronden: { plaatsing: "zo_snel_mogelijk", privacy_akkoord: true },
  };
}

describe("parseParticulier: toevoeging, verzwaring en tarief-sliders", () => {
  it("accepteert een oude payload zonder de nieuwe velden", () => {
    const d = parseParticulier(particulierBasis());
    expect(d.gegevens.toevoeging).toBe("");
    expect(d.meterkast.verzwaring_3fase).toBe("");
    expect(d.verrekenen.stroomkosten_cent).toBeNull();
    expect(d.verrekenen.marge_cent).toBeNull();
  });

  it("neemt toevoeging, verzwaring en sliders mee in de samenvatting", () => {
    const d = parseParticulier(
      particulierBasis({
        gegevens: { toevoeging: "A" },
        meterkast: { verzwaring_3fase: "ja", verzwaring_maand: "2099-06" },
        verrekenen: { stroomkosten_cent: 30, marge_cent: 7 },
      }),
    );
    const summary = buildSummary("particulier", d, computeTriage("particulier", d));
    expect(summary).toContain("Adres: Dwarsweg 8 A, 5301 KT Zaltbommel");
    expect(summary).toContain("Verzwaring naar 3-fase: Ja");
    expect(summary).toContain("Verwachte verzwaring: juni 2099");
    expect(summary).toContain("Gemiddelde stroomkosten: 30 cent per kWh");
    expect(summary).toContain("Gewenste marge: 7 cent per kWh");
  });

  it("weigert slider-waarden buiten het bereik en een ongeldige verzwaring-maand", () => {
    expect(() =>
      parseParticulier(particulierBasis({ verrekenen: { stroomkosten_cent: 999 } })),
    ).toThrow("Ongeldige waarde voor Gemiddelde stroomkosten");
    expect(() =>
      parseParticulier(particulierBasis({ verrekenen: { marge_cent: 2.5 } })),
    ).toThrow(BadRequest);
    expect(() =>
      parseParticulier(
        particulierBasis({ meterkast: { verzwaring_3fase: "ja", verzwaring_maand: "morgen" } }),
      ),
    ).toThrow("Ongeldige maand");
  });
});
