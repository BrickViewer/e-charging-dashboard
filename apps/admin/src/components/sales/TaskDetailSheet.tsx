import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, CalendarClock, Flag, ListChecks, Plus, Repeat, Trash2, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PRIORITY_CHIP_CLASSES, PRIORITY_LABELS, RECURRENCE_LABELS, checklistProgress, nextOccurrence,
  normalizePriority, parseChecklist, toDateStr, type ChecklistItem, type TaskPriority, type TaskRecurrence,
} from "@/services/tasks";
import {
  useDeleteTask, useToggleTask, useUpdateTask, useUpdateTaskChecklist, type TaskPatch, type TaskWithLead,
} from "@/hooks/useTasks";

// Detailpaneel van één taak: alles direct bewerkbaar (opslaan per veld, geen
// aparte bewerkmodus — taken zijn licht). Patroon naar LeadDetailSheet.

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

type Props = {
  // Directie-weergave: toon en bewerk de taakcategorie (sales/algemeen).
  showCategory?: boolean;
  task: TaskWithLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: { user_id: string; full_name: string | null }[];
  leadOptions: { id: string; name: string }[];
};

export function TaskDetailSheet({ task, open, onOpenChange, profiles, leadOptions, showCategory = false }: Props) {
  const navigate = useNavigate();
  const updateTask = useUpdateTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const updateChecklist = useUpdateTaskChecklist();

  // Titel/omschrijving lokaal (opslaan op blur/Enter); overige velden saven direct.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newItem, setNewItem] = useState("");
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setNewItem("");
  }, [task?.id, task?.title, task?.description]);

  const checklist = useMemo(() => parseChecklist(task?.checklist), [task?.checklist]);
  const progress = checklistProgress(checklist);
  const todayStr = toDateStr(new Date());

  if (!task) return null;

  const priority = normalizePriority(task.priority);
  const recurrence = (task.recurrence ?? null) as TaskRecurrence | null;
  const ownerName = profiles.find((p) => p.user_id === task.assigned_to)?.full_name ?? null;

  const patch = (p: TaskPatch, onDone?: () => void) =>
    updateTask.mutate(
      { id: task.id, patch: p, leadId: task.lead_id },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Opslaan mislukt"), onSuccess: onDone },
    );

  const saveTitle = () => {
    const t = title.trim();
    if (!t) { setTitle(task.title); return; }
    if (t !== task.title) patch({ title: t });
  };
  const saveDescription = () => {
    const d = description.trim();
    if (d !== (task.description ?? "")) patch({ description: d || null });
  };

  const saveChecklist = (items: ChecklistItem[]) =>
    updateChecklist.mutate(
      { id: task.id, checklist: items, leadId: task.lead_id },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Checklist opslaan mislukt") },
    );

  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    saveChecklist([...checklist, { id: crypto.randomUUID(), text: t, done: false }]);
    setNewItem("");
  };

  const toggleDone = (done: boolean) => {
    toggleTask.mutate(
      { id: task.id, done, leadId: task.lead_id },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Bijwerken mislukt") },
    );
    if (done && recurrence && !task.recurred_at) {
      const next = nextOccurrence(task.due_date, recurrence, todayStr);
      toast.success(`Taak afgerond — volgende ingepland op ${new Date(next).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="sticky top-0 z-10 space-y-0 border-b bg-background px-5 py-4">
          <div className="flex items-start gap-3">
            <Checkbox className="mt-1" checked={task.done} onCheckedChange={(c) => toggleDone(!!c)} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="sr-only">Taak</SheetTitle>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`h-auto border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0 ${task.done ? "text-muted-foreground line-through" : ""}`}
                aria-label="Taaktitel"
              />
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-block rounded-full px-2 py-0.5 font-medium ${PRIORITY_CHIP_CLASSES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
                {recurrence && (
                  <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" />{RECURRENCE_LABELS[recurrence]}</span>
                )}
                {progress.total > 0 && (
                  <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" />{progress.done}/{progress.total}</span>
                )}
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600" aria-label="Taak verwijderen">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Taak verwijderen?</AlertDialogTitle>
                  <AlertDialogDescription>"{task.title}" wordt definitief verwijderd, inclusief de checklist.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() =>
                      deleteTask.mutate(
                        { id: task.id, leadId: task.lead_id },
                        {
                          onSuccess: () => { toast.success("Taak verwijderd"); onOpenChange(false); },
                          onError: (e) => toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"),
                        },
                      )
                    }
                  >
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-5 py-4">
          {/* Velden */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Vervaldatum</span>
              <Input
                type="date"
                className="h-9"
                value={task.due_date?.slice(0, 10) ?? ""}
                onChange={(e) => patch({ due_date: e.target.value || null })}
              />
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Flag className="h-3.5 w-3.5" /> Prioriteit</span>
              <Select value={priority} onValueChange={(v) => patch({ priority: v as TaskPriority })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["high", "medium", "low"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><User className="h-3.5 w-3.5" /> Toegewezen aan</span>
              <Select value={task.assigned_to ?? "none"} onValueChange={(v) => patch({ assigned_to: v === "none" ? null : v })}>
                <SelectTrigger className="h-9">
                  <div className="flex items-center gap-2">
                    {task.assigned_to && <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(ownerName)}</AvatarFallback></Avatar>}
                    <span>{ownerName ?? "Niemand"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Niemand</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Repeat className="h-3.5 w-3.5" /> Herhaling</span>
              <Select value={recurrence ?? "none"} onValueChange={(v) => patch({ recurrence: v === "none" ? null : (v as TaskRecurrence) })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen herhaling</SelectItem>
                  {(["daily", "weekly", "monthly"] as const).map((r) => (
                    <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          {recurrence && !task.done && (
            <p className="text-xs text-muted-foreground">
              Herhaalt {RECURRENCE_LABELS[recurrence].toLowerCase()} — na afvinken komt de volgende op{" "}
              {new Date(nextOccurrence(task.due_date, recurrence, todayStr)).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
          )}

          {/* Lead-koppeling */}
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> Gekoppelde lead</span>
            <div className="flex items-center gap-2">
              {/* Lead koppelen impliceert sales (DB-constraint lead_tasks_lead_implies_sales) */}
              <Select value={task.lead_id ?? "none"} onValueChange={(v) => patch(v === "none" ? { lead_id: null } : { lead_id: v, category: "sales" })}>
                <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Geen lead" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen lead</SelectItem>
                  {leadOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {task.lead_id && (
                <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => navigate(`/sales/leads?lead=${task.lead_id}`)}>
                  Openen
                </Button>
              )}
            </div>
          </div>

          {/* Categorie (directie-weergave): lead-gebonden taken zijn altijd sales */}
          {showCategory && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Categorie</span>
              <Select
                value={task.category ?? "sales"}
                onValueChange={(v) => patch({ category: v as "sales" | "algemeen" })}
                disabled={!!task.lead_id}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="algemeen">Algemeen</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
              {task.lead_id && <p className="text-xs text-muted-foreground">Gekoppeld aan een lead — daarmee automatisch een sales-taak.</p>}
            </div>
          )}

          {/* Omschrijving */}
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Omschrijving</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Waar gaat deze taak over? (optioneel)"
              className="min-h-[88px] resize-y text-sm"
            />
          </div>

          <Separator />

          {/* Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Checklist{progress.total > 0 && ` · ${progress.done}/${progress.total}`}
              </span>
            </div>
            {checklist.length > 0 && (
              <div className="space-y-1">
                {checklist.map((item) => (
                  <div key={item.id} className="group flex items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(c) => saveChecklist(checklist.map((i) => (i.id === item.id ? { ...i, done: !!c } : i)))}
                    />
                    <span className={`flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.text}</span>
                    <button
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      onClick={() => saveChecklist(checklist.filter((i) => i.id !== item.id))}
                      aria-label="Checklist-item verwijderen"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                placeholder="Deelstap toevoegen…"
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={addItem} disabled={!newItem.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-0.5 pb-2 text-xs text-muted-foreground">
            <p>Aangemaakt: {fmtDateTime(task.created_at)}</p>
            {task.done && task.completed_at && <p>Afgerond: {fmtDateTime(task.completed_at)}</p>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
