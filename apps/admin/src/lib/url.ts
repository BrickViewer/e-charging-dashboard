// URL-helpers voor door gebruikers ingevoerde links (bv. bestellinks in de
// catalogus). Die worden als klikbare <a href> gerenderd, dus alleen http(s)
// is toegestaan — nooit javascript:, data: of andere schema's.

/** Alleen echte webadressen zijn veilig om te renderen. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normaliseert invoer naar een veilige http(s)-URL, of null als dat niet lukt.
 * "tu.nl/artikel/123" wordt "https://tu.nl/artikel/123"; een expliciet ander
 * schema (javascript:, ftp:, data:) wordt geweigerd, niet "gerepareerd".
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Heeft de invoer al een schema? Dan moet het http(s) zijn.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return isSafeHttpUrl(raw) ? raw : null;
  }
  const candidate = `https://${raw}`;
  return isSafeHttpUrl(candidate) ? candidate : null;
}

/** Korte weergavenaam voor een link zonder label: de hostname zonder www. */
export function urlHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
