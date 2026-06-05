import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Plus, Trash2, Trophy, UserPlus, WandSparkles, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccessBeheer } from "@/lib/workspaces";
import {
  useLeadTasks,
  useLeadActivities,
  useUpdateLead,
  useDeleteLead,
  useAddTask,
  useToggleTask,
  useDeleteTask,
  useConvertLeadToClient,
  type LeadStage,
  type LeadWithTasks,
} from "@/hooks/useLeads";

const LOCATION_TYPES = [
  { value: "workplace", label: "Werkplek" },
  { value: "destination", label: "Bestemming" },
  { value: "fleet", label: "Vloot/depot" },
  { value: "public", label: "Publiek" },
  { value: "other", label: "Anders" },
];

const ACTIVITY_LABEL: Record<string, string> = {
  created: "Aangemaakt",
  stage_change: "Fase gewijzigd",
  note: "Notitie",
  converted: "Geconverteerd",
};

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function LeadDetailSheet({
  lead,
  open,
  onOpenChange,
  stages,
  profiles,
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
  const addTask = useAddTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const tasks = useLeadTasks(open ? lead?.id : undefined);
  const activities = useLeadActivities(open ? lead?.id : undefined);

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newNote, setNewNote] = useState("");

  // Init alleen wanneer een ándere lead wordt geopend (lead.id), niet bij elke
  // achtergrond-refetch → typen in Overzicht blijft behouden.
  useEffect(() => {
    if (lead) {
      setForm({
        company_name: lead.company_name ?? "",
        kvk: lead.kvk ?? "",
        website: lead.website ?? "",
        sector: lead.sector ?? "",
        contact_name: lead.contact_name ?? "",
        contact_role: lead.contact_role ?? "",
        contact_email: lead.contact_email ?? "",
        contact_phone: lead.contact_phone ?? "",
        address_street: lead.address_street ?? "",
        postal_code: lead.postal_code ?? "",
        city: lead.city ?? "",
        location_type: lead.location_type ?? "",
        estimated_charge_points: lead.estimated_charge_points?.toString() ?? "",
        estimated_kwh_per_month: lead.estimated_kwh_per_month?.toString() ?? "",
        charger_type: lead.charger_type ?? "",
        parking_spaces: lead.parking_spaces?.toString() ?? "",
        owns_property: lead.owns_property ?? false,
        has_solar: lead.has_solar ?? false,
        estimated_value: lead.estimated_value?.toString() ?? "",
        expected_close_date: lead.expected_close_date ?? "",
        priority: lead.priority ?? "medium",
        notes: lead.notes ?? "",
      });
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  if (!lead) return null;
  const set = (k: string) => (v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const text = (k: string) => (form[k] as string) ?? "";
  const ownerName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? null;
  const canBeheer = canAccessBeheer(role);

  const saveOverview = async () => {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: {
          company_name: text("company_name").trim() || lead.company_name,
          kvk: text("kvk").trim() || null,
          website: text("website").trim() || null,
          sector: text("sector").trim() || null,
          contact_name: text("contact_name").trim() || null,
          contact_role: text("contact_role").trim() || null,
          contact_email: text("contact_email").trim() || null,
          contact_phone: text("contact_phone").trim() || null,
          address_street: text("address_street").trim() || null,
          postal_code: text("postal_code").trim() || null,
          city: text("city").trim() || null,
          location_type: text("location_type") || null,
          estimated_charge_points: text("estimated_charge_points") ? Math.round(num(text("estimated_charge_points")) ?? 0) : null,
          estimated_kwh_per_month: num(text("estimated_kwh_per_month")),
          charger_type: text("charger_type").trim() || null,
          parking_spaces: text("parking_spaces") ? Math.round(num(text("parking_spaces")) ?? 0) : null,
          owns_property: form.owns_property as boolean,
          has_solar: form.has_solar as boolean,
          estimated_value: num(text("estimated_value")),
          expected_close_date: text("expected_close_date") || null,
          priority: text("priority") || "medium",
          notes: text("notes").trim() || null,
        },
      });
      setDirty(false);
      toast.success("Lead opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const moveToStage = (stageId: string) => updateLead.mutate({ id: lead.id, patch: { stage_id: stageId } });
  const setOwner = (id: string) => updateLead.mutate({ id: lead.id, patch: { owner_user_id: id === "none" ? null : id } });
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  const doConvert = async () => {
    try {
      const client = await convert.mutateAsync({ lead, wonStageId: wonStage?.id });
      toast.success(`Klant${client.client_number ? ` #${client.client_number}` : ""} aangemaakt`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Converteren mislukt");
    }
  };

  // Start de configurator vóórgevuld met de leadgegevens (geen dubbele invoer).
  const launchConfigurator = async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string }>("configurator-session-start", {
        body: { lead_id: lead.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Geen sessie-URL ontvangen");
      window.open(data.url, "_blank", "noopener,noreferrer,width=1400,height=900");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Configurator starten mislukt");
    }
  };

  const removeLead = async () => {
    await deleteLead.mutateAsync(lead.id);
    toast.success("Lead verwijderd");
    onOpenChange(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      organization_id: lead.organization_id,
      user_id: u.user?.id ?? null,
      type: "note",
      description: newNote.trim(),
    });
    if (error) {
      toast.error("Notitie plaatsen mislukt");
      return;
    }
    setNewNote("");
    qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-xl">{lead.company_name}</SheetTitle>
          </SheetHeader>

          {/* Snelle acties */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fase</Label>
              <Select value={lead.stage_id ?? ""} onValueChange={moveToStage}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Eigenaar</Label>
              <Select value={lead.owner_user_id ?? "none"} onValueChange={setOwner}>
                <SelectTrigger className="h-9"><SelectValue>{ownerName(lead.owner_user_id) ?? "Niemand"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Niemand</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {wonStage && (
              <Button size="sm" variant="outline" className="text-green-600" onClick={() => moveToStage(wonStage.id)}>
                <Trophy className="mr-1.5 h-4 w-4" /> Gewonnen
              </Button>
            )}
            {lostStage && (
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => moveToStage(lostStage.id)}>
                <XCircle className="mr-1.5 h-4 w-4" /> Verloren
              </Button>
            )}
            {lead.converted_client_id ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Klant aangemaakt
                </span>
                {canBeheer && (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/klanten/${lead.converted_client_id}`)}>
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Bekijk klant
                  </Button>
                )}
              </>
            ) : (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={convert.isPending}>
                      <UserPlus className="mr-1.5 h-4 w-4" /> Converteer naar klant
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Omzetten naar klant?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{lead.company_name}" wordt aangemaakt als klant (status actief) en de lead gaat naar de Gewonnen-fase.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                      <AlertDialogAction onClick={doConvert}>Converteer</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" variant="outline" onClick={launchConfigurator}>
                  <WandSparkles className="mr-1.5 h-4 w-4" /> Start configurator
                </Button>
              </>
            )}
          </div>

          <Tabs defaultValue="overview" className="mt-5">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overzicht</TabsTrigger>
              <TabsTrigger value="tasks">To-do's{tasks.data ? ` (${tasks.data.filter((t) => !t.done).length})` : ""}</TabsTrigger>
              <TabsTrigger value="activity">Activiteit</TabsTrigger>
            </TabsList>

            {/* OVERZICHT */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <Section title="Bedrijf">
                <Field label="Bedrijfsnaam"><Input value={text("company_name")} onChange={(e) => set("company_name")(e.target.value)} /></Field>
                <Field label="KvK"><Input value={text("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>
                <Field label="Website"><Input value={text("website")} onChange={(e) => set("website")(e.target.value)} /></Field>
                <Field label="Sector"><Input value={text("sector")} onChange={(e) => set("sector")(e.target.value)} /></Field>
              </Section>
              <Section title="Contact">
                <Field label="Naam"><Input value={text("contact_name")} onChange={(e) => set("contact_name")(e.target.value)} /></Field>
                <Field label="Functie"><Input value={text("contact_role")} onChange={(e) => set("contact_role")(e.target.value)} /></Field>
                <Field label="E-mail"><Input value={text("contact_email")} onChange={(e) => set("contact_email")(e.target.value)} /></Field>
                <Field label="Telefoon"><Input value={text("contact_phone")} onChange={(e) => set("contact_phone")(e.target.value)} /></Field>
              </Section>
              <Section title="Locatie">
                <Field label="Straat"><Input value={text("address_street")} onChange={(e) => set("address_street")(e.target.value)} /></Field>
                <Field label="Postcode"><Input value={text("postal_code")} onChange={(e) => set("postal_code")(e.target.value)} /></Field>
                <Field label="Plaats"><Input value={text("city")} onChange={(e) => set("city")(e.target.value)} /></Field>
                <Field label="Type locatie">
                  <Select value={text("location_type")} onValueChange={set("location_type")}>
                    <SelectTrigger><SelectValue placeholder="Kies…" /></SelectTrigger>
                    <SelectContent>{LOCATION_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
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
                <Label className="text-xs">Notities</Label>
                <Textarea rows={3} value={text("notes")} onChange={(e) => set("notes")(e.target.value)} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-red-600"><Trash2 className="mr-1.5 h-4 w-4" />Verwijderen</Button>
                  </AlertDialogTrigger>
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
                <Button onClick={saveOverview} disabled={updateLead.isPending || !dirty}>
                  {updateLead.isPending ? "Opslaan…" : dirty ? "Opslaan •" : "Opgeslagen"}
                </Button>
              </div>
            </TabsContent>

            {/* TO-DO'S */}
            <TabsContent value="tasks" className="mt-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Nieuwe taak…"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTask.trim()) {
                      addTask.mutate({ leadId: lead.id, organizationId: lead.organization_id, title: newTask.trim() });
                      setNewTask("");
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={() => {
                    if (!newTask.trim()) return;
                    addTask.mutate({ leadId: lead.id, organizationId: lead.organization_id, title: newTask.trim() });
                    setNewTask("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                {tasks.isLoading ? (
                  [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
                ) : (
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
                <Input
                  placeholder="Notitie plaatsen…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addNote();
                  }}
                />
                <Button variant="outline" onClick={addNote} disabled={!newNote.trim()}>Plaats</Button>
              </div>
              <div className="space-y-3">
                {activities.isLoading ? (
                  [0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)
                ) : (
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
        </SheetContent>
      </Sheet>

      {/* Niet-opgeslagen wijzigingen bij sluiten */}
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
