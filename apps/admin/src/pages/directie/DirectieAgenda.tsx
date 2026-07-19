// Bedrijfsagenda van het directie-werkblad: maandraster met twee lagen —
// Microsoft 365-afspraken (edge graph-agenda, organizations.agenda_mailbox)
// én taken met een deadline (lead_tasks, alle categorieën). Taken zijn hier
// afvinkbaar, aan te maken per dag en in te plannen als agenda-blok. De
// takenlaag werkt ook zolang de M365-koppeling nog niet is geconfigureerd;
// de pagina toont dan een compacte setup-banner.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarDays, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, ListChecks, MapPin, Plus, Settings2, Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useAdminData";
import { useAgendaEvents, useAgendaMutation, type AgendaEvent } from "@/hooks/useAgenda";
import { useAddTask, useAllTasks, useToggleTask, type TaskWithLead } from "@/hooks/useTasks";
import { PRIORITY_CHIP_CLASSES, PRIORITY_LABELS, normalizePriority } from "@/services/tasks";

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso: string) => iso.slice(11, 16);

type Draft = { id: string | null; subject: string; date: string; startTime: string; endTime: string; allDay: boolean; location: string; body: string };

const emptyDraft = (date: string): Draft => ({ id: null, subject: "", date, startTime: "09:00", endTime: "10:00", allDay: false, location: "", body: "" });

