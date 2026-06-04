// Centrale periode-/tijd-helpers — één bron van waarheid voor maandlabels en de
// "huidige maand", zodat admin, portal en factuur niet uiteenlopen.
//
// LET OP: de toewijzing van een laadsessie aan een maand gebeurt server-side op
// Europe/Amsterdam-tijd via de SQL-functie `amsterdam_month_bounds` (zie
// services/sessions.ts → getAmsterdamMonthBounds). Deze module is voor weergave
// (labels) en de bepaling van de huidige maand — ook in NL-tijd, zodat de
// dashboards rond middernacht/jaargrens niet een maand mis zitten.

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export const MONTH_LABELS_SHORT = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
] as const;

export const MONTH_LABELS_LONG = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
] as const;

/** Huidige maand in Europe/Amsterdam (DST-correct) — niet in UTC. */
export function getCurrentMonth(): YearMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

/** Vorige maand (rolt correct over de jaargrens: jan → dec van het vorige jaar). */
export function prevMonth({ year, month }: YearMonth): YearMonth {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** Verschuif een maand met `delta` maanden (negatief = terug); jaargrens-veilig. */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** "jan '26" — korte maandnaam + 2-cijferig jaar (compacte grafiek-as). */
export function monthShortLabel(year: number, month: number): string {
  return `${MONTH_LABELS_SHORT[month - 1]} '${String(year).slice(-2)}`;
}

/** "mei 2026" — korte maandnaam + volledig jaar. */
export function monthFullLabel(year: number, month: number): string {
  return `${MONTH_LABELS_SHORT[month - 1]} ${year}`;
}
