import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X, Tag as TagIcon } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { tagTextColor } from "@/hooks/useLeadTags";
import { SCOPES, SCOPE_LABEL, type QuoteScope } from "@/lib/quoteScope";
import { activeFilterCount, type LeadViewState, type LeadDateField } from "@/hooks/useLeadViewState";

const PRIORITIES = [{ v: "high", l: "Hoog" }, { v: "medium", l: "Middel" }, { v: "low", l: "Laag" }];
const DATE_FIELDS: { v: LeadDateField; l: string }[] = [
  { v: "created_at", l: "Aangemaakt" },
  { v: "won_at", l: "Gewonnen" },
  { v: "lost_at", l: "Verloren" },
];

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function MultiPopover({ label, icon, options, selected, onChange }: {
  label: string;
  icon?: React.ReactNode;
  options: { value: string; label: string; color?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          {icon}{label}{selected.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{selected.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Geen opties</p>}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onChange(toggle(selected, o.value))} />
              {o.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LeadFilterBar({
  state, patch, reset, mode, profiles, sources, tags,
}: {
  state: LeadViewState;
  patch: (p: Partial<LeadViewState>) => void;
  reset: () => void;
  mode: "board" | "list";
  profiles: { user_id: string; full_name: string | null }[];
  sources: string[];
  tags: { id: string; name: string; color: string }[];
}) {
  const [searchLocal, setSearchLocal] = useState(state.search);
  const debounced = useDebouncedValue(searchLocal, 250);
  useEffect(() => { if (debounced !== state.search) patch({ search: debounced }); /* eslint-disable-next-line */ }, [debounced]);
  useEffect(() => { setSearchLocal(state.search); /* extern gewijzigd (opgeslagen weergave) */ }, [state.search]);

  const nFilters = activeFilterCount(state);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op naam, contact, plaats…" value={searchLocal} onChange={(e) => setSearchLocal(e.target.value)} />
        </div>

        <Select value={state.owner} onValueChange={(v) => patch({ owner: v })}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle eigenaren</SelectItem>
            <SelectItem value="me">Mijn leads</SelectItem>
            <SelectItem value="none">Geen eigenaar</SelectItem>
            {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
          </SelectContent>
        </Select>

        <MultiPopover label="Bron" options={sources.map((s) => ({ value: s, label: s }))} selected={state.sources} onChange={(v) => patch({ sources: v })} />
        <MultiPopover label="Tags" icon={<TagIcon className="h-3.5 w-3.5" />} options={tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))} selected={state.tagIds} onChange={(v) => patch({ tagIds: v })} />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />Meer filters
              {(state.priorities.length || state.scopes.length || state.valueMin != null || state.valueMax != null || state.cpMin != null || state.cpMax != null || state.dateFrom || state.dateTo) ? <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">•</Badge> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <div>
              <Label className="text-xs">Prioriteit</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <label key={p.v} className="flex items-center gap-1.5 text-sm"><Checkbox checked={state.priorities.includes(p.v)} onCheckedChange={() => patch({ priorities: toggle(state.priorities, p.v) })} />{p.l}</label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Scope</Label>
              <div className="mt-1.5 space-y-1.5">
                {SCOPES.map((s: QuoteScope) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm"><Checkbox checked={state.scopes.includes(s)} onCheckedChange={() => patch({ scopes: toggle(state.scopes, s) })} />{SCOPE_LABEL[s]}</label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Waarde min (€)</Label>
                <Input type="number" className="mt-1 h-8" value={state.valueMin ?? ""} onChange={(e) => patch({ valueMin: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Waarde max (€)</Label>
                <Input type="number" className="mt-1 h-8" value={state.valueMax ?? ""} onChange={(e) => patch({ valueMax: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Palen min</Label>
                <Input type="number" className="mt-1 h-8" value={state.cpMin ?? ""} onChange={(e) => patch({ cpMin: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Palen max</Label>
                <Input type="number" className="mt-1 h-8" value={state.cpMax ?? ""} onChange={(e) => patch({ cpMax: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </div>
            {mode === "list" && (
              <div>
                <Label className="text-xs">Datumbereik</Label>
                <Select value={state.dateField} onValueChange={(v) => patch({ dateField: v as LeadDateField })}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{DATE_FIELDS.map((d) => <SelectItem key={d.v} value={d.v}>{d.l}</SelectItem>)}</SelectContent>
                </Select>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <Input type="date" className="h-8" value={state.dateFrom ?? ""} onChange={(e) => patch({ dateFrom: e.target.value || null })} />
                  <Input type="date" className="h-8" value={state.dateTo ?? ""} onChange={(e) => patch({ dateTo: e.target.value || null })} />
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {nFilters > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={reset}><X className="mr-1 h-3.5 w-3.5" />Wis filters</Button>
        )}
      </div>

      {/* Actieve-filter-chips */}
      {nFilters > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {state.search && <Chip onClear={() => patch({ search: "" })}>Zoek: "{state.search}"</Chip>}
          {state.owner !== "all" && <Chip onClear={() => patch({ owner: "all" })}>Eigenaar: {state.owner === "me" ? "ik" : state.owner === "none" ? "geen" : (profiles.find((p) => p.user_id === state.owner)?.full_name ?? "…")}</Chip>}
          {state.sources.map((s) => <Chip key={s} onClear={() => patch({ sources: state.sources.filter((x) => x !== s) })}>Bron: {s}</Chip>)}
          {state.tagIds.map((t) => { const tag = tags.find((x) => x.id === t); return tag ? <span key={t} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: tag.color, color: tagTextColor(tag.color) }}>{tag.name}<button onClick={() => patch({ tagIds: state.tagIds.filter((x) => x !== t) })}><X className="h-3 w-3" /></button></span> : null; })}
          {state.priorities.map((p) => <Chip key={p} onClear={() => patch({ priorities: state.priorities.filter((x) => x !== p) })}>Prio: {PRIORITIES.find((x) => x.v === p)?.l ?? p}</Chip>)}
          {state.scopes.map((s) => <Chip key={s} onClear={() => patch({ scopes: state.scopes.filter((x) => x !== s) })}>{SCOPE_LABEL[s as QuoteScope] ?? s}</Chip>)}
          {(state.valueMin != null || state.valueMax != null) && <Chip onClear={() => patch({ valueMin: null, valueMax: null })}>Waarde {state.valueMin ?? "0"}–{state.valueMax ?? "∞"}</Chip>}
          {(state.cpMin != null || state.cpMax != null) && <Chip onClear={() => patch({ cpMin: null, cpMax: null })}>Palen {state.cpMin ?? "0"}–{state.cpMax ?? "∞"}</Chip>}
          {(state.dateFrom || state.dateTo) && <Chip onClear={() => patch({ dateFrom: null, dateTo: null })}>{DATE_FIELDS.find((d) => d.v === state.dateField)?.l}: {state.dateFrom ?? "…"} – {state.dateTo ?? "…"}</Chip>}
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
      <button onClick={onClear} className="hover:text-foreground"><X className="h-3 w-3" /></button>
    </span>
  );
}
