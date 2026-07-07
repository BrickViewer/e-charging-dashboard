import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];
export type LeadStage = Database["public"]["Tables"]["lead_stages"]["Row"];
export type LeadTask = Database["public"]["Tables"]["lead_tasks"]["Row"];
export type LeadActivity = Database["public"]["Tables"]["lead_activities"]["Row"];
export type LeadStageTask = Database["public"]["Tables"]["lead_stage_tasks"]["Row"];

export type LeadQuoteMini = {
  id: string;
  status: string | null;
  sent_at: string | null;
  with_installation: boolean | null;
  with_management: boolean | null;
  num_charge_points: number | null;
  total_installation_cost: number | null;
  total_hardware_cost: number | null;
  // Geschatte maand/jaar-opbrengst uit de calculatie (configurator/lead); echargingNetPerYear = wat beheer
  // E-Charging per jaar oplevert. Leeg bij handmatige offertes zonder calculatie.
  monthly_projection: { echargingNetPerYear?: number | null; echargingNetPerMonth?: number | null } | null;
  created_at: string;
};
export type LeadTagMini = { id: string; name: string; color: string };
export type LeadWithTasks = Lead & {
  lead_tasks: { id: string; done: boolean }[];
  quotes?: LeadQuoteMini[];
  lead_tag_links?: { tag_id: string; lead_tags: LeadTagMini | null }[];
};
export type TaskWithLead = LeadTask & { leads: { company_name: string | null } | null };

// Lijst-view: server-side afgeleide levenscyclus + facturatie-status (leads_list_v).
export type LeadListRow = Database["public"]["Views"]["leads_list_v"]["Row"];
export type LeadLifecycle = "open" | "won_active" | "invoiced" | "lost";
export type LeadLostReason = Database["public"]["Tables"]["lead_lost_reasons"]["Row"];

export type LeadListFilters = {
  segment?: LeadLifecycle | "all";
  search?: string;
  owner?: string | "me" | "none" | "all";
  sources?: string[];
  tagIds?: string[];
  priorities?: string[];
  scopes?: string[];
  stageIds?: string[];
  valueMin?: number | null;
  valueMax?: number | null;
  chargePointsMin?: number | null;
  chargePointsMax?: number | null;
  dateField?: "created_at" | "expected_close_date" | "won_at" | "lost_at";
  dateFrom?: string | null;
  dateTo?: string | null;
};
export type LeadSort = { field: string; dir: "asc" | "desc" };

// De relevante offerte van een lead: nieuwste verzonden (sent_at), anders nieuwste op created_at.
// Vervangen én afgewezen offertes tellen niet mee — dat zijn geen actieve voorstellen.
export function primaryQuote(lead: LeadWithTasks): LeadQuoteMini | null {
  const qs = (lead.quotes ?? []).filter((q) => q.status !== "vervangen" && q.status !== "afgewezen");
  if (!qs.length) return null;
  const sent = qs.filter((q) => q.sent_at);
  const pool = sent.length ? sent : qs;
  const key = (q: LeadQuoteMini) => q.sent_at ?? q.created_at;
  return [...pool].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))[0];
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---- Queries ----------------------------------------------------------------

export function useLeadStages() {
  return useQuery({
    queryKey: ["lead-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_stages")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadStage[];
    },
  });
}

// Board: alleen OPEN leads (begrensd + snel). Zelfde joins die de kaarten nodig hebben.
// Sleutel onder de ["leads"]-prefix zodat bestaande invalidaties dit ook verversen.
export function useOpenLeads() {
  return useQuery({
    queryKey: ["leads", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_tasks(id, done), lead_tag_links(tag_id, lead_tags(id, name, color)), quotes(id, status, sent_at, with_installation, with_management, num_charge_points, total_installation_cost, total_hardware_cost, monthly_projection, created_at)")
        .eq("status", "open")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LeadWithTasks[];
    },
  });
}

// Lichte leadlijst voor dropdowns (bv. taken koppelen) — geen joins.
export function useLeadOptions() {
  return useQuery({
    queryKey: ["lead-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_name")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string }[];
    },
  });
}

