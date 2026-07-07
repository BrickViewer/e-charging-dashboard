import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, AlertTriangle, CheckCircle2, Building2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useAdminData";
import {
  useAllTasks, useAddTask, useToggleTask, useDeleteTask, useUpdateTask, useTeamProfiles, useLeadOptions,
  type TaskWithLead,
} from "@/hooks/useLeads";

// Datum-buckets (date-only string-vergelijking; due_date is een `date`-kolom 'YYYY-MM-DD').
const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
type Bucket = "overdue" | "today" | "week" | "later" | "none";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "overdue", label: "Te laat" },
  { key: "today", label: "Vandaag" },
  { key: "week", label: "Deze week" },
  { key: "later", label: "Later" },
  { key: "none", label: "Geen datum" },
];

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

export default function SalesTasks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const org = useOrganization();
  const tasksQ = useAllTasks();
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

  // Nieuwe taak
  const [title, setTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("self"); // self | none | <user_id>
  const [newDue, setNewDue] = useState("");
  const [newLead, setNewLead] = useState("none");

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState("me"); // me | all | none | <user_id>
  const [statusFilter, setStatusFilter] = useState("open"); // open | done | all
  const [dueFilter, setDueFilter] = useState("all"); // all | overdue | today | week | none

  const now = new Date();
  const todayStr = toStr(now);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = toStr(weekEnd);
  const bucketOf = (due: string | null): Bucket => {
    if (!due) return "none";
    const dd = due.slice(0, 10);
    if (dd < todayStr) return "overdue";
    if (dd === todayStr) return "today";
    if (dd <= weekEndStr) return "week";
    return "later";
  };

  const createTask = () => {
    const t = title.trim();
    if (!t || !org.data?.id) return;
    addTask.mutate({
      leadId: newLead === "none" ? null : newLead,
      organizationId: org.data.id,
      title: t,
      assignedTo: newAssignee === "self" ? myId : newAssignee === "none" ? null : newAssignee,
      dueDate: newDue || null,
    });
    setTitle(""); setNewDue("");
  };

  // KPI's (op de volledige set)
  const myOpen = allTasks.filter((t) => !t.done && t.assigned_to === myId).length;
  const overdue = allTasks.filter((t) => !t.done && bucketOf(t.due_date) === "overdue").length;
  const totalOpen = allTasks.filter((t) => !t.done).length;

  const filtered = allTasks.filter((t) => {
    if (statusFilter === "open" && t.done) return false;
    if (statusFilter === "done" && !t.done) return false;
    if (assigneeFilter === "me" && t.assigned_to !== myId) return false;
    else if (assigneeFilter === "none" && t.assigned_to) return false;
    else if (assigneeFilter !== "me" && assigneeFilter !== "all" && assigneeFilter !== "none" && t.assigned_to !== assigneeFilter) return false;
    if (dueFilter !== "all" && bucketOf(t.due_date) !== dueFilter) return false;
    return true;
  });

  const grouped: Record<Bucket, TaskWithLead[]> = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const t of filtered) grouped[bucketOf(t.due_date)].push(t);

  const isLoading = tasksQ.isLoading || profilesQ.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Taken</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alles wat er nog moet gebeuren — toegewezen aan het team.</p>
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
          <Select value={newAssignee} onValueChange={setNewAssignee}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="self">Mijzelf</SelectItem>
              <SelectItem value="none">Niemand toegewezen</SelectItem>
              {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={newLead} onValueChange={setNewLead}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[220px]"><SelectValue placeholder="Geen lead" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Geen lead</SelectItem>
              {leadOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="h-8 w-full text-xs sm:w-[160px]" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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
                const isOverdue = !t.done && bucketOf(t.due_date) === "overdue";
                return (
                  <div key={t.id} className="group flex items-center gap-3 rounded-lg border bg-card p-2.5">
                    <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: t.lead_id })} />
                    <span className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</span>
                    {t.lead_id && t.leads?.company_name && (
                      <button onClick={() => navigate(`/sales/leads?lead=${t.lead_id}`)} className="hidden items-center gap-1 text-xs text-primary hover:underline sm:flex">
                        <Building2 className="h-3 w-3" />{t.leads.company_name}
                      </button>
                    )}
                    {t.due_date && (
                      <span className={`text-[11px] tabular-nums ${isOverdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                        {new Date(t.due_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      </span>
                    )}
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
                    <button className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => deleteTask.mutate({ id: t.id, leadId: t.lead_id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
