import { describe, expect, it } from "vitest";
import {
  bucketOf,
  checklistProgress,
  compareTasks,
  nextOccurrence,
  normalizePriority,
  parseChecklist,
} from "./tasks";

// Tweeling van public.lead_task_next_due — de SQL-kant is getest met dezelfde
// randgevallen (BEGIN...ROLLBACK, migratie 20260714130000).
describe("nextOccurrence", () => {
  const today = "2026-07-14";

  it("daily: basis vandaag -> morgen", () => {
    expect(nextOccurrence("2026-07-14", "daily", today)).toBe("2026-07-15");
  });
  it("daily: verlopen basis haalt in tot vandaag", () => {
    expect(nextOccurrence("2026-07-01", "daily", today)).toBe("2026-07-14");
  });
  it("daily: basis in de toekomst -> basis + 1", () => {
    expect(nextOccurrence("2026-07-20", "daily", today)).toBe("2026-07-21");
  });
  it("weekly: basis vandaag -> +7", () => {
    expect(nextOccurrence("2026-07-14", "weekly", today)).toBe("2026-07-21");
  });
  it("weekly: catch-up naar de eerstvolgende occurrence >= vandaag", () => {
    expect(nextOccurrence("2026-07-08", "weekly", today)).toBe("2026-07-15");
    expect(nextOccurrence("2026-07-07", "weekly", today)).toBe("2026-07-14");
    expect(nextOccurrence("2026-05-01", "weekly", today)).toBe("2026-07-17");
  });
  it("monthly: maandeinde clampt (31 jan -> 28 feb)", () => {
    expect(nextOccurrence("2026-01-31", "monthly", "2026-02-05")).toBe("2026-02-28");
  });
  it("monthly: catch-up vanaf de originele basis zonder drift (31 jan -> 31 juli)", () => {
    expect(nextOccurrence("2026-01-31", "monthly", today)).toBe("2026-07-31");
  });
  it("monthly: jaargrens en schrikkeljaar", () => {
    expect(nextOccurrence("2026-12-15", "monthly", "2027-01-01")).toBe("2027-01-15");
    expect(nextOccurrence("2028-01-31", "monthly", "2028-02-01")).toBe("2028-02-29");
  });
  it("zonder due date geldt vandaag als basis", () => {
    expect(nextOccurrence(null, "weekly", today)).toBe("2026-07-21");
    expect(nextOccurrence(null, "daily", today)).toBe("2026-07-15");
  });
});

describe("bucketOf", () => {
  const today = "2026-07-14";
  const weekEnd = "2026-07-21";
  it("verdeelt op de randen correct", () => {
    expect(bucketOf(null, today, weekEnd)).toBe("none");
    expect(bucketOf("2026-07-13", today, weekEnd)).toBe("overdue");
    expect(bucketOf("2026-07-14", today, weekEnd)).toBe("today");
    expect(bucketOf("2026-07-21", today, weekEnd)).toBe("week");
    expect(bucketOf("2026-07-22", today, weekEnd)).toBe("later");
  });
  it("negeert een tijdsdeel achter de datum", () => {
    expect(bucketOf("2026-07-14T09:00:00", today, weekEnd)).toBe("today");
  });
});

describe("compareTasks", () => {
  const t = (priority: string | null, due: string | null, created: string) => ({
    priority,
    due_date: due,
    created_at: created,
  });
  it("sorteert prioriteit boven datum", () => {
    const list = [t("low", "2026-07-14", "1"), t("high", null, "2"), t("medium", "2026-07-01", "3")];
    expect([...list].sort(compareTasks).map((x) => x.priority)).toEqual(["high", "medium", "low"]);
  });
  it("binnen gelijke prioriteit: vroegste datum eerst, zonder datum laatst", () => {
    const list = [t("medium", null, "1"), t("medium", "2026-08-01", "2"), t("medium", "2026-07-14", "3")];
    expect([...list].sort(compareTasks).map((x) => x.due_date)).toEqual(["2026-07-14", "2026-08-01", null]);
  });
  it("onbekende prioriteit telt als normaal", () => {
    expect(normalizePriority("foo")).toBe("medium");
    expect(normalizePriority(null)).toBe("medium");
  });
});

describe("parseChecklist", () => {
  it("parseert geldige items en telt voortgang", () => {
    const items = parseChecklist([
      { id: "a", text: "stap 1", done: true },
      { id: "b", text: "stap 2", done: false },
    ]);
    expect(items).toHaveLength(2);
    expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
  });
  it("is defensief tegen kapotte json", () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist("geen array")).toEqual([]);
    expect(parseChecklist({})).toEqual([]);
    expect(parseChecklist([{ id: 1, text: "x" }, null, "y", { id: "ok", text: "z", done: "ja" }])).toEqual([
      { id: "ok", text: "z", done: false },
    ]);
  });
});
