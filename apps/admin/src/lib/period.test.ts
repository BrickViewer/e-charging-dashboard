import { describe, it, expect } from "vitest";
import {
  getCurrentMonth,
  prevMonth,
  shiftMonth,
  monthShortLabel,
  monthFullLabel,
  MONTH_LABELS_SHORT,
  MONTH_LABELS_LONG,
} from "./period";

describe("period helpers — future-proof rollover", () => {
  it("prevMonth rolt over de jaargrens (jan → dec vorig jaar)", () => {
    expect(prevMonth({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 });
    expect(prevMonth({ year: 2030, month: 6 })).toEqual({ year: 2030, month: 5 });
  });

  it("shiftMonth is jaargrens-veilig in beide richtingen", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 6 }, 12)).toEqual({ year: 2027, month: 6 });
    expect(shiftMonth({ year: 2026, month: 3 }, -6)).toEqual({ year: 2025, month: 9 });
  });

  it("labels werken voor elk toekomstig jaar", () => {
    expect(monthShortLabel(2027, 1)).toBe("jan '27");
    expect(monthShortLabel(2030, 12)).toBe("dec '30");
    expect(monthFullLabel(2028, 5)).toBe("mei 2028");
  });

  it("maandnaam-arrays hebben 12 entries", () => {
    expect(MONTH_LABELS_SHORT).toHaveLength(12);
    expect(MONTH_LABELS_LONG).toHaveLength(12);
  });

  it("getCurrentMonth geeft een geldige maand (1-12)", () => {
    const { year, month } = getCurrentMonth();
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(year).toBeGreaterThanOrEqual(2024);
  });
});
