import { describe, it, expect } from "vitest";
import { splitHouse, combineHouse } from "./houseNumber";

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
