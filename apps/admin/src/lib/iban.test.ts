import { describe, expect, it } from "vitest";

import { hasValidIbanCountryLength, isValidIban, normalizeIban } from "./iban";

describe("IBAN validation", () => {
  it("accepts valid SEPA-style IBANs with country-specific lengths", () => {
    expect(isValidIban("NL91 ABNA 0417 1643 00")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
  });

  it("rejects the short invalid NL IBAN before submit", () => {
    expect(normalizeIban("NL00RABO012345678")).toBe("NL00RABO012345678");
    expect(hasValidIbanCountryLength("NL00RABO012345678")).toBe(false);
    expect(isValidIban("NL00RABO012345678")).toBe(false);
  });

  it("rejects country-length-correct IBANs with invalid check digits", () => {
    expect(hasValidIbanCountryLength("NL00RABO0123456789")).toBe(true);
    expect(isValidIban("NL00RABO0123456789")).toBe(false);
  });
});
