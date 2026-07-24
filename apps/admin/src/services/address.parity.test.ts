import { describe, it, expect } from "vitest";
import { splitStreetAndHouse, joinStreetAndHouse } from "@/lib/houseNumber";
// De Deno-spiegel. Puur (geen Deno-globals), dus importeerbaar in vitest.
import {
  splitDutchAddress as splitDeno,
  joinStreetAndHouse as joinDeno,
} from "../../../../supabase/functions/_shared/installationHandoff";

// ============================================================================
// Straat/huisnummer splitsen bestond ooit VIJF keer apart in deze codebase, met drie
// verschillende gedragingen — daardoor stond bij o.a. Albert Vos het huisnummer in het
// straatveld. Er is nu één definitie (lib/houseNumber.ts) met twee spiegels die identiek
// moeten blijven: deze Deno-kopie en app_private.split_dutch_address (SQL).
//
// Deze tabel is de gedeelde waarheid. Wijzigt het gedrag, wijzig hem hier én controleer de
// SQL-kant met dezelfde rijen:
//   select a.raw, (app_private.split_dutch_address(a.raw)).*
//   from (values ('Alfred Smithlaan 37'), ...) as a(raw);
// ============================================================================

const CASES: Array<{ raw: string; street: string; house: string }> = [
  // De vier adresvormen die nu in productie staan
  { raw: "Alfred Smithlaan 37", street: "Alfred Smithlaan", house: "37" },
  { raw: "Bleekstraat 3D", street: "Bleekstraat", house: "3D" },
  { raw: "Getijdenlaan 80", street: "Getijdenlaan", house: "80" },
  { raw: "Dwarsweg 10-14", street: "Dwarsweg", house: "10-14" },
  // Meerwoordige straatnamen
  { raw: "de Flank 18", street: "de Flank", house: "18" },
  { raw: "Lange Nieuwstraat 4", street: "Lange Nieuwstraat", house: "4" },
  // Spatie tussen nummer en letter → letter hoort bij het huisnummer
  { raw: "Dorpsstraat 12 A", street: "Dorpsstraat", house: "12A" },
  { raw: "Industrieweg 5-7", street: "Industrieweg", house: "5-7" },
  // Achtervoegsel dat géén huisnummerletter is → bewust NIET splitsen; liever niets dan
  // een half adres wegschrijven.
  { raw: "Kerkstraat 1 bis", street: "Kerkstraat 1 bis", house: "" },
  { raw: "Postbus", street: "Postbus", house: "" },
  { raw: "", street: "", house: "" },
];

describe("splitStreetAndHouse — canonieke bron", () => {
  for (const c of CASES) {
    it(`"${c.raw}" → ["${c.street}", "${c.house}"]`, () => {
      expect(splitStreetAndHouse(c.raw)).toEqual([c.street, c.house]);
    });
  }

  it("gaat om met null/undefined", () => {
    expect(splitStreetAndHouse(null)).toEqual(["", ""]);
    expect(splitStreetAndHouse(undefined)).toEqual(["", ""]);
  });
});

describe("pariteit met de Deno-spiegel (_shared/installationHandoff)", () => {
  for (const c of CASES) {
    it(`"${c.raw}" identiek in beide implementaties`, () => {
      const [street, house] = splitStreetAndHouse(c.raw);
      expect(splitDeno(c.raw)).toEqual({ street, house_number: house });
    });
  }
});

describe("joinStreetAndHouse", () => {
  it("is de tegenhanger van splitsen", () => {
    for (const c of CASES) {
      const [street, house] = splitStreetAndHouse(c.raw);
      // Round-trip: samenvoegen levert het genormaliseerde adres weer op. "12 A" wordt
      // daarbij "12A" — dat is de bedoelde normalisatie, geen verlies.
      expect(joinStreetAndHouse(street, house)).toBe(c.raw.replace(/(\d)\s+([A-Za-z])$/, "$1$2").trim());
    }
  });

  it("laat lege delen weg", () => {
    expect(joinStreetAndHouse("Alfred Smithlaan", "")).toBe("Alfred Smithlaan");
    expect(joinStreetAndHouse("", "37")).toBe("37");
    expect(joinStreetAndHouse(null, null)).toBe("");
    expect(joinStreetAndHouse("  Kerkstraat  ", "  1  ")).toBe("Kerkstraat 1");
  });

  it("is identiek in de Deno-spiegel", () => {
    for (const c of CASES) {
      const [street, house] = splitStreetAndHouse(c.raw);
      expect(joinDeno(street, house)).toBe(joinStreetAndHouse(street, house));
    }
  });
});
