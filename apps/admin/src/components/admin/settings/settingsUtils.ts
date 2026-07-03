// Vertaal cron-expressie naar mensentaal — alleen veelgebruikte patronen
export function describeSchedule(schedule: string): string {
  const map: Record<string, string> = {
    "*/30 * * * *": "Elke 30 min",
    "*/15 * * * *": "Elke 15 min",
    "*/5 * * * *": "Elke 5 min",
    "0 * * * *": "Ieder uur",
    "0 0 * * *": "Dagelijks middernacht",
    "0 2 * * *": "Dagelijks 02:00",
    "0 3 * * *": "Dagelijks 03:00",
    "0 0 * * 0": "Wekelijks (zo)",
    "0 0 1 * *": "Maandelijks (1e)",
  };
  return map[schedule] || "Custom";
}
