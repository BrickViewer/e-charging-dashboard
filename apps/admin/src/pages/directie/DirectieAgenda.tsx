// Bedrijfsagenda van het directie-werkblad: maandraster op de Microsoft 365-
// agenda van organizations.agenda_mailbox (edge graph-agenda). Afspraken
// aanmaken/bewerken/verwijderen; zolang mailbox of Azure-consent ontbreekt
// toont de pagina de setup-instructie.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin, Plus, Settings2, Trash2 } from "lucide-react";
import { useAgendaEvents, useAgendaMutation, type AgendaEvent } from "@/hooks/useAgenda";

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso: string) => iso.slice(11, 16);

type Draft = { id: string | null; subject: string; date: string; startTime: string; endTime: string; allDay: boolean; location: string; body: string };

const emptyDraft = (date: string): Draft => ({ id: null, subject: "", date, startTime: "09:00", endTime: "10:00", allDay: false, location: "", body: "" });

export default function DirectieAgenda() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string>(dateKey(today));
  const [draft, setDraft] = useState<Draft | null>(null);

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
  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of eventsQ.data?.events ?? []) {
      const key = (e.start ?? "").slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [eventsQ.data]);

  const dayEvents = byDay.get(selectedDay) ?? [];

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

  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const todayKey = dateKey(today);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bedrijfsagenda via Microsoft 365</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Vorige maand"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[150px] text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Volgende maand"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft(selectedDay))} disabled={status !== "ok"}><Plus className="mr-1.5 h-4 w-4" /> Afspraak</Button>
        </div>
      </div>

      {status === "not_configured" || status === "no_consent" ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Settings2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">Agenda nog niet gekoppeld</p>
            {status === "not_configured" ? (
              <p className="mx-auto max-w-xl text-sm text-muted-foreground">
                Stel eerst de agenda-mailbox in via <Link to="/beheer/instellingen" className="text-primary hover:underline">Instellingen → Standaardwaarden</Link>.
              </p>
            ) : (
              <p className="mx-auto max-w-xl text-sm text-muted-foreground">
                De Microsoft-koppeling mist nog toestemming. Voeg op de bestaande Azure-app (dezelfde als voor SharePoint) de application-permissie
                <span className="font-medium text-foreground"> Calendars.ReadWrite</span> toe en verleen admin-consent in de e-group-tenant. Controleer daarna of de ingestelde mailbox bestaat.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          {/* Maandraster */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              {eventsQ.isLoading ? (
                <Skeleton className="mt-1 h-[420px] w-full rounded-lg" />
              ) : (
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {gridDays.map((d) => {
                    const key = dateKey(d);
                    const inMonth = d.getMonth() === cursor.getMonth();
                    const events = byDay.get(key) ?? [];
                    const isSelected = key === selectedDay;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDay(key)}
                        className={`min-h-[76px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                          isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                        } ${inMonth ? "" : "opacity-40"}`}
                      >
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                          key === todayKey ? "bg-primary font-semibold text-primary-foreground" : "text-foreground"
                        }`}>{d.getDate()}</span>
                        <div className="mt-0.5 space-y-0.5">
                          {events.slice(0, 3).map((e) => (
                            <div key={e.id} className="truncate rounded bg-primary/10 px-1 py-px text-[10px] leading-4 text-primary">
                              {e.isAllDay ? e.subject : `${timeOf(e.start)} ${e.subject}`}
                            </div>
                          ))}
                          {events.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{events.length - 3} meer</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dagdetail */}
          <Card className="self-start">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              {dayEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground/60" />
                  <p className="mt-2 text-sm text-muted-foreground">Geen afspraken</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setDraft(emptyDraft(selectedDay))}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Afspraak toevoegen
                  </Button>
                </div>
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
            </CardContent>
          </Card>
        </div>
      )}

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
