import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { LeadListFilters, LeadSort, LeadLifecycle } from "@/hooks/useLeads";

// Volledige lead-weergavestatus, volledig in de URL (deelbaar/bookmarkbaar). Board en
// lijst lezen dezelfde status; alleen segment + datum + paginatie zijn lijst-specifiek.
export type LeadView = "board" | "list";
export type LeadDateField = "created_at" | "expected_close_date" | "won_at" | "lost_at";

export type LeadViewState = {
  view: LeadView;
  segment: NonNullable<LeadListFilters["segment"]>;
  search: string;
  owner: string; // "all" | "me" | "none" | <uuid>
  sources: string[];
  tagIds: string[];
  priorities: string[];
  scopes: string[];
  valueMin: number | null;
  valueMax: number | null;
  cpMin: number | null;
  cpMax: number | null;
  dateField: LeadDateField;
  dateFrom: string | null;
  dateTo: string | null;
  sort: LeadSort;
  page: number;
};

export const DEFAULT_LEAD_VIEW: LeadViewState = {
  view: "board",
  segment: "open",
  search: "",
  owner: "all",
  sources: [],
  tagIds: [],
  priorities: [],
  scopes: [],
  valueMin: null,
  valueMax: null,
  cpMin: null,
  cpMax: null,
  dateField: "created_at",
  dateFrom: null,
  dateTo: null,
  sort: { field: "updated_at", dir: "desc" },
  page: 0,
};

const listOf = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const numOf = (v: string | null) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function decode(sp: URLSearchParams): LeadViewState {
  const sortRaw = sp.get("sort");
  const [sf, sd] = sortRaw ? sortRaw.split(":") : [];
  return {
    view: sp.get("view") === "list" ? "list" : "board",
    segment: ((["open", "won_active", "invoiced", "lost", "all"] as const).includes(sp.get("seg") as never)
      ? sp.get("seg") : "open") as NonNullable<LeadListFilters["segment"]>,
    search: sp.get("q") ?? "",
    owner: sp.get("owner") ?? "all",
    sources: listOf(sp.get("src")),
    tagIds: listOf(sp.get("tags")),
    priorities: listOf(sp.get("prio")),
    scopes: listOf(sp.get("scope")),
    valueMin: numOf(sp.get("vmin")),
    valueMax: numOf(sp.get("vmax")),
    cpMin: numOf(sp.get("cpmin")),
    cpMax: numOf(sp.get("cpmax")),
    dateField: (["created_at", "expected_close_date", "won_at", "lost_at"].includes(sp.get("df") as never)
      ? sp.get("df") : "created_at") as LeadDateField,
    dateFrom: sp.get("dfrom"),
    dateTo: sp.get("dto"),
    sort: sf ? { field: sf, dir: sd === "asc" ? "asc" : "desc" } : DEFAULT_LEAD_VIEW.sort,
    page: Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0),
  };
}

function encode(s: LeadViewState): URLSearchParams {
  const sp = new URLSearchParams();
  if (s.view !== "board") sp.set("view", s.view);
  if (s.segment !== "open") sp.set("seg", s.segment);
  if (s.search) sp.set("q", s.search);
  if (s.owner !== "all") sp.set("owner", s.owner);
  if (s.sources.length) sp.set("src", s.sources.join(","));
  if (s.tagIds.length) sp.set("tags", s.tagIds.join(","));
  if (s.priorities.length) sp.set("prio", s.priorities.join(","));
  if (s.scopes.length) sp.set("scope", s.scopes.join(","));
  if (s.valueMin != null) sp.set("vmin", String(s.valueMin));
  if (s.valueMax != null) sp.set("vmax", String(s.valueMax));
  if (s.cpMin != null) sp.set("cpmin", String(s.cpMin));
  if (s.cpMax != null) sp.set("cpmax", String(s.cpMax));
  // df los van de datums bewaren, anders springt de veldkeuze terug naar 'Aangemaakt'
  // zodra je het veld kiest vóór een datum invult.
  if (s.dateField !== "created_at") sp.set("df", s.dateField);
  if (s.dateFrom) sp.set("dfrom", s.dateFrom);
  if (s.dateTo) sp.set("dto", s.dateTo);
  if (s.sort.field !== DEFAULT_LEAD_VIEW.sort.field || s.sort.dir !== DEFAULT_LEAD_VIEW.sort.dir)
    sp.set("sort", `${s.sort.field}:${s.sort.dir}`);
  if (s.page > 0) sp.set("page", String(s.page));
  return sp;
}

// Filters die zowel board (client-side) als lijst (server-side) gebruiken.
export function toListFilters(s: LeadViewState): LeadListFilters {
  return {
    segment: s.segment,
    search: s.search,
    owner: s.owner,
    sources: s.sources,
    tagIds: s.tagIds,
    priorities: s.priorities,
    scopes: s.scopes,
    valueMin: s.valueMin,
    valueMax: s.valueMax,
    chargePointsMin: s.cpMin,
    chargePointsMax: s.cpMax,
    dateField: s.dateField,
    dateFrom: s.dateFrom,
    dateTo: s.dateTo,
  };
}

export function activeFilterCount(s: LeadViewState): number {
  let n = 0;
  if (s.search) n++;
  if (s.owner !== "all") n++;
  n += s.sources.length ? 1 : 0;
  n += s.tagIds.length ? 1 : 0;
  n += s.priorities.length ? 1 : 0;
  n += s.scopes.length ? 1 : 0;
  if (s.valueMin != null || s.valueMax != null) n++;
  if (s.cpMin != null || s.cpMax != null) n++;
  if (s.dateFrom || s.dateTo) n++;
  return n;
}

export function useLeadViewState() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => decode(sp), [sp]);

  // Patch de status; wijzigingen die de resultaatset veranderen resetten de paginatie.
  const patch = useCallback((p: Partial<LeadViewState>, opts?: { keepPage?: boolean }) => {
    setSp((prev) => {
      const cur = decode(prev);
      const next = { ...cur, ...p };
      if (!opts?.keepPage && !("page" in p)) next.page = 0;
      const encoded = encode(next);
      // Bewaar de ?lead= deeplink niet — die wordt los afgehandeld.
      return encoded;
    }, { replace: true });
  }, [setSp]);

  const reset = useCallback(() => {
    patch({
      search: "", owner: "all", sources: [], tagIds: [], priorities: [], scopes: [],
      valueMin: null, valueMax: null, cpMin: null, cpMax: null,
      dateField: "created_at", dateFrom: null, dateTo: null,
    });
  }, [patch]);

  const applySaved = useCallback((partial: Partial<LeadViewState>) => {
    setSp(encode({ ...DEFAULT_LEAD_VIEW, ...partial }), { replace: false });
  }, [setSp]);

  return { state, patch, reset, applySaved };
}
