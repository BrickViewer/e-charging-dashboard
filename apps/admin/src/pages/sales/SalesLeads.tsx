import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, SlidersHorizontal, Target, Euro, Trophy, Percent, LayoutGrid, List, Bookmark, Star, Trash2 } from "lucide-react";
import { useOrganization, useAvgRevenuePerChargePoint } from "@/hooks/useAdminData";
import {
  useOpenLeads, useLeadStages, useTeamProfiles, useLeadStats, useLostReasons, useLeadFull, primaryQuote,
  type LeadWithTasks,
} from "@/hooks/useLeads";
import { useLeadTags } from "@/hooks/useLeadTags";
import { scopeFromFlags } from "@/lib/quoteScope";
import { useAuth } from "@/hooks/useAuth";
import { leadPipelineValue } from "@/lib/leadEstimate";
import { useLeadViewState, activeFilterCount, toListFilters, type LeadViewState } from "@/hooks/useLeadViewState";
import { useSavedLeadViews } from "@/hooks/useSavedLeadViews";
import { KanbanBoard } from "@/components/sales/KanbanBoard";
import { LeadsListView } from "@/components/sales/LeadsListView";
import { LeadFilterBar } from "@/components/sales/LeadFilterBar";
import { AddLeadDialog } from "@/components/sales/AddLeadDialog";
import { LeadDetailSheet } from "@/components/sales/LeadDetailSheet";
import { StageManagerDialog } from "@/components/sales/StageManagerDialog";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Kpi({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-xs">{label}</span></div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

// Board-filtering (client-side over de open leads); segment/datum gelden hier niet.
function boardFilter(leads: LeadWithTasks[], s: LeadViewState, uid: string | null) {
  const q = s.search.trim().toLowerCase();
  return leads.filter((l) => {
    if (s.owner === "me") { if (uid && l.owner_user_id !== uid) return false; }
    else if (s.owner === "none") { if (l.owner_user_id) return false; }
    else if (s.owner !== "all") { if (l.owner_user_id !== s.owner) return false; }
    if (s.sources.length && !s.sources.includes(l.source)) return false;
    if (s.priorities.length && !s.priorities.includes(l.priority)) return false;
    if (s.scopes.length) {
      // Scope net als op de kaart afleiden uit de offerte (val terug op de rauwe lead-scope).
      const pq = primaryQuote(l);
      const eff = pq ? scopeFromFlags(pq.with_installation !== false, pq.with_management !== false) : l.scope;
      if (!(eff && s.scopes.includes(eff))) return false;
    }
    if (s.tagIds.length) {
      const lt = (l.lead_tag_links ?? []).map((x) => x.tag_id);
      if (!s.tagIds.some((t) => lt.includes(t))) return false;
    }
    const val = l.estimated_value;
    if (s.valueMin != null && (val == null || val < s.valueMin)) return false;
    if (s.valueMax != null && (val == null || val > s.valueMax)) return false;
    const cp = l.estimated_charge_points;
    if (s.cpMin != null && (cp == null || cp < s.cpMin)) return false;
    if (s.cpMax != null && (cp == null || cp > s.cpMax)) return false;
    if (q) {
      const hay = [l.company_name, l.contact_name, l.city, l.contact_email].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function SalesLeads() {
  const org = useOrganization();
  const stagesQ = useLeadStages();
  const openQ = useOpenLeads();
  const profilesQ = useTeamProfiles();
  const avgQ = useAvgRevenuePerChargePoint();
  const statsQ = useLeadStats();
  const tagsQ = useLeadTags();
  const reasonsQ = useLostReasons();
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const { state, patch, reset, applySaved } = useLeadViewState();
  const saved = useSavedLeadViews();

  const [addOpen, setAddOpen] = useState(false);
  const [addStageId, setAddStageId] = useState<string | undefined>(undefined);
  const [stageMgrOpen, setStageMgrOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stages = stagesQ.data ?? [];
  const boardStages = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost), [stages]);
  const openLeads = useMemo(() => openQ.data ?? [], [openQ.data]);
  const profiles = profilesQ.data ?? [];
  const sources = useMemo(() => Array.from(new Set(openLeads.map((l) => l.source))).sort(), [openLeads]);

  // Deep-link ?lead=<id> → open detail; verwijder ALLEEN de lead-param (filters blijven).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const lid = searchParams.get("lead");
    if (!lid) return;
    setSelectedId(lid);
    const next = new URLSearchParams(searchParams);
    next.delete("lead");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const ownerName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? null;

  // Geselecteerde lead: uit de open-set of los ophalen (bv. gewonnen/verloren via deep-link).
  const selFromOpen = selectedId ? openLeads.find((l) => l.id === selectedId) ?? null : null;
  const selFetch = useLeadFull(selFromOpen || !selectedId ? undefined : selectedId);
  const selected = useMemo<LeadWithTasks | null>(() => selFromOpen ?? selFetch.data ?? null, [selFromOpen, selFetch.data]);

  const boardLeads = useMemo(() => boardFilter(openLeads, state, uid), [openLeads, state, uid]);
  const dragDisabled = activeFilterCount(state) > 0;

  // KPI's (actieve pijplijn, stabiel — onafhankelijk van filters).
  const pipelineValue = openLeads.reduce((s, l) => s + leadPipelineValue(l, avgQ.data?.value), 0);

  // Systeem-weergaven (met dynamische datums voor deze maand / dit kwartaal).
  const now = new Date();
  const mStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const mEnd = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const qi = Math.floor(now.getMonth() / 3);
  const qStart = isoDay(new Date(now.getFullYear(), qi * 3, 1));
  const qEnd = isoDay(new Date(now.getFullYear(), qi * 3 + 3, 0));
  const systemViews: { name: string; state: Partial<LeadViewState> }[] = [
    { name: "Mijn open leads", state: { view: "list", segment: "open", owner: "me" } },
    { name: "Alle open", state: { view: "board", segment: "open" } },
    { name: "Gewonnen deze maand", state: { view: "list", segment: "all", dateField: "won_at", dateFrom: mStart, dateTo: mEnd, sort: { field: "won_at", dir: "desc" } } },
    { name: "Verloren", state: { view: "list", segment: "lost", sort: { field: "lost_at", dir: "desc" } } },
    { name: "Sluit dit kwartaal", state: { view: "list", segment: "open", dateField: "expected_close_date", dateFrom: qStart, dateTo: qEnd, sort: { field: "expected_close_date", dir: "asc" } } },
  ];

  const saveCurrent = () => {
    const name = window.prompt("Naam voor deze weergave:");
    if (!name?.trim()) return;
    const { page, ...rest } = state;
    saved.upsert(name.trim(), rest);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Salespijplijn — het bord toont je openstaande leads.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={state.view} onValueChange={(v) => v && patch({ view: v as "board" | "list" }, { keepPage: true })} className="rounded-md border">
            <ToggleGroupItem value="board" aria-label="Bord" className="h-9 px-3"><LayoutGrid className="mr-1.5 h-4 w-4" />Bord</ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Lijst" className="h-9 px-3"><List className="mr-1.5 h-4 w-4" />Lijst</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" onClick={() => setStageMgrOpen(true)}><SlidersHorizontal className="mr-2 h-4 w-4" /> Fasen beheren</Button>
          <Button onClick={() => { setAddStageId(undefined); setAddOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Lead toevoegen</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Target} label="Open leads" value={String(openLeads.length)} />
        <Kpi icon={Euro} label="Pijplijnwaarde" value={euro(pipelineValue)} />
        <Kpi icon={Trophy} label="Gewonnen deze maand" value={String(statsQ.data?.wonThisMonth ?? 0)} />
        <Kpi icon={Percent} label="Win-rate" value={statsQ.data?.winRate != null ? `${statsQ.data.winRate}%` : "—"} />
      </div>

      {/* Opgeslagen weergaven */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        {systemViews.map((v) => (
          <button key={v.name} onClick={() => applySaved(v.state)} className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">{v.name}</button>
        ))}
        {saved.views.map((v) => (
          <span key={v.name} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
            <button onClick={() => applySaved(v.state)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Star className="h-3 w-3 text-amber-500" />{v.name}</button>
            <button onClick={() => saved.remove(v.name)} className="text-muted-foreground/60 hover:text-red-600" aria-label="Verwijder weergave"><Trash2 className="h-3 w-3" /></button>
          </span>
        ))}
        <button onClick={saveCurrent} disabled={saved.saving} className="rounded-full px-2.5 py-1 text-xs text-primary hover:underline">+ Opslaan als…</button>
      </div>

      <LeadFilterBar state={state} patch={patch} reset={reset} mode={state.view} profiles={profiles} sources={sources} tags={tagsQ.data ?? []} />

      {state.view === "list" ? (
        <LeadsListView
          filters={toListFilters(state)}
          sort={state.sort}
          onSortChange={(s) => patch({ sort: s }, { keepPage: true })}
          page={state.page}
          onPageChange={(p) => patch({ page: p }, { keepPage: true })}
          segment={state.segment}
          onSegmentChange={(seg) => patch({ segment: seg })}
          stages={stages}
          reasons={reasonsQ.data ?? []}
          ownerName={ownerName}
          ownerOptions={profiles}
          onRowClick={setSelectedId}
        />
      ) : stagesQ.isLoading || openQ.isLoading ? (
        <div className="flex gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 flex-shrink-0 rounded-xl" />)}</div>
      ) : boardStages.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nog geen open fasen. Klik op "Fasen beheren".</div>
      ) : openLeads.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">Nog geen open leads</p>
          <p className="mt-1 text-sm text-muted-foreground">Voeg er handmatig één toe, of laat ze vanaf de website binnenkomen.</p>
          <Button className="mt-4" onClick={() => { setAddStageId(undefined); setAddOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Lead toevoegen</Button>
        </div>
      ) : (
        <>
          {dragDisabled && <p className="text-xs text-muted-foreground">Filter actief — wis de filters om kaarten te kunnen slepen.</p>}
          {boardLeads.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Geen open leads voor deze filters.</p>}
          <KanbanBoard
            stages={boardStages}
            leads={boardLeads}
            ownerName={ownerName}
            dragDisabled={dragDisabled}
            onAddInStage={(stageId) => { setAddStageId(stageId); setAddOpen(true); }}
            onCardClick={(l) => setSelectedId(l.id)}
          />
        </>
      )}

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} organizationId={org.data?.id} stages={stages} defaultStageId={addStageId} />
      <StageManagerDialog open={stageMgrOpen} onOpenChange={setStageMgrOpen} organizationId={org.data?.id} stages={stages} />
      <LeadDetailSheet lead={selected} open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)} stages={stages} profiles={profiles} />
    </div>
  );
}
