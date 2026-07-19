// Bedrijfsagenda (Microsoft 365) via edge graph-agenda. Alle acties lopen
// server-side op de agenda van organizations.agenda_mailbox; hier alleen de
// dunne fetch-/mutatielaag met react-query.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgendaEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  bodyPreview: string | null;
  organizer: string | null;
  webLink: string | null;
}

export type AgendaStatus = "ok" | "not_configured" | "no_consent";

export interface AgendaEventInput {
  subject: string;
  start: string; // "YYYY-MM-DDTHH:mm" (lokale tijd) of "YYYY-MM-DD" bij allDay
  end: string;
  allDay?: boolean;
  location?: string;
  body?: string;
}

interface AgendaResponse {
  status: AgendaStatus | "error" | "forbidden";
  message?: string;
  events?: AgendaEvent[];
}

async function invokeAgenda(body: Record<string, unknown>): Promise<AgendaResponse> {
  const { data, error } = await supabase.functions.invoke("graph-agenda", { body });
  if (error) throw error;
  const res = data as AgendaResponse;
  if (res.status === "error" || res.status === "forbidden") throw new Error(res.message ?? "Agenda-actie mislukt");
  return res;
}

export function useAgendaEvents(startIso: string, endIso: string) {
  return useQuery({
    queryKey: ["agenda", startIso, endIso],
    queryFn: async () => {
      const res = await invokeAgenda({ action: "list", start: startIso, end: endIso });
      return { status: res.status as AgendaStatus, events: res.events ?? [] };
    },
    staleTime: 60_000,
  });
}

export function useAgendaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input:
      | { action: "create"; event: AgendaEventInput }
      | { action: "update"; id: string; event: AgendaEventInput }
      | { action: "delete"; id: string }) => invokeAgenda(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agenda"] }),
  });
}
