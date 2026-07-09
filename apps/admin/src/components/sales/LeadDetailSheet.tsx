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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Building2, Euro, ExternalLink, FileText, MapPin, MessageSquare, MoreHorizontal,
  Pencil, Plus, Tag, Trash2, Trophy, UserPlus, WandSparkles, XCircle, Zap,
} from "lucide-react";
import { useCreateQuoteFromLead, useLeadQuotes, rejectCategoryLabel } from "@/hooks/useQuotes";
import { ObjectSelectDialog } from "@/components/contacts/ObjectSelectDialog";
import { ObjectCreateDialog } from "@/components/contacts/ObjectCreateDialog";
import { ObjectDetailSheet } from "@/components/contacts/ObjectDetailSheet";
import { useProjectLocationsByLead } from "@/hooks/useProjectLocations";
import { formatObjectAddress } from "@/lib/objectLabel";
import { LeadTagPicker } from "@/components/sales/LeadTagPicker";
import { MarkLostDialog } from "@/components/sales/MarkLostDialog";
import { useSetLeadTags } from "@/hooks/useLeadTags";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccessBeheer } from "@/lib/workspaces";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { CompanyFields } from "@/components/contacts/CompanyFields";
import { PersonFields } from "@/components/contacts/PersonFields";
import {
  useLeadTasks, useLeadActivities, useUpdateLead, useDeleteLead, useAddTask, useToggleTask,
  useDeleteTask, useUpdateTask, useConvertLeadToClient, type LeadStage, type LeadWithTasks,
} from "@/hooks/useLeads";
import { scopeFromFlags, SCOPES, SCOPE_LABEL } from "@/lib/quoteScope";
import { useAvgRevenuePerChargePoint } from "@/hooks/useAdminData";
import { leadMgmtYearEstimate, leadQuoteValue } from "@/lib/leadEstimate";

const LOCATION_TYPES: Record<string, string> = {
  workplace: "Werkplek", destination: "Bestemming", fleet: "Vloot/depot", public: "Publiek", other: "Anders",
};
const ACTIVITY_LABEL: Record<string, string> = {
  created: "Aangemaakt", stage_change: "Fase gewijzigd", note: "Notitie", converted: "Geconverteerd",
  quote_sent: "Offerte verstuurd", quote_accepted: "Offerte geaccordeerd",
};
const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "bg-zinc-100 text-zinc-600" },
  intern_ter_ondertekening: { label: "Ter ondertekening", cls: "bg-blue-100 text-blue-700" },
  verstuurd: { label: "Verstuurd", cls: "bg-amber-100 text-amber-700" },
  getekend: { label: "Getekend", cls: "bg-green-100 text-green-700" },
  verlopen: { label: "Verlopen", cls: "bg-zinc-100 text-zinc-500" },
  afgewezen: { label: "Afgewezen", cls: "bg-red-100 text-red-700" },
  vervangen: { label: "Vervangen", cls: "bg-zinc-100 text-zinc-500" },
};

