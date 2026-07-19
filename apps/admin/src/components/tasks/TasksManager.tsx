// Gedeelde takenbeheerder voor beide werkbladen (verhuisd uit SalesTasks):
// scope "sales" = /sales/taken (alleen sales-taken), scope "all" = het
// directie-werkblad (/admin/taken) met alle categorieën + categoriebeheer.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, AlertTriangle, CheckCircle2, Building2, Trash2, Repeat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useAdminData";
import { useLeadOptions, useTeamProfiles } from "@/hooks/useLeads";
import { useAllTasks, useAddTask, useToggleTask, useDeleteTask, useUpdateTask, type TaskCategory, type TaskScope, type TaskWithLead } from "@/hooks/useTasks";
import { TaskDetailSheet } from "@/components/sales/TaskDetailSheet";
import { InlineDueDate } from "@/components/sales/InlineDueDate";
import {
  PRIORITY_CHIP_CLASSES, PRIORITY_LABELS, bucketOf, checklistProgress, compareTasks, normalizePriority,
  parseChecklist, toDateStr, type TaskBucket, type TaskPriority,
} from "@/services/tasks";

const BUCKETS: { key: TaskBucket; label: string }[] = [
  { key: "overdue", label: "Te laat" },
  { key: "today", label: "Vandaag" },
  { key: "week", label: "Deze week" },
  { key: "later", label: "Later" },
  { key: "none", label: "Geen datum" },
];

