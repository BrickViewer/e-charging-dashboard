// Gedeelde hash/token-helpers voor de edge functions. Bewust alleen Web-standaard
// crypto/TextEncoder (geen Deno-globals), zodat de vitest known-vector test deze
// module direct kan importeren (zelfde patroon als _shared/settlement-math.ts).
// Vervangt ~8 byte-identieke inline-kopieën; een known-vector test bewaakt drift.

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
