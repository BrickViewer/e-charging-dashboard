// Gedeelde formatters voor de configurator (nl-NL).

export function euro(value: number, digits = 0): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function number(value: number, digits = 0): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("nl-NL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function parseNumber(value: string, fallback = 0): number {
  const normalized = value.replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Rond jaren af op halve jaren — een terugverdientijd in "3,5 jaar" leest als
// vertrouwde expertise; twee decimalen lezen als een onzekere schatting.
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

// Format een (al op halven afgeronde) jaarwaarde, bv. "3,5 jaar" / "4 jaar".
export function jaren(value: number): string {
  const v = roundToHalf(value);
  return `${v.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} jaar`;
}