// Lijstweergave: server-side gefilterd/gesorteerd/gepagineerd op de leads_list_v-view.
// Sleutel onder de ["leads"]-prefix → bestaande lead-invalidaties verversen ook de lijst.
export function useLeadsList(params: { filters: LeadListFilters; sort: LeadSort; page: number; pageSize: number }) {
  const { filters, sort, page, pageSize } = params;
  return useQuery({
    queryKey: ["leads", "list", filters, sort, page, pageSize],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("leads_list_v").select("*", { count: "exact" });
      const seg = filters.segment ?? "all";
      if (seg !== "all") q = q.eq("lifecycle", seg);
      const search = (filters.search ?? "").trim();
      if (search) {
        const s = search.replace(/[%,()]/g, " ");
        q = q.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,city.ilike.%${s}%,contact_email.ilike.%${s}%`);
      }
      const owner = filters.owner ?? "all";
      if (owner !== "all") {
        if (owner === "none") q = q.is("owner_user_id", null);
        else if (owner === "me") {
          const uid = await currentUserId();
          q = uid ? q.eq("owner_user_id", uid) : q.is("owner_user_id", null);
        } else q = q.eq("owner_user_id", owner);
      }
      if (filters.sources?.length) q = q.in("source", filters.sources);
      if (filters.priorities?.length) q = q.in("priority", filters.priorities);
      if (filters.scopes?.length) q = q.in("scope_effective", filters.scopes);
      if (filters.stageIds?.length) q = q.in("stage_id", filters.stageIds);
      if (filters.tagIds?.length) q = q.overlaps("tag_ids", filters.tagIds);
      if (filters.valueMin != null) q = q.gte("estimated_value", filters.valueMin);
      if (filters.valueMax != null) q = q.lte("estimated_value", filters.valueMax);
      if (filters.chargePointsMin != null) q = q.gte("estimated_charge_points", filters.chargePointsMin);
      if (filters.chargePointsMax != null) q = q.lte("estimated_charge_points", filters.chargePointsMax);
      if (filters.dateField && filters.dateFrom) q = q.gte(filters.dateField, filters.dateFrom);
      if (filters.dateField && filters.dateTo) {
        // expected_close_date is een 'date'; won_at/lost_at/created_at zijn timestamptz →
        // exclusieve bovengrens (dateTo + 1 dag) zodat de hele laatste dag meetelt.
        if (filters.dateField === "expected_close_date") {
          q = q.lte(filters.dateField, filters.dateTo);
        } else {
          const dt = new Date(filters.dateTo + "T00:00:00Z");
          dt.setUTCDate(dt.getUTCDate() + 1);
          q = q.lt(filters.dateField, dt.toISOString().slice(0, 10));
        }
      }
      q = q.order(sort.field, { ascending: sort.dir === "asc", nullsFirst: false });
      if (sort.field !== "created_at") q = q.order("created_at", { ascending: false });
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as LeadListRow[], total: count ?? 0 };
    },
  });
}

// Org-beheerbare verlies-redenen (voor de verplichte keuze + het beheerscherm).
export function useLostReasons() {
  return useQuery({
    queryKey: ["lead-lost-reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_lost_reasons")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadLostReason[];
    },
  });
}

// KPI's over de hele leadset (won/lost tellen niet in de open-board-query mee).
export function useLeadStats() {
  return useQuery({
    queryKey: ["leads", "stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const cnt = async (b: PromiseLike<{ count: number | null }>) => (await b).count ?? 0;
      const base = () => supabase.from("leads").select("id", { count: "exact", head: true });
      const [wonThisMonth, wonTotal, lostTotal] = await Promise.all([
        cnt(base().eq("status", "won").gte("won_at", monthStart)),
        cnt(base().eq("status", "won")),
        cnt(base().eq("status", "lost")),
      ]);
      const closed = wonTotal + lostTotal;
      return { wonThisMonth, wonTotal, lostTotal, winRate: closed > 0 ? Math.round((wonTotal / closed) * 100) : null };
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
  });
}

// Enkele lead MÉT joins (voor de detailsheet als de lead niet in de open-board-set zit,
// bv. gewonnen/verloren via de lijst of een deep-link) — zodat tags/taken/offertes kloppen.
export function useLeadFull(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-full", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_tasks(id, done), lead_tag_links(tag_id, lead_tags(id, name, color)), quotes(id, status, sent_at, with_installation, with_management, num_charge_points, total_installation_cost, total_hardware_cost, monthly_projection, created_at)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LeadWithTasks) ?? null;
    },
  });
}

// Lead-zoekopdracht voor de picker (objecten koppelen aan een lead).
export function useLeadSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: ["lead-search", q],
    queryFn: async () => {
      let query = supabase.from("leads").select("id, company_name, contact_name, city").order("created_at", { ascending: false }).limit(25);
      if (q) query = query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string; contact_name: string | null; city: string | null }[];
    },
  });
}

// Herkomst-lead(s) van een klant (reverse-lookup via converted_client_id).
export function useLeadsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-leads", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_name, contact_name, status, created_at")
        .eq("converted_client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string; contact_name: string | null; status: string; created_at: string }[];
    },
  });
}

export function useLeadTasks(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-tasks", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .eq("lead_id", leadId!)
        .order("done", { ascending: true })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadTask[];
    },
  });
}

// Alle taken (over leads heen) voor het centrale Taken-overzicht; los = leads null.
export function useAllTasks() {
  return useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("*, leads(company_name)")
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskWithLead[];
    },
  });
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-activities", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadActivity[];
    },
  });
}

export function useStageTasks() {
  return useQuery({
    queryKey: ["lead-stage-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_stage_tasks")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadStageTask[];
    },
  });
}

// Teamleden (voor eigenaar-toewijzing + weergave) — alleen actieve interne
// gebruikers (mét een rol in user_roles); portaalklanten en oude/rolloze
// profielen worden uitgefilterd.
export function useTeamProfiles() {
  return useQuery({
    queryKey: ["team-profiles"],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const internal = new Set((roles ?? []).map((r) => r.user_id));
      return (profiles ?? [])
        .filter((p) => internal.has(p.user_id))
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")) as { user_id: string; full_name: string | null }[];
    },
  });
}

// ---- Lead-mutaties ----------------------------------------------------------

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadInsert) => {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("leads")
        .insert({ created_by: uid, owner_user_id: input.owner_user_id ?? uid, ...input })
        .select("*")
        .single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadUpdate }) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) {
        // De guard-trigger (P0001) blokkeert verwijderen bij een getekende offerte met een
        // duidelijke NL-melding; die surfacen we direct. Niet-getekende offertes cascaden mee.
        if (error.code === "P0001") throw new Error(error.message);
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// Persisteert een nieuwe kolom-/kaartvolgorde (optimistisch). De board berekent
// welke leads van fase/positie wijzigen en geeft alleen die mee.
export function useReorderLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; stage_id: string; position: number }[]) => {
      // Atomair via RPC (één transactie) i.p.v. N losse UPDATE's.
      const { error } = await supabase.rpc("reorder_leads", { p_updates: updates });
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ["leads", "open"] });
      const prev = qc.getQueryData<LeadWithTasks[]>(["leads", "open"]);
      const map = new Map(updates.map((u) => [u.id, u]));
      qc.setQueryData<LeadWithTasks[]>(["leads", "open"], (old) =>
        (old ?? []).map((l) =>
          map.has(l.id) ? { ...l, stage_id: map.get(l.id)!.stage_id, position: map.get(l.id)!.position } : l,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leads", "open"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// ---- Taak-mutaties ----------------------------------------------------------

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, organizationId, title, dueDate, assignedTo }: { leadId?: string | null; organizationId: string; title: string; dueDate?: string | null; assignedTo?: string | null }) => {
      const uid = await currentUserId();
      const payload = {
        lead_id: leadId ?? null,
        organization_id: organizationId,
        title,
        due_date: dueDate ?? null,
        assigned_to: assignedTo ?? null,
        created_by: uid,
      };
      const { error } = await supabase.from("lead_tasks").insert(payload as unknown as Database["public"]["Tables"]["lead_tasks"]["Insert"]);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// Bewerk een taak (titel/datum/toegewezene). Toewijzen aan een ander triggert de e-mailmelding (DB-trigger).
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { title?: string; due_date?: string | null; assigned_to?: string | null }; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean; leadId?: string | null }) => {
      const { error } = await supabase
        .from("lead_tasks")
        .update({ done, completed_at: done ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    // Optimistisch afvinken in de lead-takenlijst + embedded board-taken (voorkomt KPI-flikker).
    onMutate: async ({ id, done, leadId }) => {
      const prevLeads = qc.getQueryData<LeadWithTasks[]>(["leads", "open"]);
      let prevTasks: LeadTask[] | undefined;
      if (leadId) {
        await qc.cancelQueries({ queryKey: ["lead-tasks", leadId] });
        prevTasks = qc.getQueryData<LeadTask[]>(["lead-tasks", leadId]);
        qc.setQueryData<LeadTask[]>(["lead-tasks", leadId], (old) =>
          (old ?? []).map((t) => (t.id === id ? { ...t, done } : t)),
        );
      }
      qc.setQueryData<LeadWithTasks[]>(["leads", "open"], (old) =>
        (old ?? []).map((l) => ({ ...l, lead_tasks: (l.lead_tasks ?? []).map((t) => (t.id === id ? { ...t, done } : t)) })),
      );
      return { prevTasks, prevLeads, leadId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
      if (ctx?.prevLeads) qc.setQueryData(["leads", "open"], ctx.prevLeads);
    },
    onSettled: (_d, _e, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// ---- Fase-mutaties (StageManager) ------------------------------------------

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Database["public"]["Tables"]["lead_stages"]["Insert"]) => {
      const { error } = await supabase.from("lead_stages").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-stages"] }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["lead_stages"]["Update"] }) => {
      const { error } = await supabase.from("lead_stages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-stages"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// Atomaire fase-verplaatsing (swap met de buur) via RPC — geen race.
export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const { error } = await supabase.rpc("move_stage", { p_id: id, p_dir: dir });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-stages"] }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-stages"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// Converteer een lead naar een klant via de edge-functie. Bestaat er een
// opgeslagen configuratie, dan krijgt de klant EXACT die tarieven/contract +
// een customer_configurations-snapshot. Linkt de lead + zet 'm op Gewonnen.
export function useConvertLeadToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead }: { lead: Lead }) => {
      const { data, error } = await supabase.functions.invoke<{ clientId: string; clientNumber: number | null }>(
        "lead-convert-to-client",
        { body: { lead_id: lead.id } },
      );
      if (error) throw error;
      return data as { clientId: string; clientNumber: number | null };
    },
    onSuccess: (_d, { lead }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
    },
  });
}

export function useStageTaskMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead-stage-tasks"] });
  const add = useMutation({
    mutationFn: async (input: Database["public"]["Tables"]["lead_stage_tasks"]["Insert"]) => {
      const { error } = await supabase.from("lead_stage_tasks").insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_stage_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { add, remove };
}

// Bulk-patch voor lijst-bulkacties (eigenaar wijzigen, markeer gewonnen/verloren, ...).
// Bij markeer-verloren moet lost_reason_id in de patch zitten (DB-guard dwingt dit af).
export function useBulkPatchLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: LeadUpdate }) => {
      if (!ids.length) return;
      const { error } = await supabase.from("leads").update(patch).in("id", ids);
      if (error) {
        if (error.code === "P0001") throw new Error(error.message);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// Beheer van de org-verlies-redenen (instellingen / fasenbeheer).
export function useLostReasonMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead-lost-reasons"] });
  const add = useMutation({
    mutationFn: async (input: Database["public"]["Tables"]["lead_lost_reasons"]["Insert"]) => {
      const { error } = await supabase.from("lead_lost_reasons").insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["lead_lost_reasons"]["Update"] }) => {
      const { error } = await supabase.from("lead_lost_reasons").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_lost_reasons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { add, update, remove };
}
