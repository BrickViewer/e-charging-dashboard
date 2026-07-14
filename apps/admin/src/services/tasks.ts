// Pure takenlogica: prioriteiten, herhaling, datum-buckets en checklist-helpers.
// nextOccurrence is de TS-tweeling van public.lead_task_next_due (migratie
// 20260714130000_tasks_full_manager.sql) — wijzigingen daar ook hier doorvoeren.
// Datums zijn overal YYYY-MM-DD-strings (conventie van de app; due_date is een date-kolom).

export type TaskPriority = "high" | "medium" | "low";
export type TaskRecurrence = "daily" | "weekly" | "monthly";
export type TaskBucket = "overdue" | "today" | "week" | "later" | "none";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "Hoog",
  medium: "Normaal",
  low: "Laag",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export const PRIORITY_CHIP_CLASSES: Record<TaskPriority, string> = {
  high: "bg-red-500/15 text-red-600 dark:text-red-400",
  medium: "bg-muted text-muted-foreground",
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  daily: "Dagelijks",
  weekly: "Wekelijks",
  monthly: "Maandelijks",
};

export function normalizePriority(value: string | null | undefined): TaskPriority {
  return value === "high" || value === "low" ? value : "medium";
}

// ── datum-helpers (YYYY-MM-DD) ────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function utcMs(s: string): number {
  const { y, m, d } = parseYmd(s);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / 86400000);
}

function addDays(s: string, n: number): string {
  return fromUtcMs(utcMs(s) + n * 86400000);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Maanden optellen met maandeinde-clamping (31 jan + 1 mnd = 28/29 feb), altijd
// vanaf de ORIGINELE basis zodat 31 -> 28 -> 31 blijft (geen drift) — zoals
// Postgres' date + interval 'n month'.
function addMonthsClamped(s: string, k: number): string {
  const { y, m, d } = parseYmd(s);
  const total = m - 1 + k;
  const y2 = y + Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return `${y2}-${pad(m2)}-${pad(Math.min(d, daysInMonth(y2, m2)))}`;
}

// Volgende vervaldatum na afvinken: kleinste k>=1 waarvoor basis + k*interval >= vandaag.
export function nextOccurrence(dueDate: string | null, recurrence: TaskRecurrence, todayStr: string): string {
  const base = (dueDate ?? todayStr).slice(0, 10);
  const diff = daysBetween(base, todayStr);
  if (recurrence === "daily") return addDays(base, Math.max(1, diff));
  if (recurrence === "weekly") return addDays(base, 7 * Math.max(1, Math.ceil(diff / 7)));
  let result = base;
  for (let k = 1; k <= 1200; k++) {
    result = addMonthsClamped(base, k);
    if (result >= todayStr) break;
  }
  return result;
}

// ── weergave-helpers ─────────────────────────────────────────────────────────
export function bucketOf(due: string | null, todayStr: string, weekEndStr: string): TaskBucket {
  if (!due) return "none";
  const dd = due.slice(0, 10);
  if (dd < todayStr) return "overdue";
  if (dd === todayStr) return "today";
  if (dd <= weekEndStr) return "week";
  return "later";
}

export interface TaskSortable {
  priority: string | null;
  due_date: string | null;
  created_at: string;
}

// Sortering binnen een bucket: prioriteit -> vervaldatum (zonder datum laatst) -> aanmaakvolgorde.
export function compareTasks(a: TaskSortable, b: TaskSortable): number {
  const prio = PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
  if (prio !== 0) return prio;
  const da = a.due_date?.slice(0, 10) ?? "9999-12-31";
  const db = b.due_date?.slice(0, 10) ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

// ── checklist (jsonb-kolom `checklist`, vorm [{id, text, done}]) ─────────────
// Type-alias (geen interface) zodat ChecklistItem[] direct aan de Json-kolom toewijsbaar is.
export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChecklistItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    if (typeof it.id !== "string" || typeof it.text !== "string") continue;
    items.push({ id: it.id, text: it.text, done: it.done === true });
  }
  return items;
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
