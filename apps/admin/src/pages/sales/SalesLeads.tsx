import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, SlidersHorizontal, Target, Euro, Trophy, ListChecks, Archive } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOrganization } from "@/hooks/useAdminData";
import { useLeads, useLeadStages, useTeamProfiles, type LeadWithTasks } from "@/hooks/useLeads";
import { KanbanBoard } from "@/components/sales/KanbanBoard";
import { LeadsArchiveList } from "@/components/sales/LeadsArchiveList";
import { MarkLostDialog } from "@/components/sales/MarkLostDialog";
import { AddLeadDialog } from "@/components/sales/AddLeadDialog";
import { LeadDetailSheet } from "@/components/sales/LeadDetailSheet";
import { StageManagerDialog } from "@/components/sales/StageManagerDialog";

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function Kpi({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function SalesLeads() {
  const org = useOrganization();
  const stagesQ = useLeadStages();
  const leadsQ = useLeads();
  const profilesQ = useTeamProfiles();

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [addOpen, setAddOpen] = useState(false);
  const [addStageId, setAddStageId] = useState<string | undefined>(undefined);
  const [stageMgrOpen, setStageMgrOpen] = useState(false);
  const [selected, setSelected] = useState<LeadWithTasks | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [lostLead, setLostLead] = useState<LeadWithTasks | null>(null);

  const stages = useMemo(() => stagesQ.data ?? [], [stagesQ.data]);
  const allLeads = useMemo(() => leadsQ.data ?? [], [leadsQ.data]);
  const profiles = profilesQ.data ?? [];

  // Slepen kan de volgorde corrumperen zodra de board een gefilterde subset
  // toont → DnD uit zolang een filter/zoekterm actief is.
  const dragDisabled = debounced.trim() !== "" || ownerFilter !== "all" || sourceFilter !== "all";

  const ownerName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? null;

  const leads = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (ownerFilter !== "all" && (l.owner_user_id ?? "none") !== ownerFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (q) {
        const hay = [l.company_name, l.contact_name, l.city, l.contact_email].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allLeads, debounced, ownerFilter, sourceFilter]);

  // Actief = open fases/leads; archief = afgehandeld (gewonnen + verloren).
  const activeStages = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost), [stages]);
  const activeLeads = useMemo(() => leads.filter((l) => l.status === "open"), [leads]);
  const archiveLeads = useMemo(() => leads.filter((l) => l.status === "won" || l.status === "lost"), [leads]);
  const lostStageId = useMemo(() => stages.find((s) => s.is_lost)?.id ?? null, [stages]);

  // KPI's (op de volledige set, niet gefilterd)
  const openLeads = allLeads.filter((l) => l.status === "open");
  const pipelineValue = openLeads.reduce((s, l) => s + (l.estimated_value ?? 0), 0);
  const now = new Date();
  const wonThisMonth = allLeads.filter((l) => {
    if (!l.won_at) return false;
    const d = new Date(l.won_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const openTasks = allLeads.reduce((s, l) => s + (l.lead_tasks?.filter((t) => !t.done).length ?? 0), 0);

  // De geselecteerde lead live houden met de query.
  const selectedLive = selected ? allLeads.find((l) => l.id === selected.id) ?? selected : null;

  const sources = Array.from(new Set(allLeads.map((l) => l.source)));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Salespijplijn — sleep leads tussen de fasen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowArchive((v) => !v)}>
            <Archive className="mr-2 h-4 w-4" /> {showArchive ? "Verberg archief" : "Toon archief"}
          </Button>
          <Button variant="outline" onClick={() => setStageMgrOpen(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Fasen beheren
          </Button>
          <Button onClick={() => { setAddStageId(undefined); setAddOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Lead toevoegen
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Target} label="Open leads" value={String(openLeads.length)} />
        <Kpi icon={Euro} label="Pijplijnwaarde" value={euro(pipelineValue)} />
        <Kpi icon={Trophy} label="Gewonnen deze maand" value={String(wonThisMonth)} />
        <Kpi icon={ListChecks} label="Open taken" value={String(openTasks)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op bedrijf, contact, plaats…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle eigenaren</SelectItem>
            <SelectItem value="none">Geen eigenaar</SelectItem>
            {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle bronnen</SelectItem>
            {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {stagesQ.isLoading || leadsQ.isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 flex-shrink-0 rounded-xl" />)}
        </div>
      ) : stages.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nog geen fasen. Klik op "Fasen beheren" om te beginnen.
        </div>
      ) : allLeads.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">Nog geen leads</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Voeg er handmatig één toe, of laat ze vanaf de website binnenkomen.
          </p>
          <Button className="mt-4" onClick={() => { setAddStageId(undefined); setAddOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Lead toevoegen
          </Button>
        </div>
      ) : showArchive ? (
        <LeadsArchiveList leads={archiveLeads} ownerName={ownerName} onRowClick={(l) => setSelected(l)} />
      ) : (
        <>
          {dragDisabled && (
            <p className="text-xs text-muted-foreground">Filter actief — wis de filters om kaarten te kunnen slepen.</p>
          )}
          <KanbanBoard
            stages={activeStages}
            leads={activeLeads}
            ownerName={ownerName}
            dragDisabled={dragDisabled}
            onAddInStage={(stageId) => { setAddStageId(stageId); setAddOpen(true); }}
            onCardClick={(l) => setSelected(l)}
            onMarkLost={(l) => setLostLead(l)}
          />
        </>
      )}

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} organizationId={org.data?.id} stages={stages} defaultStageId={addStageId} />
      <StageManagerDialog open={stageMgrOpen} onOpenChange={setStageMgrOpen} organizationId={org.data?.id} stages={stages} />
      <LeadDetailSheet lead={selectedLive} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} stages={stages} profiles={profiles} onMarkLost={(l) => { setSelected(null); setLostLead(l); }} />
      <MarkLostDialog lead={lostLead} lostStageId={lostStageId} open={!!lostLead} onOpenChange={(v) => !v && setLostLead(null)} />
    </div>
  );
}
