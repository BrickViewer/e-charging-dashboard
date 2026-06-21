import { describe, it, expect } from "vitest";
// De Deno edge-module (~8 functies gebruiken deze). Alleen Web-standaard crypto,
// geen Deno-globals, dus importeerbaar in vitest (Node Web Crypto).
import {
  bytesToHex,
  sha256Hex,
  generateToken,
} from "../../../../supabase/functions/_shared/hash";

// ============================================================================
// Known-vector test voor de gedeelde edge hash/token-helpers. Pint de SHA-256-
// output vast zodat de ~8 token-hash-call-sites (invite/quote-sign/accept/...)
// niet stil kunnen divergeren na de dedup naar _shared/hash.ts.
// ============================================================================

describe("sha256Hex known-vectors (NIST)", () => {
  it("sha256Hex('') === e3b0c442…b855 (lege string)", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("sha256Hex('abc') === ba7816bf…15ad", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("bytesToHex", () => {
  it("pad naar 2 nibbles + lowercase, in volgorde", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });
  it("lege bytes → lege string", () => {
    expect(bytesToHex(new Uint8Array([]))).toBe("");
  });
});

describe("generateToken", () => {
  it("64 lowercase hex-chars (32 random bytes)", () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it("twee tokens verschillen", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
