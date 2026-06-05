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

export type LeadWithTasks = Lead & { lead_tasks: { id: string; done: boolean }[] };

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

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_tasks(id, done)")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LeadWithTasks[];
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

// Teamleden (voor eigenaar-toewijzing + weergave)
export function useTeamProfiles() {
  return useQuery({
    queryKey: ["team-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string | null }[];
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
      if (error) throw error;
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
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<LeadWithTasks[]>(["leads"]);
      const map = new Map(updates.map((u) => [u.id, u]));
      qc.setQueryData<LeadWithTasks[]>(["leads"], (old) =>
        (old ?? []).map((l) =>
          map.has(l.id) ? { ...l, stage_id: map.get(l.id)!.stage_id, position: map.get(l.id)!.position } : l,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leads"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// ---- Taak-mutaties ----------------------------------------------------------

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, organizationId, title, dueDate }: { leadId: string; organizationId: string; title: string; dueDate?: string | null }) => {
      const uid = await currentUserId();
      const { error } = await supabase.from("lead_tasks").insert({
        lead_id: leadId,
        organization_id: organizationId,
        title,
        due_date: dueDate ?? null,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean; leadId: string }) => {
      const { error } = await supabase
        .from("lead_tasks")
        .update({ done, completed_at: done ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    // Optimistisch: meteen afvinken in zowel de takenlijst als de embedded
    // taken op de board (voorkomt KPI-flikker).
    onMutate: async ({ id, done, leadId }) => {
      await qc.cancelQueries({ queryKey: ["lead-tasks", leadId] });
      const prevTasks = qc.getQueryData<LeadTask[]>(["lead-tasks", leadId]);
      const prevLeads = qc.getQueryData<LeadWithTasks[]>(["leads"]);
      qc.setQueryData<LeadTask[]>(["lead-tasks", leadId], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done } : t)),
      );
      qc.setQueryData<LeadWithTasks[]>(["leads"], (old) =>
        (old ?? []).map((l) => ({ ...l, lead_tasks: (l.lead_tasks ?? []).map((t) => (t.id === id ? { ...t, done } : t)) })),
      );
      return { prevTasks, prevLeads, leadId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        qc.setQueryData(["lead-tasks", ctx.leadId], ctx.prevTasks);
        qc.setQueryData(["leads"], ctx.prevLeads);
      }
    },
    onSettled: (_d, _e, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId: string }) => {
      const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
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

// Converteer een lead naar een klant (status 'actief'; client_number wordt door
// een DB-trigger toegekend). Linkt de lead + verplaatst naar de Gewonnen-fase.
export function useConvertLeadToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, wonStageId }: { lead: Lead; wonStageId?: string }) => {
      const uid = await currentUserId();
      const { data: client, error } = await supabase
        .from("clients")
        .insert({
          organization_id: lead.organization_id,
          company_name: lead.company_name,
          kvk: lead.kvk ?? null,
          contact_name: lead.contact_name ?? null,
          contact_email: lead.contact_email ?? null,
          contact_phone: lead.contact_phone ?? null,
          billing_address_street: lead.address_street ?? null,
          billing_address_postal: lead.postal_code ?? null,
          billing_address_city: lead.city ?? null,
          status: "actief",
          notes: lead.notes ?? "Geconverteerd vanuit lead",
        })
        .select("id, client_number")
        .single();
      if (error) throw error;

      const patch: LeadUpdate = { converted_client_id: client.id };
      if (wonStageId) patch.stage_id = wonStageId;
      const { error: e2 } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (e2) throw e2;

      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        organization_id: lead.organization_id,
        user_id: uid,
        type: "converted",
        description: `Geconverteerd naar klant #${client.client_number ?? client.id}`,
        metadata: { client_id: client.id },
      });
      return client;
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
