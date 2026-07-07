import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown, Trophy, XCircle, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import {
  useLeadsList, useBulkPatchLeads, type LeadListFilters, type LeadSort, type LeadStage, type LeadLostReason,
} from "@/hooks/useLeads";
import { SCOPE_SHORT, SCOPE_BADGE_CLASS, type QuoteScope } from "@/lib/quoteScope";
import { MarkLostDialog } from "@/components/sales/MarkLostDialog";

const euro0 = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const dateShort = (s: string | null) => (s ? new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—");

const LIFECYCLE_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-muted text-muted-foreground" },
  won_active: { label: "Gewonnen", cls: "bg-emerald-500/15 text-emerald-700" },
  invoiced: { label: "Gefactureerd", cls: "bg-sky-500/15 text-sky-700" },
  lost: { label: "Verloren", cls: "bg-red-500/15 text-red-700" },
};

const SEGMENTS: { key: NonNullable<LeadListFilters["segment"]>; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "won_active", label: "Gewonnen" },
  { key: "invoiced", label: "Gefactureerd" },
  { key: "lost", label: "Verloren" },
  { key: "all", label: "Alle" },
];

const SORTABLE: { field: string; label: string; className?: string }[] = [
  { field: "company_name", label: "Bedrijf / contact" },
  { field: "stage_id", label: "Fase" },
  { field: "owner_user_id", label: "Eigenaar" },
  { field: "scope", label: "Scope" },
  { field: "estimated_value", label: "Waarde", className: "text-right" },
  { field: "estimated_charge_points", label: "Palen", className: "text-right" },
  { field: "expected_close_date", label: "Sluit" },
  { field: "lifecycle", label: "Status" },
  { field: "updated_at", label: "Leeftijd" },
];

export function LeadsListView({
  filters,
  sort,
  onSortChange,
  page,
  onPageChange,
  pageSize = 25,
  segment,
  onSegmentChange,
  stages,
  reasons,
  ownerName,
  ownerOptions,
  onRowClick,
}: {
  filters: LeadListFilters;
  sort: LeadSort;
  onSortChange: (s: LeadSort) => void;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
  segment: NonNullable<LeadListFilters["segment"]>;
  onSegmentChange: (s: NonNullable<LeadListFilters["segment"]>) => void;
  stages: LeadStage[];
  reasons: LeadLostReason[];
  ownerName: (id: string | null) => string | null;
  ownerOptions: { user_id: string; full_name: string | null }[];
  onRowClick: (leadId: string) => void;
}) {
  const listQ = useLeadsList({ filters: { ...filters, segment }, sort, page, pageSize });
  const bulk = useBulkPatchLeads();
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lostOpen, setLostOpen] = useState(false);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const reasonById = useMemo(() => new Map(reasons.map((r) => [r.id, r.label])), [reasons]);
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);

  const allChecked = rows.length > 0 && rows.every((r) => r.id && selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id!).filter(Boolean)));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  const selectedIds = [...selected];

  const setSort = (field: string) => {
    if (sort.field === field) onSortChange({ field, dir: sort.dir === "asc" ? "desc" : "asc" });
    else onSortChange({ field, dir: field === "company_name" ? "asc" : "desc" });
  };

  const bulkReassign = async (owner: string) => {
    try {
      await bulk.mutateAsync({ ids: selectedIds, patch: { owner_user_id: owner === "none" ? null : owner } });
      toast.success(`${selectedIds.length} leads bijgewerkt`); clearSel();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const bulkWin = async () => {
    if (!wonStage) { toast.error("Geen 'Gewonnen'-fase ingesteld."); return; }
    try {
      await bulk.mutateAsync({ ids: selectedIds, patch: { stage_id: wonStage.id } });
      toast.success(`${selectedIds.length} leads op Gewonnen gezet`); clearSel();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  return (
    <div className="space-y-3">
      {/* Segment-tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => { onSegmentChange(s.key); onPageChange(0); clearSel(); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              segment === s.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">{listQ.isLoading ? "" : `${total} lead${total === 1 ? "" : "s"}`}</span>
      </div>

      {/* Bulk-actiebalk */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} geselecteerd</span>
          <Select onValueChange={bulkReassign}>
            <SelectTrigger className="h-8 w-[190px]"><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" />Eigenaar wijzigen</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Geen eigenaar</SelectItem>
              {ownerOptions.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={bulkWin} disabled={bulk.isPending}><Trophy className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />Markeer gewonnen</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setLostOpen(true)} disabled={bulk.isPending}><XCircle className="mr-1.5 h-3.5 w-3.5 text-red-600" />Markeer verloren</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={clearSel}>Wissen</Button>
        </div>
      )}

      {/* Tabel */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2"><Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Alles selecteren" /></th>
              {SORTABLE.map((c) => (
                <th key={c.field} className={`px-3 py-2 ${c.className ?? ""}`}>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort(c.field)}>
                    {c.label}
                    {sort.field === c.field && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {listQ.isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i}><td className="px-3 py-3" colSpan={SORTABLE.length + 1}><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={SORTABLE.length + 1} className="px-3 py-10 text-center text-sm text-muted-foreground">Geen leads voor deze filters.</td></tr>
            ) : (
              rows.map((r) => {
                const st = r.stage_id ? stageById.get(r.stage_id) : null;
                const lc = LIFECYCLE_BADGE[r.lifecycle ?? "open"] ?? LIFECYCLE_BADGE.open;
                const scope = r.scope as QuoteScope | null;
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/30"
                    role="button"
                    tabIndex={0}
                    onClick={() => r.id && onRowClick(r.id)}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && r.id) { e.preventDefault(); onRowClick(r.id); } }}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!!r.id && selected.has(r.id)} onCheckedChange={() => r.id && toggleOne(r.id)} aria-label="Selecteer" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{r.company_name || "Naamloos"}</div>
                      {r.contact_name && r.contact_name !== r.company_name && <div className="text-xs text-muted-foreground">{r.contact_name}</div>}
                      {r.lifecycle === "lost" && r.lost_reason_id && <div className="text-[11px] text-red-600/80">{reasonById.get(r.lost_reason_id) ?? "Verloren"}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {st ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} />{st.name}</span> : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{ownerName(r.owner_user_id) ?? "—"}</td>
                    <td className="px-3 py-2">{scope ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SCOPE_BADGE_CLASS[scope]}`}>{SCOPE_SHORT[scope]}</span> : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro0(r.estimated_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.estimated_charge_points ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{dateShort(r.expected_close_date)}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${lc.cls}`}>{lc.label}</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.updated_at ? formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: nl }) : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Pagina {page + 1} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8" disabled={page <= 0} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-4 w-4" /> Vorige</Button>
            <Button size="sm" variant="outline" className="h-8" disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)}>Volgende <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <MarkLostDialog open={lostOpen} onOpenChange={setLostOpen} leadIds={selectedIds} lostStageId={lostStage?.id ?? null} onDone={clearSel} />
    </div>
  );
}
