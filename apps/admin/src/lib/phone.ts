import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// Canonieke telefoon-helper (zoals lib/iban.ts).
// Opslag = E.164 (+31612345678); weergave = internationaal gegroepeerd (+31 6 12345678).
// Nooit hard blokkeren: een onparseerbaar nummer wordt getrimd bewaard i.p.v. geweigerd,
// zodat elk telefoonnummer mogelijk blijft.

// Normaliseer ruwe invoer naar E.164. Leeg → null. Onparseerbaar → getrimde ruwe waarde.
export function normalizePhone(raw: string | null | undefined, defaultCountry: CountryCode = "NL"): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  return parsed?.number ?? trimmed;
}

// Toon een nummer internationaal gegroepeerd. Fallback = de ruwe waarde.
export function formatPhone(value: string | null | undefined, defaultCountry: CountryCode = "NL"): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  return parsed ? parsed.formatInternational() : trimmed;
}

// tel:-/WhatsApp-link: het E.164-nummer (of best-effort). Leeg → "".
export function phoneHref(value: string | null | undefined, defaultCountry: CountryCode = "NL"): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  return parsed?.number ?? trimmed.replace(/[^\d+]/g, "");
}

// Zachte geldigheidshint (nooit hard blokkeren).
export function isValidPhone(value: string | null | undefined, defaultCountry: CountryCode = "NL"): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  return !!parsed && parsed.isValid();
}
