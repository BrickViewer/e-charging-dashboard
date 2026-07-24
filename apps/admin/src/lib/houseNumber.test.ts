import { describe, it, expect } from "vitest";
import { splitHouse, combineHouse, splitStreetAndHouse } from "./houseNumber";

describe("splitHouse", () => {
  it("splits a house number + letter", () => {
    expect(splitHouse("3D")).toEqual({ number: "3", addition: "D" });
  });
  it("keeps an extended range as the number", () => {
    expect(splitHouse("10-14")).toEqual({ number: "10-14", addition: "" });
  });
  it("splits a range + addition and normalises separator spacing", () => {
    expect(splitHouse("10 - 14 A")).toEqual({ number: "10-14", addition: "A" });
  });
  it("handles a spaced letter addition", () => {
    expect(splitHouse("3 bis")).toEqual({ number: "3", addition: "bis" });
  });
  it("returns empty parts for empty input", () => {
    expect(splitHouse("")).toEqual({ number: "", addition: "" });
    expect(splitHouse(null)).toEqual({ number: "", addition: "" });
  });
  it("puts input without a leading digit fully in addition", () => {
    expect(splitHouse("bis")).toEqual({ number: "", addition: "bis" });
  });
});

describe("combineHouse", () => {
  it("joins number + addition with a single space", () => {
    expect(combineHouse("3", "D")).toBe("3 D");
    expect(combineHouse("10-14", "A")).toBe("10-14 A");
  });
  it("omits an empty addition", () => {
    expect(combineHouse("10-14", "")).toBe("10-14");
    expect(combineHouse("3", "")).toBe("3");
  });
  it("is empty when both parts are empty", () => {
    expect(combineHouse("", "")).toBe("");
  });
  it("round-trips a split value", () => {
    const p = splitHouse("10-14 A");
    expect(combineHouse(p.number, p.addition)).toBe("10-14 A");
  });
});

// Spiegel van app_private.split_dutch_address: clients heeft één billing-straatkolom terwijl
// persons/companies straat + huisnummer los opslaan — en dat contactadres voedt de
// WeFact-debiteur. De cases hieronder zijn de vier adresvormen die nu in productie staan,
// plus het randgeval waar de SQL-functie bewust niet splitst.
describe("splitStreetAndHouse", () => {
  it("splits the live production address forms", () => {
    expect(splitStreetAndHouse("Alfred Smithlaan 37")).toEqual(["Alfred Smithlaan", "37"]);
    expect(splitStreetAndHouse("Bleekstraat 3D")).toEqual(["Bleekstraat", "3D"]);
    expect(splitStreetAndHouse("Getijdenlaan 80")).toEqual(["Getijdenlaan", "80"]);
    expect(splitStreetAndHouse("Dwarsweg 10-14")).toEqual(["Dwarsweg", "10-14"]);
  });
  it("keeps a multi-word street intact", () => {
    expect(splitStreetAndHouse("de Flank 18")).toEqual(["de Flank", "18"]);
  });
  it("leaves the house number empty when it cannot split (same as the SQL side)", () => {
    expect(splitStreetAndHouse("Kerkstraat 1 bis")).toEqual(["Kerkstraat 1 bis", ""]);
  });
  it("handles empty input", () => {
    expect(splitStreetAndHouse("")).toEqual(["", ""]);
    expect(splitStreetAndHouse(null)).toEqual(["", ""]);
    expect(splitStreetAndHouse(undefined)).toEqual(["", ""]);
  });
});