const euro = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
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
  const setLeadTags = useSetLeadTags();
  const [objectDialogOpen, setObjectDialogOpen] = useState(false);
  const [objectCreateOpen, setObjectCreateOpen] = useState(false);
  const addTask = useAddTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const tasks = useLeadTasks(open ? lead?.id : undefined);
  const activities = useLeadActivities(open ? lead?.id : undefined);
  const quotes = useLeadQuotes(open ? lead?.id : undefined);
  const leadObjects = useProjectLocationsByLead(open ? lead?.id : undefined);
  const { data: avgPerPaal } = useAvgRevenuePerChargePoint();

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [lostDialogStage, setLostDialogStage] = useState<string | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("none");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [objectDetailId, setObjectDetailId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const buildForm = (l: LeadWithTasks): Record<string, string | boolean | null> => {
    const cfg = (l.configuration as unknown as LeadConfig | null) ?? null;
    const ci = cfg?.pricing_input ?? {};
    return {
      // kvk/website/sector/adres zijn bedrijfs-eigendom → bewerkt via de bedrijfstap (CompanyFields),
      // niet meer als lead-veld. De inline-cache op de lead volgt automatisch via de propagate-trigger.
      location_type: l.location_type ?? "",
      scope: l.scope ?? "",
      estimated_charge_points: l.estimated_charge_points?.toString() ?? "",
      estimated_kwh_per_month: l.estimated_kwh_per_month?.toString() ?? "",
      charger_type: l.charger_type ?? "", parking_spaces: l.parking_spaces?.toString() ?? "",
      owns_property: l.owns_property ?? false, has_solar: l.has_solar ?? false,
      notes: l.notes ?? "",
      message_subject: l.message_subject ?? "", message_body: l.message_body ?? "",
      // Configuratie-instellingen (ook bewerkbaar zonder dat er al een configuratie is).
      cfg_charge_points: ci.hardware?.chargePoints?.toString() ?? "",
      cfg_sockets: ci.hardware?.socketsPerChargePoint?.toString() ?? "",
      cfg_location_type: ci.customer?.locationType ?? l.location_type ?? "",
      cfg_kwh: ci.usage?.kwhPerChargePointMonth?.toString() ?? "",
      cfg_sessions: ci.usage?.sessionsPerChargePointMonth?.toString() ?? "",
      cfg_power: ci.usage?.effectiveChargingPowerKw?.toString() ?? "",
      cfg_charge_tariff: ci.tariffs?.chargeTariffPerKwh?.toString() ?? "",
      cfg_start_enabled: ci.tariffs?.startFeeEnabled ?? false,
      cfg_start_fee: ci.tariffs?.startFeePerSession?.toString() ?? "",
      cfg_idle_enabled: ci.tariffs?.idleFeeEnabled ?? false,
      cfg_idle_fee: ci.tariffs?.idleFeePerMinute?.toString() ?? "",
      cfg_idle_grace: ci.tariffs?.idleGraceMinutes?.toString() ?? "",
      cfg_duration: ci.contract?.durationMonths?.toString() ?? "",
      cfg_notice: ci.contract?.noticePeriodMonths?.toString() ?? "",
      cfg_ere: cfg?.ere ?? false,
    };
  };

  useEffect(() => {
    if (lead) { setForm(buildForm(lead)); setDirty(false); setIsEditing(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // Tags synchroniseren met de lead (incl. na opslaan/refetch).
  useEffect(() => {
    if (lead) setTagIds((lead.lead_tag_links ?? []).map((l) => l.tag_id));
  }, [lead]);

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
  const addNewTask = () => {
    const title = newTask.trim();
    if (!title) return;
    addTask.mutate({ leadId: lead.id, organizationId: lead.organization_id, title, assignedTo: newTaskAssignee === "none" ? null : newTaskAssignee, dueDate: newTaskDue || null });
    setNewTask(""); setNewTaskDue("");
  };
  const canBeheer = canAccessBeheer(role);
  const stageIdx = stages.findIndex((s) => s.id === lead.stage_id);
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);
  const hasConfiguration = !!lead.configuration;
  // Geschatte jaarlijkse beheeropbrengst = gem. service-fee-omzet per paal × aantal palen
  // op de offerte, alleen wanneer beheer in scope zit (gedeelde helper, gelijk aan kaart + pijplijn).
  const leadMgmtYear = leadMgmtYearEstimate(lead, avgPerPaal?.value);
  const leadQuoteVal = leadQuoteValue(lead);

  const saveOverview = async () => {
    const intOf = (k: string) => { const n = num(text(k)); return n == null ? null : Math.round(n); };
    const numOf = (k: string) => num(text(k));
    const existingCfg = (lead.configuration as unknown as LeadConfig | null) ?? null;
    const cfgKeys = ["cfg_charge_points", "cfg_sockets", "cfg_kwh", "cfg_sessions", "cfg_power", "cfg_charge_tariff", "cfg_start_fee", "cfg_idle_fee", "cfg_idle_grace", "cfg_duration", "cfg_notice"];
    const hasCfg = !!existingCfg || !!form.cfg_ere || !!form.cfg_start_enabled || !!form.cfg_idle_enabled || !!text("cfg_location_type") || cfgKeys.some((k) => text(k).trim() !== "");
    // Sla de install-instellingen op in lead.configuration (pricing_input); bestaande
    // configurator-data (pricing_result e.d.) blijft behouden. Zo kun je deze ook
    // zonder een doorlopen configurator vastleggen.
    const configuration = hasCfg ? {
      ...(existingCfg ?? {}),
      ere: !!form.cfg_ere,
      pricing_input: {
        ...(existingCfg?.pricing_input ?? {}),
        hardware: { ...(existingCfg?.pricing_input?.hardware ?? {}), chargePoints: intOf("cfg_charge_points"), socketsPerChargePoint: intOf("cfg_sockets") },
        usage: { ...(existingCfg?.pricing_input?.usage ?? {}), kwhPerChargePointMonth: numOf("cfg_kwh"), sessionsPerChargePointMonth: intOf("cfg_sessions"), effectiveChargingPowerKw: numOf("cfg_power") },
        tariffs: { ...(existingCfg?.pricing_input?.tariffs ?? {}), chargeTariffPerKwh: numOf("cfg_charge_tariff"), startFeeEnabled: !!form.cfg_start_enabled, startFeePerSession: numOf("cfg_start_fee"), idleFeeEnabled: !!form.cfg_idle_enabled, idleFeePerMinute: numOf("cfg_idle_fee"), idleGraceMinutes: intOf("cfg_idle_grace") },
        contract: { ...(existingCfg?.pricing_input?.contract ?? {}), durationMonths: intOf("cfg_duration"), noticePeriodMonths: intOf("cfg_notice") },
        customer: { ...(existingCfg?.pricing_input?.customer ?? {}), locationType: text("cfg_location_type") || null },
      },
    } : null;
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: {
          location_type: text("location_type") || null,
          scope: text("scope") || null,
          estimated_charge_points: text("estimated_charge_points") ? Math.round(num(text("estimated_charge_points")) ?? 0) : null,
          estimated_kwh_per_month: num(text("estimated_kwh_per_month")),
          charger_type: text("charger_type").trim() || null,
          parking_spaces: text("parking_spaces") ? Math.round(num(text("parking_spaces")) ?? 0) : null,
          owns_property: form.owns_property as boolean, has_solar: form.has_solar as boolean,
          notes: text("notes").trim() || null,
          message_subject: text("message_subject").trim() || null, message_body: text("message_body").trim() || null,
          configuration: configuration as unknown as never,
          configuration_updated_at: configuration ? new Date().toISOString() : lead.configuration_updated_at,
        },
      });
      setDirty(false); setIsEditing(false);
      toast.success("Lead opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const cancelEdit = () => { setForm(buildForm(lead)); setDirty(false); setIsEditing(false); };
  const moveToStage = (stageId: string) => updateLead.mutate({ id: lead.id, patch: { stage_id: stageId } });
  // Naar een 'Verloren'-fase mag alleen met een reden (DB-guard) → open de dialog i.p.v. direct verplaatsen.
  const requestMoveToStage = (stageId: string) => {
    const target = stages.find((s) => s.id === stageId);
    if (target?.is_lost) { setLostDialogStage(stageId); return; }
    moveToStage(stageId);
  };
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
  const makeOffer = () => setObjectDialogOpen(true);
  const confirmObject = async (projectLocationId: string | null) => {
    try {
      const { quoteId } = await createQuote.mutateAsync({ leadId: lead.id, projectLocationId });
      toast.success("Offerte aangemaakt");
      setObjectDialogOpen(false);
      onOpenChange(false);
      // Eerst de interne calculatie (overslaanbaar), dan het opstelscherm
      navigate(`/sales/offertes/${quoteId}/calculatie`);
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
  const removeLead = async () => {
    try {
      await deleteLead.mutateAsync(lead.id);
      toast.success("Lead verwijderd");
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      // Bv. de guard bij een getekende offerte — toon de melding i.p.v. stil falen.
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
      setConfirmDelete(false);
    }
  };
  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: lead.id, organization_id: lead.organization_id, user_id: u.user?.id ?? null, type: "note", description: newNote.trim(),
    });
    if (error) { toast.error("Notitie plaatsen mislukt"); return; }
    setNewNote(""); qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
  };

  // Terugval-adres (lead-cache, incl. huisnummer) voor leads zonder gekoppeld object.
  const leadAddress = (lead.address_street || lead.postal_code || lead.city) ? formatObjectAddress(lead) : null;

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
                        <DropdownMenuItem onClick={() => setObjectCreateOpen(true)}><MapPin className="mr-2 h-4 w-4" />Object toevoegen</DropdownMenuItem>
                        {lead.converted_client_id && canBeheer && <DropdownMenuItem onClick={() => navigate(`/admin/klanten/${lead.converted_client_id}`)}><ExternalLink className="mr-2 h-4 w-4" />Bekijk klant</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        {wonStage && <DropdownMenuItem onClick={() => moveToStage(wonStage.id)}><Trophy className="mr-2 h-4 w-4 text-green-600" />Markeer gewonnen</DropdownMenuItem>}
                        {lostStage && <DropdownMenuItem onClick={() => requestMoveToStage(lostStage.id)}><XCircle className="mr-2 h-4 w-4 text-red-600" />Markeer verloren</DropdownMenuItem>}
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
                          onClick={() => requestMoveToStage(s.id)}
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
                            onClick={() => requestMoveToStage(s.id)}
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
              <Stat icon={Euro} label="Offerte waarde" value={leadQuoteVal > 0 ? (euro(leadQuoteVal) ?? "—") : "—"} />
              <Stat icon={Euro} label="Beheeropbrengst/jr" value={leadMgmtYear != null ? `≈ ${euro(leadMgmtYear)}` : "—"} />
              <Stat icon={Zap} label="Laadpunten" value={lead.estimated_charge_points?.toString() ?? "—"} />
              <Stat icon={Zap} label="kWh / mnd" value={lead.estimated_kwh_per_month ? Math.round(Number(lead.estimated_kwh_per_month)).toLocaleString("nl-NL") : "—"} />
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overzicht</TabsTrigger>
                <TabsTrigger value="tasks">To-do's{tasks.data ? ` (${tasks.data.filter((t) => !t.done).length})` : ""}</TabsTrigger>
                <TabsTrigger value="activity">Activiteit</TabsTrigger>
              </TabsList>

              {/* OVERZICHT */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Uitvoerlocatie = het object = het uitvoeringsadres. Belangrijkste → bovenaan, zichtbaar in view én bewerken. */}
                <InfoCard title="Uitvoerlocatie" icon={MapPin} action={<button className="text-xs font-medium text-primary hover:underline" onClick={() => setObjectCreateOpen(true)}>+ Object</button>}>
                  <div className="space-y-1.5">
                    {(leadObjects.data ?? []).map((o) => (
                      <button key={o.id} onClick={() => setObjectDetailId(o.id)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/40">
                        <span className="font-medium tabular-nums">{o.location_number}</span>
                        <span className="truncate">{formatObjectAddress(o)}</span>
                        {o.folder_web_url
                          ? <a href={o.folder_web_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0 text-[11px] text-primary hover:underline">map</a>
                          : <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">map volgt…</span>}
                      </button>
                    ))}
                    {leadObjects.data?.length === 0 && (leadAddress
                      ? <p className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">{leadAddress}<span className="ml-1.5 text-[11px]">(nog geen object — koppel via "+ Object")</span></p>
                      : <p className="text-xs text-muted-foreground">Nog geen object/uitvoeradres gekoppeld.</p>)}
                  </div>
                </InfoCard>
                {isEditing ? (
                  <EditForm lead={lead} form={form} set={set} text={text} updateLead={updateLead} onLaunchConfigurator={launchConfigurator} />
                ) : (
                  <>
                    {/* Een lead is een kans bovenop contacten — toon waar 'ie aan hangt + doorklik naar het dossier. */}
                    <InfoCard title="Koppelingen" icon={Building2}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {lead.company_id
                              ? <span className="truncate"><span className="font-medium text-foreground">{lead.company_name}</span>{lead.kvk ? <span className="ml-1.5 text-[11px] text-muted-foreground">KvK {lead.kvk}</span> : null}</span>
                              : <span className="text-muted-foreground">Bedrijf — niet gekoppeld</span>}
                          </div>
                          {lead.company_id ? <button className="shrink-0 text-xs text-primary hover:underline" onClick={() => { onOpenChange(false); navigate(`/sales/contacten?company=${lead.company_id}`); }}>bekijken →</button> : null}
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {lead.person_id
                              ? <span className="truncate"><span className="font-medium text-foreground">{lead.contact_name}</span>{lead.contact_email ? <span className="ml-1.5 text-[11px] text-muted-foreground">{lead.contact_email}</span> : null}</span>
                              : <span className="text-muted-foreground">Persoon — niet gekoppeld</span>}
                          </div>
                          {lead.person_id ? <button className="shrink-0 text-xs text-primary hover:underline" onClick={() => { onOpenChange(false); navigate(`/sales/contacten?person=${lead.person_id}`); }}>bekijken →</button> : null}
                        </div>
                      </div>
                    </InfoCard>

                    {(lead.message_body || lead.message_subject) && (
                      <InfoCard title="Bericht" icon={MessageSquare}>
                        {lead.message_subject && <p className="text-sm font-semibold text-foreground">{lead.message_subject}</p>}
                        {lead.message_body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{lead.message_body}</p>}
                      </InfoCard>
                    )}

                    <InfoCard title="Locatie & behoefte" icon={MapPin}>
                      <DetailRow label="Type locatie" value={lead.location_type ? LOCATION_TYPES[lead.location_type] ?? lead.location_type : null} />
                      <DetailRow label="Scope" value={lead.scope ? SCOPE_LABEL[lead.scope as keyof typeof SCOPE_LABEL] ?? lead.scope : null} />
                      <DetailRow label="Laadpunten" value={lead.estimated_charge_points?.toString()} />
                      <DetailRow label="kWh / maand" value={lead.estimated_kwh_per_month ? Math.round(Number(lead.estimated_kwh_per_month)).toLocaleString("nl-NL") : null} />
                      <DetailRow label="Type lader" value={lead.charger_type} />
                      <DetailRow label="Parkeerplaatsen" value={lead.parking_spaces?.toString()} />
                      <DetailRow label="Eigenaar pand" value={lead.owns_property ? "Ja" : "Nee"} />
                      <DetailRow label="Zonnepanelen" value={lead.has_solar ? "Ja" : "Nee"} />
                    </InfoCard>

                    <ConfigCard
                      config={lead.configuration as unknown as LeadConfig | null}
                      updatedAt={lead.configuration_updated_at}
                      onEdit={launchConfigurator}
                    />

                    <InfoCard title="Voorstel" icon={FileText} action={<button className="text-xs font-medium text-primary hover:underline" onClick={makeOffer}>+ Offerte</button>}>
                      <div className="space-y-1.5">
                        {(quotes.data ?? []).map((q) => {
                          const st = QUOTE_STATUS[q.status] ?? { label: q.status, cls: "bg-muted text-muted-foreground" };
                          const total = (Number(q.total_hardware_cost) || 0) + (Number(q.total_installation_cost) || 0);
                          // Bij 'alleen beheer' is dit bedrag de eenmalige activatie-/onboardingkost die we
                          // aan de klant factureren — expliciet labelen zodat het in de flow meegaat.
                          const beheerOnly = scopeFromFlags(q.with_installation !== false, q.with_management !== false) === "alleen_beheer";
                          // Revisie-ketting: de nummers van vervanger/bron staan in dezelfde lijst.
                          const byId = new Map((quotes.data ?? []).map((x) => [x.id, x.quote_number]));
                          const supersededBy = q.superseded_by_quote_id ? byId.get(q.superseded_by_quote_id) : null;
                          const revisionOf = q.revision_of_quote_id ? byId.get(q.revision_of_quote_id) : null;
                          // Afwijsreden als tooltip op de (rode) badge.
                          const rejectTip = q.status === "afgewezen"
                            ? `Afgewezen — ${rejectCategoryLabel(q.rejected_reason_category)}${q.rejected_reason ? `: ${q.rejected_reason}` : ""}`
                            : undefined;
                          return (
                            <button key={q.id} onClick={() => { onOpenChange(false); navigate(`/sales/offertes?quote=${q.id}`); }} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/40">
                              <span className="font-medium tabular-nums">{q.quote_number}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`} title={rejectTip}>{st.label}</span>
                              {beheerOnly && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title="Eenmalige activatiekosten, te factureren aan de klant">activatie</span>}
                              {supersededBy && <span className="text-[10px] text-muted-foreground" title="Deze versie is vervangen">→ {supersededBy}</span>}
                              {!supersededBy && revisionOf && <span className="text-[10px] text-muted-foreground" title="Nieuwe versie van een eerdere offerte">revisie van {revisionOf}</span>}
                              <span className="ml-auto tabular-nums text-muted-foreground" title={beheerOnly ? "Eenmalige activatiekosten (te factureren aan de klant)" : undefined}>{euro(total)}</span>
                            </button>
                          );
                        })}
                        {quotes.data?.length === 0 && <p className="text-xs text-muted-foreground">Nog geen offertes.</p>}
                      </div>
                    </InfoCard>

                    <InfoCard title="Sales" icon={Euro}>
                      <DetailRow label="Eigenaar" value={ownerName(lead.owner_user_id)} />
                      <DetailRow label="Offerte waarde" value={leadQuoteVal > 0 ? euro(leadQuoteVal) : null} />
                      <DetailRow label="Geschatte beheeropbrengst / jaar" value={leadMgmtYear != null ? `≈ ${euro(leadMgmtYear)}/jr` : null} />
                    </InfoCard>

                    <InfoCard title="Tags" icon={Tag}>
                      <p className="mb-1.5 text-[11px] text-muted-foreground">Alleen intern (niet zichtbaar voor de klant).</p>
                      <LeadTagPicker
                        value={tagIds}
                        onChange={(ids) => { setTagIds(ids); if (lead) setLeadTags.mutate({ leadId: lead.id, tagIds: ids }); }}
                        organizationId={lead.organization_id}
                      />
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
                <div className="space-y-2 rounded-lg border p-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nieuwe taak…" value={newTask} onChange={(e) => setNewTask(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addNewTask(); }}
                    />
                    <Button size="icon" onClick={addNewTask}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                      <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Niemand toegewezen</SelectItem>
                        {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" className="h-8 w-[150px] text-xs" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {tasks.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />) : (
                    <>
                      {(tasks.data ?? []).map((t) => (
                        <div key={t.id} className="group rounded-lg border p-2">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={t.done} onCheckedChange={(c) => toggleTask.mutate({ id: t.id, done: !!c, leadId: lead.id })} />
                            <span className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</span>
                            <button className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => deleteTask.mutate({ id: t.id, leadId: lead.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 pl-6">
                            <Select value={t.assigned_to ?? "none"} onValueChange={(v) => updateTask.mutate({ id: t.id, patch: { assigned_to: v === "none" ? null : v }, leadId: lead.id })}>
                              <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-[11px] shadow-none focus:ring-0">
                                {t.assigned_to ? <Avatar className="h-4 w-4"><AvatarFallback className="text-[8px]">{initials(ownerName(t.assigned_to))}</AvatarFallback></Avatar> : null}
                                <span className="text-muted-foreground">{ownerName(t.assigned_to) ?? "Niemand"}</span>
                              </SelectTrigger>
                              <SelectContent align="start">
                                <SelectItem value="none">Niemand</SelectItem>
                                {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input type="date" className="h-6 w-[140px] border-0 bg-transparent px-1 text-[11px] text-muted-foreground shadow-none focus-visible:ring-0" value={t.due_date ?? ""} onChange={(e) => updateTask.mutate({ id: t.id, patch: { due_date: e.target.value || null }, leadId: lead.id })} />
                          </div>
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

      <MarkLostDialog
        open={!!lostDialogStage}
        onOpenChange={(v) => !v && setLostDialogStage(null)}
        leadIds={[lead.id]}
        lostStageId={lostDialogStage}
      />

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
          {(() => {
            const qs = quotes.data ?? [];
            const heeftGetekend = qs.some((q) => q.status === "getekend");
            const n = qs.length;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Lead verwijderen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {heeftGetekend ? (
                      <>Deze lead heeft een <strong>getekende offerte</strong> (een echte deal) en kan niet worden verwijderd. Handel dit af via het klantdossier.</>
                    ) : (
                      <>
                        Dit verwijdert de lead met al zijn to-do's en activiteit.
                        {n > 0 && <> Let op: ook <strong>{n} offerte{n === 1 ? "" : "s"}</strong> word{n === 1 ? "t" : "en"} verwijderd.</>}
                        {" "}Dit kan niet ongedaan worden gemaakt.
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  {!heeftGetekend && (
                    <AlertDialogAction onClick={removeLead} className="bg-red-600 hover:bg-red-700">Verwijderen</AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </>
            );
          })()}
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

      <ObjectSelectDialog
        open={objectDialogOpen}
        onClose={() => setObjectDialogOpen(false)}
        lead={{ id: lead.id, organization_id: lead.organization_id, company_id: lead.company_id, company_name: lead.company_name, address_street: lead.address_street, house_number: lead.house_number, postal_code: lead.postal_code, city: lead.city }}
        onConfirm={confirmObject}
        pending={createQuote.isPending}
      />
      <ObjectCreateDialog
        open={objectCreateOpen}
        onClose={() => setObjectCreateOpen(false)}
        onCreated={() => toast.success("Object aangemaakt — SharePoint-map wordt aangemaakt")}
        defaultLead={{ id: lead.id, label: lead.company_name || "Lead" }}
        defaultCompany={lead.company_id ? { id: lead.company_id, label: lead.company_name || "Bedrijf" } : null}
        defaultPerson={lead.person_id ? { id: lead.person_id, label: lead.contact_name || "Contact" } : null}
        defaultAddress={{ street: lead.address_street ?? "", houseNumber: lead.house_number ?? "", postalCode: lead.postal_code ?? "", city: lead.city ?? "" }}
      />
      <ObjectDetailSheet objectId={objectDetailId} open={!!objectDetailId} onOpenChange={(v) => { if (!v) setObjectDetailId(null); }} />
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

// ---- Configuratie-blok (toont de opgeslagen configurator-instellingen) ----
type LeadConfig = {
  ere?: boolean;
  pricing_input?: {
    usage?: { kwhPerChargePointMonth?: number; effectiveChargingPowerKw?: number; sessionsPerChargePointMonth?: number };
    tariffs?: { idleFeeEnabled?: boolean; startFeeEnabled?: boolean; idleFeePerMinute?: number; idleGraceMinutes?: number; chargeTariffPerKwh?: number; startFeePerSession?: number };
    contract?: { durationMonths?: number; noticePeriodMonths?: number };
    customer?: { locationType?: string };
    hardware?: { chargePoints?: number; hardwareInvestment?: number; socketsPerChargePoint?: number };
  };
  pricing_result?: { totals?: { customerPerMonth?: number; customerPerYear?: number } };
};

const eur2 = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function ConfigGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-2 first:border-0 first:pt-0">
      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">{label}</p>
      {children}
    </div>
  );
}

function ConfigCard({ config, updatedAt, onEdit }: { config: LeadConfig | null; updatedAt: string | null | undefined; onEdit: () => void }) {
  if (!config?.pricing_input) {
    return (
      <InfoCard title="Configuratie" icon={WandSparkles}
        action={<button className="text-xs font-medium text-primary hover:underline" onClick={onEdit}>Start configurator</button>}>
        <p className="py-1 text-sm text-muted-foreground">Nog geen configuratie samengesteld. Start de configurator om de laadoplossing voor deze klant te configureren.</p>
      </InfoCard>
    );
  }
  const pi = config.pricing_input;
  const hw = pi.hardware ?? {}, usage = pi.usage ?? {}, tar = pi.tariffs ?? {}, con = pi.contract ?? {};
  const locLabel = pi.customer?.locationType ? (LOCATION_TYPES[pi.customer.locationType] ?? pi.customer.locationType) : null;
  return (
    <InfoCard title="Configuratie" icon={WandSparkles}
      action={<button className="text-xs font-medium text-primary hover:underline" onClick={onEdit}>Open in configurator</button>}>
      <div className="space-y-2">
        <ConfigGroup label="Hardware">
          <DetailRow label="Laadpunten" value={hw.chargePoints != null ? String(hw.chargePoints) : null} />
          <DetailRow label="Sockets per laadpunt" value={hw.socketsPerChargePoint != null ? String(hw.socketsPerChargePoint) : null} />
        </ConfigGroup>
        <ConfigGroup label="Locatie & gebruik">
          <DetailRow label="Type locatie" value={locLabel} />
          <DetailRow label="kWh / laadpunt / maand" value={usage.kwhPerChargePointMonth != null ? String(usage.kwhPerChargePointMonth) : null} />
          <DetailRow label="Sessies / laadpunt / maand" value={usage.sessionsPerChargePointMonth != null ? String(usage.sessionsPerChargePointMonth) : null} />
          <DetailRow label="Laadvermogen" value={usage.effectiveChargingPowerKw != null ? `${usage.effectiveChargingPowerKw} kW` : null} />
        </ConfigGroup>
        <ConfigGroup label="Tarieven">
          <DetailRow label="Laadtarief" value={tar.chargeTariffPerKwh != null ? `${eur2(tar.chargeTariffPerKwh)} / kWh` : null} />
          {tar.startFeeEnabled && <DetailRow label="Starttarief" value={tar.startFeePerSession != null ? `${eur2(tar.startFeePerSession)} / sessie` : null} />}
          {tar.idleFeeEnabled && <DetailRow label="Blokkeertarief" value={tar.idleFeePerMinute != null ? `${eur2(tar.idleFeePerMinute)} / min na ${tar.idleGraceMinutes ?? 0} min` : null} />}
        </ConfigGroup>
        <ConfigGroup label="Contract">
          <DetailRow label="Looptijd" value={con.durationMonths != null ? `${con.durationMonths} maanden` : null} />
          <DetailRow label="Opzegtermijn" value={con.noticePeriodMonths != null ? `${con.noticePeriodMonths} maanden` : null} />
          <DetailRow label="ERE-certificaten" value={config.ere ? "Ja" : "Nee"} />
        </ConfigGroup>
      </div>
      {updatedAt && <p className="mt-2 text-[11px] text-muted-foreground">Laatst opgeslagen · {new Date(updatedAt).toLocaleDateString("nl-NL")}</p>}
    </InfoCard>
  );
}

// ---- Bewerk-formulier in kaart-stijl (zelfde InfoCards als de leesweergave) ----
function ERow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="w-[58%] shrink-0">{children}</div>
    </div>
  );
}
function EInput({ value, onChange, mode }: { value: string; onChange: (v: string) => void; mode?: "numeric" | "decimal" }) {
  return <Input className="h-8 text-right" inputMode={mode} value={value} onChange={(e) => onChange(e.target.value)} />;
}
function ESelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
function EToggle({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) {
  return <div className="flex justify-end"><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function EditForm({ lead, form, set, text, updateLead, onLaunchConfigurator }: {
  lead: LeadWithTasks;
  form: Record<string, string | boolean | null>;
  set: (k: string) => (v: string | boolean) => void;
  text: (k: string) => string;
  updateLead: ReturnType<typeof useUpdateLead>;
  onLaunchConfigurator: () => void;
}) {
  const locOptions = Object.entries(LOCATION_TYPES) as [string, string][];
  const scopeOptions = SCOPES.map((s) => [s, SCOPE_LABEL[s]] as [string, string]);
  return (
    <>
      <InfoCard title="Bedrijf" icon={Building2}>
        <ERow label="Bedrijf"><CompanyPicker value={lead.company_id} valueLabel={lead.company_name} onChange={(id) => updateLead.mutate({ id: lead.id, patch: { company_id: id } })} /></ERow>
        {lead.company_id ? (
          <div className="pt-3"><CompanyFields companyId={lead.company_id} /></div>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">Kies of maak eerst een bedrijf om bedrijfsgegevens (KvK, BTW, website, adres) in te vullen. Deze worden 1:1 bij het bedrijf in de Contacten-tab bewaard.</p>
        )}
      </InfoCard>

      <InfoCard title="Contactpersoon" icon={UserPlus}>
        <ERow label="Persoon"><PersonPicker value={lead.person_id} valueLabel={lead.contact_name} companyId={lead.company_id} placeholder="Kies of zoek persoon…" onChange={(id) => updateLead.mutate({ id: lead.id, patch: { person_id: id } })} /></ERow>
        {lead.person_id ? (
          <div className="pt-3"><PersonFields personId={lead.person_id} /></div>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">Koppel een contactpersoon om naam, e-mail, telefoon en functie vast te leggen — 1:1 met de Contacten-tab.</p>
        )}
      </InfoCard>

      <InfoCard title="Bericht" icon={MessageSquare}>
        <ERow label="Onderwerp"><EInput value={text("message_subject")} onChange={set("message_subject")} /></ERow>
        <div className="pt-2">
          <Label className="mb-1 block text-xs text-muted-foreground">Bericht van de aanvrager</Label>
          <Textarea rows={3} value={text("message_body")} onChange={(e) => set("message_body")(e.target.value)} />
        </div>
      </InfoCard>

      <InfoCard title="Locatie & behoefte" icon={MapPin}>
        <ERow label="Type locatie"><ESelect value={text("location_type")} onChange={set("location_type")} options={locOptions} placeholder="Kies…" /></ERow>
        <ERow label="Scope"><ESelect value={text("scope")} onChange={set("scope")} options={scopeOptions} placeholder="Kies…" /></ERow>
        <ERow label="Laadpunten"><EInput value={text("estimated_charge_points")} onChange={set("estimated_charge_points")} mode="numeric" /></ERow>
        <ERow label="kWh / maand"><EInput value={text("estimated_kwh_per_month")} onChange={set("estimated_kwh_per_month")} mode="decimal" /></ERow>
        <ERow label="Type lader"><EInput value={text("charger_type")} onChange={set("charger_type")} /></ERow>
        <ERow label="Parkeerplaatsen"><EInput value={text("parking_spaces")} onChange={set("parking_spaces")} mode="numeric" /></ERow>
        <ERow label="Eigenaar pand"><EToggle checked={!!form.owns_property} onChange={(c) => set("owns_property")(c)} /></ERow>
        <ERow label="Zonnepanelen"><EToggle checked={!!form.has_solar} onChange={(c) => set("has_solar")(c)} /></ERow>
      </InfoCard>

      <InfoCard title="Configuratie" icon={WandSparkles} action={<button className="text-xs font-medium text-primary hover:underline" onClick={onLaunchConfigurator}>Open in configurator</button>}>
        <div className="space-y-2">
          <ConfigGroup label="Hardware">
            <ERow label="Laadpunten"><EInput value={text("cfg_charge_points")} onChange={set("cfg_charge_points")} mode="numeric" /></ERow>
            <ERow label="Sockets per laadpunt"><EInput value={text("cfg_sockets")} onChange={set("cfg_sockets")} mode="numeric" /></ERow>
          </ConfigGroup>
          <ConfigGroup label="Locatie & gebruik">
            <ERow label="Type locatie"><ESelect value={text("cfg_location_type")} onChange={set("cfg_location_type")} options={locOptions} placeholder="Kies…" /></ERow>
            <ERow label="kWh / laadpunt / maand"><EInput value={text("cfg_kwh")} onChange={set("cfg_kwh")} mode="decimal" /></ERow>
            <ERow label="Sessies / laadpunt / maand"><EInput value={text("cfg_sessions")} onChange={set("cfg_sessions")} mode="numeric" /></ERow>
            <ERow label="Laadvermogen (kW)"><EInput value={text("cfg_power")} onChange={set("cfg_power")} mode="decimal" /></ERow>
          </ConfigGroup>
          <ConfigGroup label="Tarieven">
            <ERow label="Laadtarief / kWh"><EInput value={text("cfg_charge_tariff")} onChange={set("cfg_charge_tariff")} mode="decimal" /></ERow>
            <ERow label="Starttarief actief"><EToggle checked={!!form.cfg_start_enabled} onChange={(c) => set("cfg_start_enabled")(c)} /></ERow>
            {form.cfg_start_enabled ? <ERow label="Starttarief / sessie"><EInput value={text("cfg_start_fee")} onChange={set("cfg_start_fee")} mode="decimal" /></ERow> : null}
            <ERow label="Blokkeertarief actief"><EToggle checked={!!form.cfg_idle_enabled} onChange={(c) => set("cfg_idle_enabled")(c)} /></ERow>
            {form.cfg_idle_enabled ? <ERow label="Blokkeertarief / min"><EInput value={text("cfg_idle_fee")} onChange={set("cfg_idle_fee")} mode="decimal" /></ERow> : null}
            {form.cfg_idle_enabled ? <ERow label="Gratis minuten"><EInput value={text("cfg_idle_grace")} onChange={set("cfg_idle_grace")} mode="numeric" /></ERow> : null}
          </ConfigGroup>
          <ConfigGroup label="Contract">
            <ERow label="Looptijd (maanden)"><EInput value={text("cfg_duration")} onChange={set("cfg_duration")} mode="numeric" /></ERow>
            <ERow label="Opzegtermijn (maanden)"><EInput value={text("cfg_notice")} onChange={set("cfg_notice")} mode="numeric" /></ERow>
            <ERow label="ERE-certificaten"><EToggle checked={!!form.cfg_ere} onChange={(c) => set("cfg_ere")(c)} /></ERow>
          </ConfigGroup>
        </div>
      </InfoCard>

      <InfoCard title="Notitie" icon={FileText}>
        <Textarea rows={3} value={text("notes")} onChange={(e) => set("notes")(e.target.value)} />
      </InfoCard>
    </>
  );
}