export default function DirectieAgenda() {
  const navigate = useNavigate();
  const today = new Date();
  const todayKey = dateKey(today);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quickTask, setQuickTask] = useState("");

  const { user } = useAuth();
  const org = useOrganization();
  const tasksQ = useAllTasks("all");
  const toggleTask = useToggleTask();
  const addTask = useAddTask();

  // Rastergrenzen: maandag vóór de 1e t/m zondag na het maandeinde.
  const gridStart = useMemo(() => {
    const d = new Date(cursor);
    const dow = (d.getDay() + 6) % 7; // ma=0
    d.setDate(d.getDate() - dow);
    return d;
  }, [cursor]);
  const gridDays = useMemo(() => {
    const days: Date[] = [];
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const totalDows = Math.ceil((((monthEnd.getTime() - gridStart.getTime()) / 86400000) + 1) / 7) * 7;
    for (let i = 0; i < totalDows; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [gridStart, cursor]);

  const rangeStart = `${dateKey(gridDays[0])}T00:00:00`;
  const rangeEnd = `${dateKey(gridDays[gridDays.length - 1])}T23:59:59`;
  const eventsQ = useAgendaEvents(rangeStart, rangeEnd);
  const mutation = useAgendaMutation();

  const status = eventsQ.data?.status;
  const connected = status === "ok";

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of eventsQ.data?.events ?? []) {
      const key = (e.start ?? "").slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [eventsQ.data]);

  // Takenlaag: alle taken met een deadline, per dag gegroepeerd.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithLead[]>();
    for (const t of tasksQ.data ?? []) {
      if (!t.due_date) continue;
      map.set(t.due_date, [...(map.get(t.due_date) ?? []), t]);
    }
    for (const list of map.values()) list.sort((a, b) => Number(a.done) - Number(b.done));
    return map;
  }, [tasksQ.data]);

  const dayEvents = eventsByDay.get(selectedDay) ?? [];
  const dayTasks = tasksByDay.get(selectedDay) ?? [];

  const openEdit = (e: AgendaEvent) => setDraft({
    id: e.id,
    subject: e.subject,
    date: e.start.slice(0, 10),
    startTime: e.isAllDay ? "09:00" : timeOf(e.start),
    endTime: e.isAllDay ? "10:00" : timeOf(e.end),
    allDay: e.isAllDay,
    location: e.location ?? "",
    body: e.bodyPreview ?? "",
  });

  // Taak "timeboxen": afspraakdialoog voorgevuld met de taak (incl. deeplink).
  const planTask = (t: TaskWithLead) => setDraft({
    ...emptyDraft(selectedDay),
    subject: t.title,
    body: `Taak in het E-Charging dashboard: ${window.location.origin}/admin/taken?task=${t.id}`,
  });

  const saveDraft = async () => {
    if (!draft || !draft.subject.trim()) return;
    const event = {
      subject: draft.subject.trim(),
      start: draft.allDay ? draft.date : `${draft.date}T${draft.startTime}`,
      end: draft.allDay ? nextDay(draft.date) : `${draft.date}T${draft.endTime}`,
      allDay: draft.allDay,
      location: draft.location.trim() || undefined,
      body: draft.body.trim() || undefined,
    };
    try {
      if (draft.id) await mutation.mutateAsync({ action: "update", id: draft.id, event });
      else await mutation.mutateAsync({ action: "create", event });
      toast.success(draft.id ? "Afspraak bijgewerkt" : "Afspraak aangemaakt");
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const removeEvent = async (id: string) => {
    try {
      await mutation.mutateAsync({ action: "delete", id });
      toast.success("Afspraak verwijderd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  const createQuickTask = () => {
    const title = quickTask.trim();
    if (!title || !org.data?.id) return;
    addTask.mutate({
      organizationId: org.data.id,
      title,
      dueDate: selectedDay,
      assignedTo: user?.id ?? null,
      category: "algemeen",
    });
    setQuickTask("");
  };

  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const isLoading = eventsQ.isLoading || tasksQ.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Afspraken (Microsoft 365) en taken met een deadline, in één overzicht</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayKey); }}>Vandaag</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Vorige maand"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[150px] text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Volgende maand"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft(selectedDay))} disabled={!connected}><Plus className="mr-1.5 h-4 w-4" /> Afspraak</Button>
        </div>
      </div>

      {/* Setup-banner: de takenlaag werkt altijd; M365 vraagt eenmalige setup */}
      {(status === "not_configured" || status === "no_consent") && (
        <Card className="border-[hsl(var(--status-amber)/0.4)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-amber))]" />
              <p className="max-w-2xl text-sm text-muted-foreground">
                {status === "not_configured" ? (
                  <>De Outlook-koppeling is nog niet ingesteld: kies eerst een agenda-mailbox via{" "}
                    <Link to="/beheer/instellingen" className="text-primary hover:underline">Instellingen → Standaardwaarden</Link>. Taken zie je hieronder al wel.</>
                ) : (
                  <>De Microsoft-koppeling mist nog toestemming: verleen op de bestaande Azure-app de application-permissie{" "}
                    <span className="font-medium text-foreground">Calendars.ReadWrite</span> + admin-consent (e-group-tenant) en controleer de mailbox. Taken zie je hieronder al wel.</>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => eventsQ.refetch()}>Opnieuw controleren</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        {/* Maandraster: afspraken (groen) + taken (amber) */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            {isLoading ? (
              <Skeleton className="mt-1 h-[420px] w-full rounded-lg" />
            ) : (
              <div className="mt-1 grid grid-cols-7 gap-1">
                {gridDays.map((d) => {
                  const key = dateKey(d);
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const events = eventsByDay.get(key) ?? [];
                  const openTasks = (tasksByDay.get(key) ?? []).filter((t) => !t.done);
                  const items = [
                    ...events.map((e) => ({ kind: "event" as const, id: e.id, label: e.isAllDay ? e.subject : `${timeOf(e.start)} ${e.subject}` })),
                    ...openTasks.map((t) => ({ kind: "task" as const, id: t.id, label: t.title })),
                  ];
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`min-h-[80px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                      } ${inMonth ? "" : "opacity-40"}`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                        key === todayKey ? "bg-primary font-semibold text-primary-foreground" : "text-foreground"
                      }`}>{d.getDate()}</span>
                      <div className="mt-0.5 space-y-0.5">
                        {items.slice(0, 3).map((it) => (
                          <div
                            key={`${it.kind}-${it.id}`}
                            className={`truncate rounded px-1 py-px text-[10px] leading-4 ${
                              it.kind === "event"
                                ? "bg-primary/10 text-primary"
                                : "bg-[hsl(var(--status-amber)/0.14)] text-[hsl(var(--status-amber))]"
                            }`}
                          >
                            {it.kind === "task" ? "☐ " : ""}{it.label}
                          </div>
                        ))}
                        {items.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} meer</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 px-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary/60" /> Afspraak</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[hsl(var(--status-amber))]" /> Taak (deadline)</span>
            </div>
          </CardContent>
        </Card>

        {/* Dagdetail: afspraken + taken van de geselecteerde dag */}
        <Card className="self-start">
          <CardContent className="p-4 space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
            </p>

            {/* Afspraken */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Afspraken</p>
              {!connected ? (
                <p className="text-xs text-muted-foreground">Beschikbaar zodra de Outlook-koppeling actief is.</p>
              ) : dayEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Geen afspraken deze dag.</p>
              ) : (
                dayEvents.map((e) => (
                  <div key={e.id} className="group rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button className="flex-1 text-left" onClick={() => openEdit(e)}>
                        <p className="text-sm font-medium leading-snug">{e.subject}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {e.isAllDay ? "Hele dag" : `${timeOf(e.start)} – ${timeOf(e.end)}`}
                        </p>
                        {e.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{e.location}</p>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {e.webLink && (
                          <a href={e.webLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Openen in Outlook">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button className="text-muted-foreground hover:text-red-600" onClick={() => removeEvent(e.id)} aria-label="Afspraak verwijderen">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Taken met deadline op deze dag */}
            <div className="space-y-2 border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ListChecks className="h-3.5 w-3.5" /> Taken</p>
              {dayTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Geen taken met deze deadline.</p>
              ) : (
                dayTasks.map((t) => {
                  const priority = normalizePriority(t.priority);
                  return (
                    <div key={t.id} className="group flex items-center gap-2 rounded-lg border bg-card p-2.5">
                      <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: t.lead_id })} />
                      <button
                        className={`flex-1 truncate text-left text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                        onClick={() => navigate(`/admin/taken?task=${t.id}`)}
                        title="Open in Taken"
                      >
                        {t.title}
                      </button>
                      {priority !== "medium" && (
                        <span className={`hidden rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline-block ${PRIORITY_CHIP_CLASSES[priority]}`}>
                          {PRIORITY_LABELS[priority]}
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {connected && !t.done && (
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => planTask(t)} aria-label="Inplannen als afspraak" title="Inplannen als afspraak">
                            <CalendarClock className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button className="text-muted-foreground hover:text-foreground" onClick={() => navigate(`/admin/taken?task=${t.id}`)} aria-label="Open taak">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex gap-2 pt-1">
                <Input
                  className="h-8 text-xs"
                  placeholder="Nieuwe taak op deze dag…"
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createQuickTask(); }}
                />
                <Button size="sm" className="h-8" variant="outline" onClick={createQuickTask} disabled={!quickTask.trim() || !org.data?.id}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Afspraak aanmaken/bewerken */}
      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Afspraak bewerken" : "Nieuwe afspraak"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="ag-subject">Titel</Label>
                <Input id="ag-subject" className="mt-1" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Bv. kwartaaloverleg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ag-date">Datum</Label>
                  <Input id="ag-date" type="date" className="mt-1" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox checked={draft.allDay} onCheckedChange={(c) => setDraft({ ...draft, allDay: !!c })} /> Hele dag
                </label>
              </div>
              {!draft.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ag-start">Van</Label>
                    <Input id="ag-start" type="time" className="mt-1" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ag-end">Tot</Label>
                    <Input id="ag-end" type="time" className="mt-1" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="ag-location">Locatie</Label>
                <Input id="ag-location" className="mt-1" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Optioneel" />
              </div>
              <div>
                <Label htmlFor="ag-body">Omschrijving</Label>
                <Textarea id="ag-body" className="mt-1 min-h-[72px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Optioneel" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Annuleren</Button>
            <Button onClick={saveDraft} disabled={!draft?.subject.trim() || mutation.isPending}>
              {mutation.isPending ? "Opslaan…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}
