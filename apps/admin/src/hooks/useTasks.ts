import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { currentUserId, type LeadWithTasks } from "./useLeads";
import type { ChecklistItem, TaskPriority, TaskRecurrence } from "@/services/tasks";

// Alle taak-hooks van de takenmodule (verhuisd uit useLeads.ts). Taken hangen
// optioneel aan een lead (lead_id nullable); losse to-do's horen er net zo bij.

export type LeadTask = Database["public"]["Tables"]["lead_tasks"]["Row"];
export type TaskWithLead = LeadTask & { leads: { company_name: string | null } | null };

type TaskUpdate = Database["public"]["Tables"]["lead_tasks"]["Update"];
export type TaskPatch = Pick<
  TaskUpdate,
  "title" | "description" | "due_date" | "assigned_to" | "priority" | "recurrence" | "lead_id" | "checklist"
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

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId, organizationId, title, dueDate, assignedTo, priority, description, recurrence, checklist,
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
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch; leadId?: string | null }) => {
      const { error } = await supabase.from("lead_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId, patch }) => {
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
      const prevAll = qc.getQueryData<TaskWithLead[]>(["all-tasks"]);
      qc.setQueryData<TaskWithLead[]>(["all-tasks"], (old) =>
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
      if (ctx?.prevAll) qc.setQueryData(["all-tasks"], ctx.prevAll);
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
      const prevAll = qc.getQueryData<TaskWithLead[]>(["all-tasks"]);
      qc.setQueryData<TaskWithLead[]>(["all-tasks"], (old) =>
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
      if (ctx?.prevAll) qc.setQueryData(["all-tasks"], ctx.prevAll);
      if (ctx?.leadId && ctx.prevTasks) qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
    },
    onSettled: (_d, _e, { leadId }) => {
      if (leadId) qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
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
