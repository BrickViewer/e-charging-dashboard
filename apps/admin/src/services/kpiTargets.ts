// Pure doelen-logica voor het directie-werkblad: metricdefinities + het
// afleiden van maand-/jaardoelen uit kpi_targets-rijen. Gescheiden van de
// hooks zodat de semantiek unit-testbaar is.

export type KpiMetric = "omzet" | "marge" | "kwh" | "nieuwe_klanten" | "gewonnen_leads";

export interface KpiTargetRow {
  metric: string;
  year: number;
  month: number | null; // null = jaardoel
  target_value: number;
}

export const KPI_METRICS: { key: KpiMetric; label: string; unit: "eur" | "kwh" | "count" }[] = [
  { key: "omzet", label: "E-Charging omzet", unit: "eur" },
  { key: "marge", label: "Marge", unit: "eur" },
  { key: "kwh", label: "Geladen kWh", unit: "kwh" },
  { key: "nieuwe_klanten", label: "Nieuwe klanten", unit: "count" },
  { key: "gewonnen_leads", label: "Gewonnen leads", unit: "count" },
];

export function formatKpiValue(value: number, unit: "eur" | "kwh" | "count"): string {
  if (unit === "eur") return `€ ${Math.round(value).toLocaleString("nl-NL")}`;
  if (unit === "kwh") return `${Math.round(value).toLocaleString("nl-NL")} kWh`;
  return Math.round(value).toLocaleString("nl-NL");
}

/** Maanddoel (month 1-12): expliciet maanddoel wint; anders jaardoel / 12. */
export function monthTarget(rows: KpiTargetRow[], metric: KpiMetric, month: number): number | null {
  const explicit = rows.find((r) => r.metric === metric && r.month === month);
  if (explicit) return explicit.target_value;
  const year = rows.find((r) => r.metric === metric && r.month === null);
  return year ? year.target_value / 12 : null;
}

/** Jaardoel: expliciet jaardoel wint; anders de som van de gezette maanddoelen. */
export function yearTarget(rows: KpiTargetRow[], metric: KpiMetric): number | null {
  const explicit = rows.find((r) => r.metric === metric && r.month === null);
  if (explicit) return explicit.target_value;
  const months = rows.filter((r) => r.metric === metric && r.month !== null);
  if (months.length === 0) return null;
  return months.reduce((sum, r) => sum + r.target_value, 0);
}

/** Cumulatieve realisatie t/m maand `uptoMonth` (1-12) uit een 12-lange reeks. */
export function cumulativeActual(monthActuals: number[], uptoMonth: number): number {
  return monthActuals.slice(0, Math.max(0, Math.min(12, uptoMonth))).reduce((s, v) => s + (v || 0), 0);
}

/** Voortgang 0-100 (afgekapt op 100 voor progressbars); null zonder doel. */
export function progressPct(actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.min(100, Math.round((actual / target) * 100));
}

/** Ongekapt percentage voor het label (mag >100 tonen "boven doel"); null zonder doel. */
export function rawPct(actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.round((actual / target) * 100);
}
