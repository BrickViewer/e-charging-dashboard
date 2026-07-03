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
