import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, CalendarClock, Euro, ExternalLink, FileText, MapPin, MoreHorizontal,
  Pencil, Plus, Trash2, Trophy, UserPlus, WandSparkles, XCircle, Zap,
} from "lucide-react";
import { useCreateQuoteFromLead, useLeadQuotes } from "@/hooks/useQuotes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccessBeheer } from "@/lib/workspaces";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import {
  useLeadTasks, useLeadActivities, useUpdateLead, useDeleteLead, useAddTask, useToggleTask,
  useDeleteTask, useConvertLeadToClient, type LeadStage, type LeadWithTasks,
} from "@/hooks/useLeads";

const LOCATION_TYPES: Record<string, string> = {
  workplace: "Werkplek", destination: "Bestemming", fleet: "Vloot/depot", public: "Publiek", other: "Anders",
};
const ACTIVITY_LABEL: Record<string, string> = {
  created: "Aangemaakt", stage_change: "Fase gewijzigd", note: "Notitie", converted: "Geconverteerd",
  quote_sent: "Offerte verstuurd", quote_accepted: "Offerte geaccordeerd",
};
const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: "Hoog", cls: "bg-red-100 text-red-700" },
  medium: { label: "Gemiddeld", cls: "bg-amber-100 text-amber-700" },
  low: { label: "Laag", cls: "bg-zinc-100 text-zinc-600" },
};
const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "bg-zinc-100 text-zinc-600" },
  verstuurd: { label: "Verstuurd", cls: "bg-amber-100 text-amber-700" },
  getekend: { label: "Getekend", cls: "bg-green-100 text-green-700" },
  verlopen: { label: "Verlopen", cls: "bg-zinc-100 text-zinc-500" },
  afgewezen: { label: "Afgewezen", cls: "bg-red-100 text-red-700" },
};

