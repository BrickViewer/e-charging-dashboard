// Laadt de ingestelde tekstslots van een mail en vult de placeholders in.
//
// TERUGVALGARANTIE: dit levert nooit een halve mail op. Ontbreekt de rij, staat hij uit, of is een
// slot leeg gelaten, dan komt de standaardtekst uit het register (= letterlijk de tekst die
// voorheen in de code stond). Zolang email_templates leeg is verandert er dus niets aan wat er
// verstuurd wordt.
//
// Het HTML-ONTWERP blijft in de renderfuncties per mail. Hier gaat alleen tekst doorheen.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { TEMPLATES_BY_KEY } from "./emailTemplates.ts";

/** Ingevulde slots: slotnaam → definitieve tekst (placeholders al vervangen). */
export type RenderedSlots = Record<string, string>;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Vervangt {{naam}} door de waarde. `escape` uit zetten voor de tekstversie van een mail;
 *  aan laten voor HTML, anders kan een bedrijfsnaam met een &lt; de opmaak breken. */
export function fillPlaceholders(
  text: string,
  vars: Record<string, string | number | null | undefined>,
  escape = true,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (hele, naam: string) => {
    const v = vars[naam];
    if (v === undefined || v === null) return hele; // onbekende placeholder laten staan i.p.v. stil leegmaken
    const s = String(v);
    return escape ? escapeHtml(s) : s;
  });
}

/**
 * Haalt de slots voor `key` op en vult ze in. Geeft ALTIJD een compleet slotobject terug:
 * elk slot uit het register zit erin, met de ingestelde tekst of anders de standaard.
 *
 * Faalt de databasekant (geen rij, tabel ontbreekt, netwerkfout), dan gaan we door op de
 * standaardteksten — een mail mag nooit blijven hangen op een instellingenprobleem.
 */
export async function renderSlots(
  sb: any,
  key: string,
  vars: Record<string, string | number | null | undefined>,
  opts: { escape?: boolean } = {},
): Promise<RenderedSlots> {
  const def = TEMPLATES_BY_KEY[key];
  if (!def) return {};
  const escape = opts.escape !== false;

  let overrides: Record<string, string> = {};
  try {
    const { data } = await sb.from("email_templates").select("slots, enabled").eq("key", key).maybeSingle();
    if (data?.enabled && data.slots && typeof data.slots === "object") {
      overrides = data.slots as Record<string, string>;
    }
  } catch (e) {
    console.error(`emailRender: sjabloon ${key} niet geladen, standaardtekst gebruikt:`, e instanceof Error ? e.message : e);
  }

  const out: RenderedSlots = {};
  for (const slot of def.slots) {
    const raw = typeof overrides[slot.name] === "string" && overrides[slot.name].trim()
      ? overrides[slot.name]
      : slot.default;
    out[slot.name] = fillPlaceholders(raw, vars, escape);
  }
  return out;
}

/** Zelfde slots, maar zonder HTML-escaping — voor de platte-tekstversie van een mail. */
export function toPlain(slots: RenderedSlots): RenderedSlots {
  const out: RenderedSlots = {};
  for (const [k, v] of Object.entries(slots)) {
    out[k] = v
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  return out;
}
