import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { currentUserId, type LeadWithTasks } from "./useLeads";
import type { ChecklistItem, TaskPriority, TaskRecurrence } from "@/services/tasks";

// Alle taak-hooks van de takenmodule (verhuisd uit useLeads.ts). Taken hangen
// optioneel aan een lead (lead_id nullable); losse to-do's horen er net zo bij.

export type LeadTask = Database["public"]["Tables"]["lead_tasks"]["Row"];
export type TaskWithLead = LeadTask & { leads: { company_name: string | null } | null };

// Takensplit: 'sales' (lead-gerelateerd, /sales/taken) vs 'algemeen'
// (bedrijfsbreed, directie-werkblad). Lead-gebonden taken zijn altijd sales
// (DB-constraint lead_tasks_lead_implies_sales).
export type TaskCategory = "sales" | "algemeen";
export type TaskScope = "all" | "sales";

type TaskUpdate = Database["public"]["Tables"]["lead_tasks"]["Update"];
export type TaskPatch = Pick<
  TaskUpdate,
  "title" | "description" | "due_date" | "assigned_to" | "priority" | "recurrence" | "lead_id" | "checklist" | "category"
>;

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
// scope "sales" filtert server-side op categorie (het sales-werkblad toont
// alleen sales-taken); scope "all" is de volledige directie-lijst.
export function useAllTasks(scope: TaskScope = "all") {
  return useQuery({
    queryKey: ["all-tasks", scope],
    queryFn: async () => {
      let query = supabase
        .from("lead_tasks")
        .select("*, leads(company_name)")
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (scope === "sales") query = query.eq("category", "sales");
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as TaskWithLead[];
    },
  });
}

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId, organizationId, title, dueDate, assignedTo, priority, description, recurrence, checklist, category,
    }: {
      leadId?: string | null;
      organizationId: string;
      title: string;
      dueDate?: string | null;
      assignedTo?: string | null;
      priority?: TaskPriority;
      description?: string | null;
      recurrence?: TaskRecurrence | null;
      checklist?: ChecklistItem[];
      category?: TaskCategory;
    }) => {
      const uid = await currentUserId();
      const payload = {
        lead_id: leadId ?? null,
        organization_id: organizationId,
        title,
        due_date: dueDate ?? null,
        assigned_to: assignedTo ?? null,
        priority: priority ?? "medium",
        description: description ?? null,
        recurrence: recurrence ?? null,
        checklist: checklist ?? [],
        created_by: uid,
        // Lead-gebonden = altijd sales (DB-constraint); anders de gevraagde categorie.
        category: leadId ? "sales" : category ?? "sales",
      };
      const { error } = await supabase
        .from("lead_tasks")
        .insert(payload as unknown as Database["public"]["Tables"]["lead_tasks"]["Insert"]);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// Bewerk een taak (alle velden). Toewijzen aan een ander triggert de e-mailmelding
// (DB-trigger); bij een lead-herkoppeling worden alle lead-takencaches ververst.
// Optimistisch: de patch is direct zichtbaar in beide scope-caches + de lead-taken.
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch, leadId }) => {
      await qc.cancelQueries({ queryKey: ["all-tasks"] });
      const prevAll = qc.getQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] });
      qc.setQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] }, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      let prevTasks: LeadTask[] | undefined;
      if (leadId) {
        await qc.cancelQueries({ queryKey: ["lead-tasks", leadId] });
        prevTasks = qc.getQueryData<LeadTask[]>(["lead-tasks", leadId]);
        qc.setQueryData<LeadTask[]>(["lead-tasks", leadId], (old) =>
          (old ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      }
      return { prevAll, prevTasks, leadId };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prevAll ?? []) qc.setQueryData(key, data);
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
    },
    onSettled: (_d, _e, { leadId, patch }) => {
      if ("lead_id" in patch) qc.invalidateQueries({ queryKey: ["lead-tasks"] });
      else if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
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
    // Optimistisch afvinken in alle taken-caches (voorkomt KPI-flikker); de
    // onSettled-invalidate haalt daarna ook een eventuele recurrence-opvolger op.
    onMutate: async ({ id, done, leadId }) => {
      const prevLeads = qc.getQueryData<LeadWithTasks[]>(["leads", "open"]);
      await qc.cancelQueries({ queryKey: ["all-tasks"] });
      // Prefix-matched: dekt beide scope-caches (["all-tasks","all"] en …,"sales").
      const prevAll = qc.getQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] });
      qc.setQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] }, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done } : t)),
      );
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
      return { prevTasks, prevLeads, prevAll, leadId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
      if (ctx?.prevLeads) qc.setQueryData(["leads", "open"], ctx.prevLeads);
      for (const [key, data] of ctx?.prevAll ?? []) qc.setQueryData(key, data);
    },
    onSettled: (_d, _e, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// Checklist-mutatie: stuurt altijd de complete (verse) array; optimistic zodat
// afvinken van deelstappen direct zichtbaar is.
export function useUpdateTaskChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, checklist }: { id: string; checklist: ChecklistItem[]; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").update({ checklist }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, checklist, leadId }) => {
      await qc.cancelQueries({ queryKey: ["all-tasks"] });
      // Prefix-matched: dekt beide scope-caches (["all-tasks","all"] en …,"sales").
      const prevAll = qc.getQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] });
      qc.setQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] }, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, checklist } : t)),
      );
      let prevTasks: LeadTask[] | undefined;
      if (leadId) {
        await qc.cancelQueries({ queryKey: ["lead-tasks", leadId] });
        prevTasks = qc.getQueryData<LeadTask[]>(["lead-tasks", leadId]);
        qc.setQueryData<LeadTask[]>(["lead-tasks", leadId], (old) =>
          (old ?? []).map((t) => (t.id === id ? { ...t, checklist } : t)),
        );
      }
      return { prevAll, prevTasks, leadId };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prevAll ?? []) qc.setQueryData(key, data);
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
    },
    onSettled: (_d, _e, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

// Optimistisch verwijderen: de rij verdwijnt direct uit beide scope-caches, de
// lead-taken en de ingebedde leadkaart-taken; rollback bij een fout.
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, leadId }) => {
      await qc.cancelQueries({ queryKey: ["all-tasks"] });
      const prevAll = qc.getQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] });
      qc.setQueriesData<TaskWithLead[]>({ queryKey: ["all-tasks"] }, (old) => (old ?? []).filter((t) => t.id !== id));
      const prevLeads = qc.getQueryData<LeadWithTasks[]>(["leads", "open"]);
      qc.setQueryData<LeadWithTasks[]>(["leads", "open"], (old) =>
        (old ?? []).map((l) => ({ ...l, lead_tasks: (l.lead_tasks ?? []).filter((t) => t.id !== id) })),
      );
      let prevTasks: LeadTask[] | undefined;
      if (leadId) {
        await qc.cancelQueries({ queryKey: ["lead-tasks", leadId] });
        prevTasks = qc.getQueryData<LeadTask[]>(["lead-tasks", leadId]);
        qc.setQueryData<LeadTask[]>(["lead-tasks", leadId], (old) => (old ?? []).filter((t) => t.id !== id));
      }
      return { prevAll, prevLeads, prevTasks, leadId };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prevAll ?? []) qc.setQueryData(key, data);
      if (ctx?.prevLeads) qc.setQueryData(["leads", "open"], ctx.prevLeads);
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
    },
    onSettled: (_d, _e, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}