const euro = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
// UTC-ISO → lokale "yyyy-MM-ddTHH:mm" voor <input type="datetime-local"> (lezen en schrijven symmetrisch lokaal).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LeadDetailSheet({
  lead, open, onOpenChange, stages, profiles,
}: {
  lead: LeadWithTasks | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: LeadStage[];
  profiles: { user_id: string; full_name: string | null }[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const convert = useConvertLeadToClient();
  const createQuote = useCreateQuoteFromLead();
  const addTask = useAddTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const tasks = useLeadTasks(open ? lead?.id : undefined);
  const activities = useLeadActivities(open ? lead?.id : undefined);
  const quotes = useLeadQuotes(open ? lead?.id : undefined);

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newNote, setNewNote] = useState("");
  const [apptEditing, setApptEditing] = useState(false);

  const buildForm = (l: LeadWithTasks): Record<string, string | boolean | null> => ({
    kvk: l.kvk ?? "", website: l.website ?? "", sector: l.sector ?? "",
    address_street: l.address_street ?? "", postal_code: l.postal_code ?? "", city: l.city ?? "",
    location_type: l.location_type ?? "",
    estimated_charge_points: l.estimated_charge_points?.toString() ?? "",
    estimated_kwh_per_month: l.estimated_kwh_per_month?.toString() ?? "",
    charger_type: l.charger_type ?? "", parking_spaces: l.parking_spaces?.toString() ?? "",
    owns_property: l.owns_property ?? false, has_solar: l.has_solar ?? false,
    estimated_value: l.estimated_value?.toString() ?? "", expected_close_date: l.expected_close_date ?? "",
    priority: l.priority ?? "medium", notes: l.notes ?? "",
    appointment_at: l.appointment_at ? toLocalInput(l.appointment_at) : "",
    appointment_notes: l.appointment_notes ?? "",
  });

  useEffect(() => {
    if (lead) { setForm(buildForm(lead)); setDirty(false); setIsEditing(false); }
    setApptEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // Centreer de huidige fase in de naam-rail (alleen horizontaal — raakt de sheet-scroll niet).
  const stageRailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = stageRailRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>('[aria-current="step"]');
    if (active) rail.scrollLeft = active.offsetLeft - rail.clientWidth / 2 + active.clientWidth / 2;
  }, [lead?.stage_id, open]);

  if (!lead) return null;
  const set = (k: string) => (v: string | boolean) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const text = (k: string) => (form[k] as string) ?? "";
  const ownerName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? null;
  const canBeheer = canAccessBeheer(role);
  const stageIdx = stages.findIndex((s) => s.id === lead.stage_id);
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);
  const hasConfiguration = !!lead.configuration;
  const prio = PRIORITY[lead.priority] ?? PRIORITY.medium;

  const saveOverview = async () => {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: {
          kvk: text("kvk").trim() || null, website: text("website").trim() || null, sector: text("sector").trim() || null,
          address_street: text("address_street").trim() || null, postal_code: text("postal_code").trim() || null,
          city: text("city").trim() || null, location_type: text("location_type") || null,
          estimated_charge_points: text("estimated_charge_points") ? Math.round(num(text("estimated_charge_points")) ?? 0) : null,
          estimated_kwh_per_month: num(text("estimated_kwh_per_month")),
          charger_type: text("charger_type").trim() || null,
          parking_spaces: text("parking_spaces") ? Math.round(num(text("parking_spaces")) ?? 0) : null,
          owns_property: form.owns_property as boolean, has_solar: form.has_solar as boolean,
          estimated_value: num(text("estimated_value")), expected_close_date: text("expected_close_date") || null,
          priority: text("priority") || "medium", notes: text("notes").trim() || null,
          appointment_at: text("appointment_at") ? new Date(text("appointment_at")).toISOString() : null,
          appointment_notes: text("appointment_notes").trim() || null,
        },
      });
      setDirty(false); setIsEditing(false);
      toast.success("Lead opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const cancelEdit = () => { setForm(buildForm(lead)); setDirty(false); setIsEditing(false); };
  const moveToStage = (stageId: string) => updateLead.mutate({ id: lead.id, patch: { stage_id: stageId } });
  const setOwner = (id: string) => updateLead.mutate({ id: lead.id, patch: { owner_user_id: id === "none" ? null : id } });

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) { setConfirmClose(true); return; }
    onOpenChange(next);
  };
  const doConvert = async () => {
    try {
      const client = await convert.mutateAsync({ lead });
      toast.success(`Klant${client.clientNumber ? ` #${client.clientNumber}` : ""} aangemaakt`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Converteren mislukt"); }
  };
  const makeOffer = async () => {
    try {
      const { quoteId } = await createQuote.mutateAsync(lead.id);
      toast.success("Offerte aangemaakt");
      onOpenChange(false);
      navigate(`/sales/offertes?quote=${quoteId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Offerte aanmaken mislukt"); }
  };
  const launchConfigurator = async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string }>("configurator-session-start", { body: { lead_id: lead.id } });
      if (error) throw error;
      if (!data?.url) throw new Error("Geen sessie-URL ontvangen");
      window.open(data.url, "_blank", "noopener,noreferrer,width=1400,height=900");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Configurator starten mislukt"); }
  };
  const removeLead = async () => { await deleteLead.mutateAsync(lead.id); toast.success("Lead verwijderd"); onOpenChange(false); };
  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: lead.id, organization_id: lead.organization_id, user_id: u.user?.id ?? null, type: "note", description: newNote.trim(),
    });
    if (error) { toast.error("Notitie plaatsen mislukt"); return; }
    setNewNote(""); qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
  };

  const address = [lead.address_street, [lead.postal_code, lead.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="ec-scroll w-full overflow-y-auto p-0 sm:max-w-2xl">
          {/* ---- STICKY KOP ---- */}
          <div className="sticky top-0 z-10 border-b bg-card/95 px-6 pb-3 pt-5 backdrop-blur">
            <SheetHeader className="space-y-0">
              <div className="flex items-start justify-between gap-3 pr-8">
                <SheetTitle className="truncate text-xl">{lead.company_name}</SheetTitle>
                {isEditing ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Annuleren</Button>
                    <Button size="sm" onClick={saveOverview} disabled={updateLead.isPending}>{updateLead.isPending ? "Opslaan…" : "Opslaan"}</Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" onClick={makeOffer} disabled={createQuote.isPending}>
                      <FileText className="mr-1.5 h-4 w-4" /> Maak offerte
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                      <Pencil className="mr-1.5 h-4 w-4" /> Bewerken
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Meer acties"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!lead.converted_client_id && <DropdownMenuItem onClick={() => setConfirmConvert(true)}><UserPlus className="mr-2 h-4 w-4" />Converteer naar klant</DropdownMenuItem>}
                        <DropdownMenuItem onClick={launchConfigurator}><WandSparkles className="mr-2 h-4 w-4" />{hasConfiguration ? "Configuratie bewerken" : "Start configurator"}</DropdownMenuItem>
                        {lead.converted_client_id && canBeheer && <DropdownMenuItem onClick={() => navigate(`/admin/klanten/${lead.converted_client_id}`)}><ExternalLink className="mr-2 h-4 w-4" />Bekijk klant</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        {wonStage && <DropdownMenuItem onClick={() => moveToStage(wonStage.id)}><Trophy className="mr-2 h-4 w-4 text-green-600" />Markeer gewonnen</DropdownMenuItem>}
                        {lostStage && <DropdownMenuItem onClick={() => moveToStage(lostStage.id)}><XCircle className="mr-2 h-4 w-4 text-red-600" />Markeer verloren</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" />Verwijderen</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </SheetHeader>

            {/* Fase — huidige fase prominent + slanke 6-segment voortgangsbalk; alle namen op één nette (scroll)rij. */}
            {(() => {
              const current = stageIdx >= 0 ? stages[stageIdx] : null;
              const accent = current?.color ?? "hsl(var(--primary))";
              return (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
                      <span className="truncate text-base font-semibold leading-tight" style={{ color: current ? accent : "hsl(var(--muted-foreground))" }}>
                        {current?.name ?? "Geen fase"}
                      </span>
                    </div>
                    {current && <span className="cockpit-section-label shrink-0 whitespace-nowrap">Fase {stageIdx + 1} / {stages.length}</span>}
                  </div>

                  {/* Klikbare voortgangsbalk */}
                  <div className="mt-2 flex gap-1" role="group" aria-label="Fase wijzigen">
                    {stages.map((s, i) => {
                      const done = stageIdx >= 0 && i < stageIdx;
                      const isCurrent = i === stageIdx;
                      const c = s.color ?? "hsl(var(--primary))";
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => moveToStage(s.id)}
                          aria-current={isCurrent ? "step" : undefined}
                          title={`Verplaats naar ${s.name}`}
                          className="h-1.5 flex-1 rounded-full transition-[background,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          style={{ background: done || isCurrent ? c : "hsl(var(--muted))", boxShadow: isCurrent ? `0 0 0 1px ${c}` : undefined, opacity: done ? 0.55 : 1 }}
                        />
                      );
                    })}
                  </div>

                  {/* Alle namen — nette enkele (scroll)rij met chevrons */}
                  <div ref={stageRailRef} className="ec-scroll -mx-1 mt-2 flex items-center gap-1 overflow-x-auto px-1">
                    {stages.map((s, i) => {
                      const done = stageIdx >= 0 && i < stageIdx;
                      const isCurrent = i === stageIdx;
                      const c = s.color ?? "hsl(var(--primary))";
                      return (
                        <span key={s.id} className="flex shrink-0 items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground/40" aria-hidden>›</span>}
                          <button
                            type="button"
                            onClick={() => moveToStage(s.id)}
                            title={`Verplaats naar ${s.name}`}
                            aria-current={isCurrent ? "step" : undefined}
                            className={`whitespace-nowrap rounded px-1 py-0.5 text-xs leading-none transition-colors hover:text-foreground ${
                              isCurrent ? "font-semibold" : done ? "font-medium text-foreground/70" : "text-muted-foreground"
                            }`}
                            style={isCurrent ? { color: c } : undefined}
                          >
                            {s.name}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Meta-regel */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${prio.cls}`}>{prio.label}</span>
              {lead.converted_client_id && <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Klant aangemaakt</span>}
              <div className="ml-auto">
                <Select value={lead.owner_user_id ?? "none"} onValueChange={setOwner}>
                  <SelectTrigger className="h-7 gap-1.5 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
                    <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(ownerName(lead.owner_user_id))}</AvatarFallback></Avatar>
                    <span className="text-muted-foreground">{ownerName(lead.owner_user_id) ?? "Geen eigenaar"}</span>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="none">Geen eigenaar</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ---- BODY ---- */}
          <div className="space-y-5 px-6 py-5">
            {/* Samenvattingsstrip */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat icon={Euro} label="Waarde" value={euro(lead.estimated_value) ?? "—"} />
              <Stat icon={Zap} label="Laadpunten" value={lead.estimated_charge_points?.toString() ?? "—"} />
              <Stat icon={Zap} label="kWh / mnd" value={lead.estimated_kwh_per_month ? Math.round(Number(lead.estimated_kwh_per_month)).toLocaleString("nl-NL") : "—"} />
              <Stat icon={CalendarClock} label="Afspraak" value={lead.appointment_at ? new Date(lead.appointment_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "—"} />
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overzicht</TabsTrigger>
                <TabsTrigger value="tasks">To-do's{tasks.data ? ` (${tasks.data.filter((t) => !t.done).length})` : ""}</TabsTrigger>
                <TabsTrigger value="activity">Activiteit</TabsTrigger>
              </TabsList>

              {/* OVERZICHT */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {isEditing ? (
                  <EditForm lead={lead} form={form} set={set} text={text} updateLead={updateLead} />
                ) : (
                  <>
                    <InfoCard title="Bedrijf & contact" icon={Building2}>
                      <DetailRow label="Bedrijf" value={lead.company_name} />
                      <DetailRow label="KvK" value={lead.kvk} />
                      <DetailRow label="Website" value={lead.website} />
                      <DetailRow label="Sector" value={lead.sector} />
                      <DetailRow label="Contactpersoon" value={[lead.contact_name, lead.contact_role].filter(Boolean).join(" · ")} />
                      <DetailRow label="E-mail" value={lead.contact_email} />
                      <DetailRow label="Telefoon" value={lead.contact_phone} />
                    </InfoCard>

                    <InfoCard title="Locatie & behoefte" icon={MapPin}>
                      <DetailRow label="Adres" value={address || null} />
                      <DetailRow label="Type locatie" value={lead.location_type ? LOCATION_TYPES[lead.location_type] ?? lead.location_type : null} />
                      <DetailRow label="Laadpunten" value={lead.estimated_charge_points?.toString()} />
                      <DetailRow label="kWh / maand" value={lead.estimated_kwh_per_month ? Math.round(Number(lead.estimated_kwh_per_month)).toLocaleString("nl-NL") : null} />
                      <DetailRow label="Type lader" value={lead.charger_type} />
                      <DetailRow label="Parkeerplaatsen" value={lead.parking_spaces?.toString()} />
                      <DetailRow label="Eigenaar pand" value={lead.owns_property ? "Ja" : "Nee"} />
                      <DetailRow label="Zonnepanelen" value={lead.has_solar ? "Ja" : "Nee"} />
                    </InfoCard>

                    <InfoCard
                      title="Afspraak (bezoek)"
                      icon={CalendarClock}
                      action={!apptEditing ? (
                        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setApptEditing(true)}>
                          {lead.appointment_at ? "Wijzigen" : "Plan afspraak"}
                        </button>
                      ) : undefined}
                    >
                      {apptEditing ? (
                        <AppointmentEditor key={lead.id} leadId={lead.id} initialAt={lead.appointment_at} initialNotes={lead.appointment_notes} updateLead={updateLead} onClose={() => setApptEditing(false)} />
                      ) : lead.appointment_at ? (
                        <>
                          <DetailRow label="Datum & tijd" value={new Date(lead.appointment_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })} />
                          {lead.appointment_notes && <p className="pt-2 text-sm text-foreground">{lead.appointment_notes}</p>}
                        </>
                      ) : <p className="py-1 text-sm text-muted-foreground">Nog geen afspraak gepland.</p>}
                    </InfoCard>

                    <InfoCard title="Voorstel" icon={FileText} action={<button className="text-xs font-medium text-primary hover:underline" onClick={makeOffer}>+ Offerte</button>}>
                      <DetailRow label="Configuratie" value={hasConfiguration ? `Opgeslagen${lead.configuration_updated_at ? ` · ${new Date(lead.configuration_updated_at).toLocaleDateString("nl-NL")}` : ""}` : "Nog niet"} />
                      <div className="space-y-1.5 pt-2">
                        {(quotes.data ?? []).map((q) => {
                          const st = QUOTE_STATUS[q.status] ?? { label: q.status, cls: "bg-muted text-muted-foreground" };
                          const total = (Number(q.total_hardware_cost) || 0) + (Number(q.total_installation_cost) || 0);
                          return (
                            <button key={q.id} onClick={() => { onOpenChange(false); navigate(`/sales/offertes?quote=${q.id}`); }} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/40">
                              <span className="font-medium tabular-nums">{q.quote_number}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                              <span className="ml-auto tabular-nums text-muted-foreground">{euro(total)}</span>
                            </button>
                          );
                        })}
                        {quotes.data?.length === 0 && <p className="text-xs text-muted-foreground">Nog geen offertes.</p>}
                      </div>
                    </InfoCard>

                    <InfoCard title="Sales" icon={Euro}>
                      <DetailRow label="Eigenaar" value={ownerName(lead.owner_user_id)} />
                      <DetailRow label="Prioriteit" value={prio.label} />
                      <DetailRow label="Geschatte waarde" value={euro(lead.estimated_value)} />
                      <DetailRow label="Verwachte sluitdatum" value={lead.expected_close_date ? new Date(lead.expected_close_date).toLocaleDateString("nl-NL") : null} />
                      <DetailRow label="Bron" value={lead.source} />
                    </InfoCard>

                    {lead.notes && (
                      <InfoCard title="Notitie" icon={FileText}>
                        <p className="text-sm text-foreground">{lead.notes}</p>
                      </InfoCard>
                    )}
                  </>
                )}
              </TabsContent>

              {/* TO-DO'S */}
              <TabsContent value="tasks" className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nieuwe taak…" value={newTask} onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) { addTask.mutate({ leadId: lead.id, organizationId: lead.organization_id, title: newTask.trim() }); setNewTask(""); } }}
                  />
                  <Button size="icon" onClick={() => { if (!newTask.trim()) return; addTask.mutate({ leadId: lead.id, organizationId: lead.organization_id, title: newTask.trim() }); setNewTask(""); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {tasks.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />) : (
                    <>
                      {(tasks.data ?? []).map((t) => (
                        <div key={t.id} className="group flex items-center gap-2 rounded-lg border p-2">
                          <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: lead.id })} />
                          <span className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</span>
                          {t.due_date && <span className="text-[11px] text-muted-foreground">{new Date(t.due_date).toLocaleDateString("nl-NL")}</span>}
                          <button className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => deleteTask.mutate({ id: t.id, leadId: lead.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {tasks.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nog geen to-do's.</p>}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* ACTIVITEIT */}
              <TabsContent value="activity" className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Notitie plaatsen…" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
                  <Button variant="outline" onClick={addNote} disabled={!newNote.trim()}>Plaats</Button>
                </div>
                <div className="space-y-3">
                  {activities.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />) : (
                    <>
                      {(activities.data ?? []).map((a) => (
                        <div key={a.id} className="flex gap-3 text-sm">
                          <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary/60" />
                          <div className="flex-1">
                            <p className="text-foreground">{a.description || ACTIVITY_LABEL[a.type] || a.type}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("nl-NL")}</p>
                          </div>
                        </div>
                      ))}
                      {activities.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Geen activiteit.</p>}
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bevestigingsdialogen */}
      <AlertDialog open={confirmConvert} onOpenChange={setConfirmConvert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Omzetten naar klant?</AlertDialogTitle>
            <AlertDialogDescription>
              "{lead.company_name}" wordt aangemaakt als klant (status actief){hasConfiguration ? " met exact de opgeslagen configuratie" : ""} en de lead gaat naar de Gewonnen-fase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={doConvert}>Converteer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lead verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Dit verwijdert de lead met al zijn to-do's en activiteit. Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={removeLead} className="bg-red-600 hover:bg-red-700">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>Je hebt wijzigingen die nog niet zijn opgeslagen. Wat wil je doen?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Terug</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setConfirmClose(false); setDirty(false); onOpenChange(false); }}>Weggooien</Button>
            <AlertDialogAction onClick={async () => { await saveOverview(); setConfirmClose(false); onOpenChange(false); }}>Opslaan &amp; sluiten</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Lees-helpers ----------------------------------------------------------
function InfoCard({ title, icon: Icon, action, children }: { title: string; icon: typeof Building2; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="portal-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="cockpit-section-label flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
function Stat({ icon: Icon, label, value }: { icon: typeof Euro; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-[11px]">{label}</span></div>
      <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ---- Inline afspraak-editor (plannen/wijzigen zonder de volledige bewerkmodus) ----
function AppointmentEditor({ leadId, initialAt, initialNotes, updateLead, onClose }: {
  leadId: string;
  initialAt: string | null;
  initialNotes: string | null;
  updateLead: ReturnType<typeof useUpdateLead>;
  onClose: () => void;
}) {
  const [at, setAt] = useState(initialAt ? toLocalInput(initialAt) : "");
  const [notes, setNotes] = useState(initialNotes ?? "");

  const save = async () => {
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { appointment_at: at ? new Date(at).toISOString() : null, appointment_notes: notes.trim() || null } });
      toast.success("Afspraak opgeslagen");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };
  const clear = async () => {
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { appointment_at: null, appointment_notes: null } });
      toast.success("Afspraak verwijderd");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <Label className="text-xs">Datum &amp; tijd</Label>
        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Opname / situatie-notities</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Meterkast, aansluiting, bijzonderheden…" />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <Button size="sm" onClick={save} disabled={updateLead.isPending || !at}>{updateLead.isPending ? "Opslaan…" : "Opslaan"}</Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={updateLead.isPending}>Annuleren</Button>
        {initialAt && (
          <button type="button" className="ml-auto text-xs font-medium text-destructive hover:underline disabled:opacity-50" disabled={updateLead.isPending} onClick={clear}>Verwijderen</button>
        )}
      </div>
    </div>
  );
}

// ---- Bewerk-formulier (alleen in bewerkmodus) ------------------------------
function EditForm({ lead, form, set, text, updateLead }: {
  lead: LeadWithTasks;
  form: Record<string, string | boolean | null>;
  set: (k: string) => (v: string | boolean) => void;
  text: (k: string) => string;
  updateLead: ReturnType<typeof useUpdateLead>;
}) {
  return (
    <>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bedrijf</p>
        <CompanyPicker value={lead.company_id} valueLabel={lead.company_name} onChange={(id) => updateLead.mutate({ id: lead.id, patch: { company_id: id } })} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="KvK"><Input value={text("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>
          <Field label="Website"><Input value={text("website")} onChange={(e) => set("website")(e.target.value)} /></Field>
          <Field label="Sector"><Input value={text("sector")} onChange={(e) => set("sector")(e.target.value)} /></Field>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Contactpersoon</p>
        <PersonPicker value={lead.person_id} valueLabel={lead.contact_name} companyId={lead.company_id} onChange={(id) => updateLead.mutate({ id: lead.id, patch: { person_id: id } })} />
        {(lead.contact_email || lead.contact_phone) && <p className="mt-1.5 text-xs text-muted-foreground">{[lead.contact_email, lead.contact_phone].filter(Boolean).join(" · ")}</p>}
      </div>
      <Section title="Locatie">
        <Field label="Straat"><Input value={text("address_street")} onChange={(e) => set("address_street")(e.target.value)} /></Field>
        <Field label="Postcode"><Input value={text("postal_code")} onChange={(e) => set("postal_code")(e.target.value)} /></Field>
        <Field label="Plaats"><Input value={text("city")} onChange={(e) => set("city")(e.target.value)} /></Field>
        <Field label="Type locatie">
          <Select value={text("location_type")} onValueChange={set("location_type")}>
            <SelectTrigger><SelectValue placeholder="Kies…" /></SelectTrigger>
            <SelectContent>{Object.entries(LOCATION_TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </Section>
      <Section title="Behoefte">
        <Field label="Laadpunten"><Input inputMode="numeric" value={text("estimated_charge_points")} onChange={(e) => set("estimated_charge_points")(e.target.value)} /></Field>
        <Field label="kWh / maand"><Input inputMode="decimal" value={text("estimated_kwh_per_month")} onChange={(e) => set("estimated_kwh_per_month")(e.target.value)} /></Field>
        <Field label="Type lader (AC/DC)"><Input value={text("charger_type")} onChange={(e) => set("charger_type")(e.target.value)} /></Field>
        <Field label="Parkeerplaatsen"><Input inputMode="numeric" value={text("parking_spaces")} onChange={(e) => set("parking_spaces")(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.owns_property} onCheckedChange={(c) => set("owns_property")(!!c)} /> Eigenaar van het pand</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.has_solar} onCheckedChange={(c) => set("has_solar")(!!c)} /> Zonnepanelen aanwezig</label>
      </Section>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Afspraak (bezoek)</p>
        <div className="space-y-2">
          <Field label="Datum & tijd"><Input type="datetime-local" value={text("appointment_at")} onChange={(e) => set("appointment_at")(e.target.value)} /></Field>
          <Field label="Opname / situatie-notities"><Textarea rows={3} value={text("appointment_notes")} onChange={(e) => set("appointment_notes")(e.target.value)} placeholder="Meterkast, aansluiting, bijzonderheden…" /></Field>
        </div>
      </div>
      <Section title="Sales">
        <Field label="Geschatte waarde (€)"><Input inputMode="decimal" value={text("estimated_value")} onChange={(e) => set("estimated_value")(e.target.value)} /></Field>
        <Field label="Verwachte sluitdatum"><Input type="date" value={text("expected_close_date")} onChange={(e) => set("expected_close_date")(e.target.value)} /></Field>
        <Field label="Prioriteit">
          <Select value={text("priority")} onValueChange={set("priority")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Laag</SelectItem>
              <SelectItem value="medium">Gemiddeld</SelectItem>
              <SelectItem value="high">Hoog</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>
      <div className="space-y-1.5">
        <Label className="text-xs">Notitie</Label>
        <Textarea rows={3} value={text("notes")} onChange={(e) => set("notes")(e.target.value)} />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
