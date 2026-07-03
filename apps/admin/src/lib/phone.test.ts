import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone, isValidPhone } from "./phone";

describe("normalizePhone", () => {
  it("normaliseert de nummers uit de praktijk naar E.164", () => {
    expect(normalizePhone("06-54254216")).toBe("+31654254216");
    expect(normalizePhone("0630252040")).toBe("+31630252040");
    expect(normalizePhone("+31 6 45 06 42 77")).toBe("+31645064277");
    expect(normalizePhone("0644756648")).toBe("+31644756648");
    expect(normalizePhone("06-43361222")).toBe("+31643361222");
    expect(normalizePhone("06 51157364")).toBe("+31651157364");
  });

  it("ondersteunt vast en internationaal", () => {
    expect(normalizePhone("020-1234567")).toBe("+31201234567");
    expect(normalizePhone("0418 684272")).toBe("+31418684272");
    expect(normalizePhone("+49 30 12345678")).toBe("+493012345678");
    expect(normalizePhone("+32 470 12 34 56")).toBe("+32470123456");
  });

  it("bewaart lege/onparseerbare invoer netjes", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("nvt")).toBe("nvt"); // niets weggooien
  });
});

describe("formatPhone", () => {
  it("toont internationaal gegroepeerd", () => {
    expect(formatPhone("+31654254216")).toBe("+31 6 54254216");
    expect(formatPhone("06-54254216")).toBe("+31 6 54254216");
    expect(formatPhone("020-1234567")).toBe("+31 20 123 4567");
    expect(formatPhone("+49 30 12345678")).toBe("+49 30 12345678");
  });
  it("fallback op ruwe waarde", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("nvt")).toBe("nvt");
  });
});

describe("isValidPhone", () => {
  it("herkent geldige en ongeldige nummers", () => {
    expect(isValidPhone("06-54254216")).toBe(true);
    expect(isValidPhone("+49 30 12345678")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
