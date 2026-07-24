// Huisnummer splitsen in nummer (evt. verlengd bereik als "10-14") + toevoeging ("D", "bis").
// Opslag blijft één vrij-tekst `house_number`-veld; deze helpers zijn puur voor de UI-splitsing.
// De AddressValue.houseNumber blijft de gecombineerde string (bron van waarheid).

export type HouseParts = { number: string; addition: string };

// "3D" → {number:"3", addition:"D"}; "10-14" → {"10-14",""}; "10 - 14 A" → {"10-14","A"};
// "" → {"",""}; zonder leidend cijfer (bv. "bis") → alles als addition.
export function splitHouse(raw: string | null | undefined): HouseParts {
  const s = (raw ?? "").trim();
  if (!s) return { number: "", addition: "" };
  const m = s.match(/^\s*(\d+(?:\s*[-/]\s*\d+)?)\s*(.*)$/);
  if (!m) return { number: "", addition: s };
  const number = m[1].replace(/\s*([-/])\s*/g, "$1").trim(); // "10 - 14" → "10-14"
  return { number, addition: (m[2] ?? "").trim() };
}

// Voegt nummer + toevoeging weer samen tot één `house_number`-string.
export function combineHouse(number: string, addition: string): string {
  return [number.trim(), addition.trim()].filter(Boolean).join(" ");
}

// ── DE canonieke adressplitser ────────────────────────────────────────────────────────────
// Splitst één adresregel in straat + huisnummer: "Alfred Smithlaan 37" → ["Alfred Smithlaan","37"].
// Nodig omdat clients/organizations ÉÉN gecombineerde straatkolom hebben terwijl
// persons/companies/leads/project_locations straat en huisnummer los opslaan — en die laatste
// voeden de WeFact-debiteur en de e-portal-handoff.
//
// Dit was ooit vijf keer apart geschreven (drie verschillende gedragingen); dit is nu de enige
// definitie. Twee spiegels die identiek MOETEN blijven — zie address.parity.test.ts:
//   • supabase/functions/_shared/installationHandoff.ts  (Deno kan niet uit apps/admin importeren)
//   • app_private.split_dutch_address                    (SQL, voor migraties/triggers)
//
// Randgeval: "Kerkstraat 1 bis" splitst NIET (het achtervoegsel is geen huisnummerletter) —
// dan komt alles als straat terug en blijft het huisnummer leeg. Bewust: liever niets dan een
// half adres wegschrijven.
const HOUSE_NUMBER_RE = /\s*(\d+\s*[A-Za-z]?(?:[-/]\d+\s*[A-Za-z]?)?)\s*$/;

export function splitStreetAndHouse(addr: string | null | undefined): [string, string] {
  const s = (addr ?? "").trim();
  if (!s) return ["", ""];
  const m = s.match(HOUSE_NUMBER_RE);
  if (!m || m.index === undefined) return [s, ""];
  return [s.slice(0, m.index).trim(), m[1].replace(/\s+/g, "")];
}

// Voegt straat + huisnummer weer samen tot één adresregel. De tegenhanger van
// splitStreetAndHouse, voor de kolommen die één gecombineerd veld dragen
// (clients.billing_address_street, organizations.address_street) en voor externe systemen
// die één Address-regel willen (WeFact, e-portal).
export function joinStreetAndHouse(
  street: string | null | undefined,
  houseNumber: string | null | undefined,
): string {
  return [street, houseNumber].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}
