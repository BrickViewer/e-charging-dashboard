import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ChargePointFault, ChargePointFaultEvent } from "@/types/db";
import { isStaleHeartbeat, type FaultAction } from "@/services/faults";

type CpRel = { name: string | null; eflux_evse_id: string | null; eflux_evse_controller_id: string | null; serial_number: string | null; brand: string | null; model: string | null; max_power: number | null; connectivity_state: string | null; operational_status: string | null; last_heartbeat_at: string | null };
type LocRel = { name: string | null; address: string | null; city: string | null; postal_code: string | null };
type ClientRel = { company_name: string | null; client_number: number | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; company_id: string | null };

export type FaultRow = ChargePointFault & {
  charge_points: CpRel | null;
  locations: LocRel | null;
  clients: ClientRel | null;
};

export type FaultDetail = FaultRow & { events: ChargePointFaultEvent[] };

const LIST_SELECT =
  "*, charge_points(name, eflux_evse_id, eflux_evse_controller_id, serial_number, brand, model, max_power, connectivity_state, operational_status, last_heartbeat_at), locations(name, address, city, postal_code), clients(company_name, client_number, contact_name, contact_phone, contact_email, company_id)";

export function useFaults() {
  return useQuery({
    queryKey: ["faults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_point_faults")
        .select(LIST_SELECT)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FaultRow[];
    },
  });
}

export function useFault(id: string | undefined) {
  return useQuery({
    queryKey: ["fault", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_point_faults")
        .select(LIST_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: events } = await supabase
        .from("charge_point_fault_events")
        .select("*")
        .eq("fault_id", id!)
        .order("created_at", { ascending: true });
      return { ...(data as unknown as FaultRow), events: (events ?? []) as ChargePointFaultEvent[] } as FaultDetail;
    },
  });
}

// Beste contact om te bellen (primaire persoon uit company_persons, anders klant).
export function useBestContact(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["fault-contact", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("is_primary, role, person:persons(full_name, email, phone, role)")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as { is_primary: boolean; role: string | null; person: { full_name: string | null; email: string | null; phone: string | null; role: string | null } | null }[];
    },
  });
}

// Palen die "verbonden" lijken maar te lang geen hartslag stuurden (zacht signaal).
export function useSuspectedChargePoints(graceMinutes = 60) {
  return useQuery({
    queryKey: ["suspected-charge-points", graceMinutes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("id, name, status, connectivity_state, last_heartbeat_at, eflux_evse_id, locations(name, city, client_id, clients(company_name, client_number))")
        .eq("status", "online");
      if (error) throw error;
      return (data ?? []).filter((cp) =>
        isStaleHeartbeat((cp as { last_heartbeat_at: string | null }).last_heartbeat_at, graceMinutes),
      ) as unknown as SuspectedChargePoint[];
    },
  });
}

export type SuspectedChargePoint = {
  id: string; name: string | null; status: string | null; connectivity_state: string | null;
  last_heartbeat_at: string | null; eflux_evse_id: string | null;
  locations: { name: string | null; city: string | null; client_id: string | null; clients: { company_name: string | null; client_number: number | null } | null } | null;
};

// Advance: zet de werkstroom-status + tijdstempel en log een tijdlijn-event.
export function useAdvanceFault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fault, action, visitDate }: { fault: FaultRow; action: FaultAction; visitDate?: string }) => {
      const patch: Database["public"]["Tables"]["charge_point_faults"]["Update"] = { status: action.toStatus };
      const nowIso = new Date().toISOString();
      if (action.stampField) (patch as Record<string, unknown>)[action.stampField] = nowIso;
      if (action.needsDate && visitDate) patch.visit_date = visitDate;
      const { error } = await supabase.from("charge_point_faults").update(patch).eq("id", fault.id);
      if (error) throw error;
      await supabase.from("charge_point_fault_events").insert({
        fault_id: fault.id,
        event_type: "status_change",
        from_status: fault.status,
        to_status: action.toStatus,
        note: action.needsDate && visitDate ? `${action.label} (${visitDate})` : action.label,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faults"] });
      qc.invalidateQueries({ queryKey: ["fault", vars.fault.id] });
    },
  });
}

export function useAddFaultNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ faultId, note }: { faultId: string; note: string }) => {
      const { error } = await supabase.from("charge_point_fault_events").insert({
        fault_id: faultId, event_type: "note", note,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["fault", vars.faultId] }),
  });
}

export function useResendFaultEmail() {
  return useMutation({
    mutationFn: async (faultId: string) => {
      const { data, error } = await supabase.functions.invoke("send-fault-notification", { body: { fault_ids: [faultId] } });
      if (error) throw error;
      return data as { status: string; message?: string };
    },
  });
}