const CATEGORY_LABELS: Record<TaskCategory, string> = { sales: "Sales", algemeen: "Algemeen" };

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof ListChecks; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent ?? ""}`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function TasksManager({ scope }: { scope: TaskScope }) {
  const isDirectie = scope === "all";
  const navigate = useNavigate();
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const org = useOrganization();
  const tasksQ = useAllTasks(scope);
  const profilesQ = useTeamProfiles();
  const leadsQ = useLeadOptions();

  const addTask = useAddTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  const profiles = profilesQ.data ?? [];
  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const leadOptions = useMemo(
    () => (leadsQ.data ?? []).map((l) => ({ id: l.id, name: l.company_name || "Naamloze lead" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [leadsQ.data],
  );
  const ownerName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? null;

  // Detail-sheet: id vasthouden en de taak vers uit de cache lezen (blijft up-to-date na mutaties).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => (selectedId ? allTasks.find((t) => t.id === selectedId) ?? null : null),
    [selectedId, allTasks],
  );

  // Deep-link ?task=<id> → open detail; verwijder ALLEEN de task-param (filters blijven).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const tid = searchParams.get("task");
    if (!tid) return;
    setSelectedId(tid);
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Nieuwe taak
  const [title, setTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("self"); // self | none | <user_id>
  const [newDue, setNewDue] = useState("");
  const [newLead, setNewLead] = useState("none");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newCategory, setNewCategory] = useState<TaskCategory>(isDirectie ? "algemeen" : "sales");

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState("me"); // me | all | none | <user_id>
  const [statusFilter, setStatusFilter] = useState("open"); // open | done | all
  const [dueFilter, setDueFilter] = useState("all"); // all | overdue | today | week | none
  const [priorityFilter, setPriorityFilter] = useState("all"); // all | high | medium | low
  const [categoryFilter, setCategoryFilter] = useState("all"); // all | sales | algemeen (alleen directie)

  const now = new Date();
  const todayStr = toDateStr(now);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = toDateStr(weekEnd);

  const createTask = () => {
    const t = title.trim();
    if (!t || !org.data?.id) return;
    // Een gekoppelde lead maakt de taak automatisch sales (DB-constraint).
    const category: TaskCategory = newCategory === "algemeen" ? "algemeen" : "sales";
    addTask.mutate({
      leadId: category === "algemeen" ? null : newLead === "none" ? null : newLead,
      organizationId: org.data.id,
      title: t,
      assignedTo: newAssignee === "self" ? myId : newAssignee === "none" ? null : newAssignee,
      dueDate: newDue || null,
      priority: newPriority,
      category,
    });
    setTitle(""); setNewDue(""); setNewPriority("medium");
  };

  // KPI's (op de volledige set binnen deze scope)
  const myOpen = allTasks.filter((t) => !t.done && t.assigned_to === myId).length;
  const overdue = allTasks.filter((t) => !t.done && bucketOf(t.due_date, todayStr, weekEndStr) === "overdue").length;
  const totalOpen = allTasks.filter((t) => !t.done).length;

  const filtered = allTasks.filter((t) => {
    if (statusFilter === "open" && t.done) return false;
    if (statusFilter === "done" && !t.done) return false;
    if (assigneeFilter === "me" && t.assigned_to !== myId) return false;
    else if (assigneeFilter === "none" && t.assigned_to) return false;
    else if (assigneeFilter !== "me" && assigneeFilter !== "all" && assigneeFilter !== "none" && t.assigned_to !== assigneeFilter) return false;
    if (dueFilter !== "all" && bucketOf(t.due_date, todayStr, weekEndStr) !== dueFilter) return false;
    if (priorityFilter !== "all" && normalizePriority(t.priority) !== priorityFilter) return false;
    if (isDirectie && categoryFilter !== "all" && (t.category ?? "sales") !== categoryFilter) return false;
    return true;
  });

  const grouped: Record<TaskBucket, TaskWithLead[]> = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const t of filtered) grouped[bucketOf(t.due_date, todayStr, weekEndStr)].push(t);
  for (const key of Object.keys(grouped) as TaskBucket[]) grouped[key].sort(compareTasks);

  const isLoading = tasksQ.isLoading || profilesQ.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Taken</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDirectie
            ? "Alle taken van het bedrijf — algemeen én sales, voor jezelf of toegewezen aan het team."
            : "Alles wat er voor sales moet gebeuren — voor jezelf of toegewezen aan het team."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={ListChecks} label="Mijn open taken" value={String(myOpen)} />
        <Kpi icon={AlertTriangle} label="Te laat" value={String(overdue)} accent={overdue > 0 ? "text-red-600" : undefined} />
        <Kpi icon={CheckCircle2} label="Totaal open" value={String(totalOpen)} />
      </div>

      {/* Nieuwe taak */}
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex gap-2">
          <Input placeholder="Nieuwe taak…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createTask(); }} />
          <Button onClick={createTask} disabled={!title.trim() || !org.data?.id}><Plus className="mr-1.5 h-4 w-4" /> Toevoegen</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirectie && (
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TaskCategory)}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="algemeen">Algemeen</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={newAssignee} onValueChange={setNewAssignee}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="self">Mijzelf</SelectItem>
              <SelectItem value="none">Niemand toegewezen</SelectItem>
              {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          {newCategory === "sales" && (
            <Select value={newLead} onValueChange={setNewLead}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-[220px]"><SelectValue placeholder="Geen lead" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Geen lead</SelectItem>
                {leadOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TaskPriority)}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["high", "medium", "low"] as const).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="h-8 w-full text-xs sm:w-[160px]" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {isDirectie && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              <SelectItem value="algemeen">Algemeen</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="me">Mijn taken</SelectItem>
            <SelectItem value="all">Iedereen</SelectItem>
            <SelectItem value="none">Niet toegewezen</SelectItem>
            {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Afgerond</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dueFilter} onValueChange={setDueFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle vervaldata</SelectItem>
            <SelectItem value="overdue">Te laat</SelectItem>
            <SelectItem value="today">Vandaag</SelectItem>
            <SelectItem value="week">Deze week</SelectItem>
            <SelectItem value="none">Geen datum</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle prioriteiten</SelectItem>
            {(["high", "medium", "low"] as const).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">Geen taken</p>
          <p className="mt-1 text-sm text-muted-foreground">Niets gevonden voor de huidige filters.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {BUCKETS.filter((b) => grouped[b.key].length > 0).map((b) => (
            <div key={b.key} className="space-y-1.5">
              <p className={`text-xs font-semibold uppercase tracking-wide ${b.key === "overdue" ? "text-red-600" : "text-muted-foreground"}`}>
                {b.label} <span className="font-normal text-muted-foreground">· {grouped[b.key].length}</span>
              </p>
              {grouped[b.key].map((t) => {
                const isOverdue = !t.done && bucketOf(t.due_date, todayStr, weekEndStr) === "overdue";
                const priority = normalizePriority(t.priority);
                const progress = checklistProgress(parseChecklist(t.checklist));
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(t.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(t.id); } }}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                      <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: t.lead_id })} />
                    </span>
                    <span className={`flex-1 truncate text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</span>
                    {isDirectie && (
                      <span className="hidden rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-block">
                        {CATEGORY_LABELS[(t.category as TaskCategory) ?? "sales"]}
                      </span>
                    )}
                    {priority !== "medium" && (
                      <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block ${PRIORITY_CHIP_CLASSES[priority]}`}>
                        {PRIORITY_LABELS[priority]}
                      </span>
                    )}
                    {t.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Terugkerende taak" />}
                    {progress.total > 0 && (
                      <span className="hidden items-center gap-1 text-[11px] tabular-nums text-muted-foreground sm:flex">
                        <ListChecks className="h-3 w-3" />{progress.done}/{progress.total}
                      </span>
                    )}
                    {t.lead_id && t.leads?.company_name && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/sales/leads?lead=${t.lead_id}`); }}
                        className="hidden items-center gap-1 text-xs text-primary hover:underline lg:flex"
                      >
                        <Building2 className="h-3 w-3" />{t.leads.company_name}
                      </button>
                    )}
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                      <InlineDueDate
                        value={t.due_date}
                        overdue={isOverdue}
                        onChange={(v) => updateTask.mutate({ id: t.id, patch: { due_date: v }, leadId: t.lead_id })}
                      />
                    </span>
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                      <Select value={t.assigned_to ?? "none"} onValueChange={(v) => updateTask.mutate({ id: t.id, patch: { assigned_to: v === "none" ? null : v }, leadId: t.lead_id })}>
                        <SelectTrigger className="h-7 w-auto gap-1.5 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
                          {t.assigned_to ? <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(ownerName(t.assigned_to))}</AvatarFallback></Avatar> : null}
                          <span className="hidden text-muted-foreground sm:inline">{ownerName(t.assigned_to) ?? "Niemand"}</span>
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value="none">Niemand</SelectItem>
                          {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </span>
                    <button
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteTask.mutate({ id: t.id, leadId: t.lead_id }); }}
                      aria-label="Taak verwijderen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedId}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
        profiles={profiles}
        leadOptions={leadOptions}
        showCategory={isDirectie}
      />
    </div>
  );
}
