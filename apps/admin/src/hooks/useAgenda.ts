// Eigen Outlook-agenda (per ingelogde medewerker) via de delegated MSAL-koppeling
// — dezelfde die SharePoint gebruikt. Alle calls lopen browser-side op /me/... met
// het Graph-token van de ingelogde gebruiker; geen gedeelde mailbox, geen edge.
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphApi } from "@/hooks/useGraphApi";
import { useMicrosoftAuth, MicrosoftReauthRequiredError } from "@/hooks/useMicrosoftAuth";

const TZ = "Europe/Amsterdam";
const PREFER_TZ = { Prefer: `outlook.timezone="${TZ}"` };

export interface AgendaEvent {
  id: string;
  subject: string;
  start: string; // "YYYY-MM-DDTHH:mm:ss" in TZ (Prefer-header)
  end: string;
  isAllDay: boolean;
  location: string | null;
  bodyPreview: string | null;
  organizer: string | null;
  webLink: string | null;
}

// connected = Microsoft gekoppeld én lijst opgehaald; not_connected = geen MSAL-sessie
// (koppel-knop tonen); reauth_required = wel een sessie, maar de opgeslagen toestemming dekt de
// gevraagde scopes niet meer (herkoppel-knop tonen); error = wel gekoppeld maar Graph gaf een
// andere fout (retry tonen).
export type AgendaStatus = "connected" | "not_connected" | "reauth_required" | "error";

export interface AgendaEventInput {
  subject: string;
  start: string; // "YYYY-MM-DDTHH:mm" (lokale tijd) of "YYYY-MM-DD" bij allDay
  end: string;
  allDay?: boolean;
  location?: string;
  body?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(x: any): AgendaEvent {
  return {
    id: x.id as string,
    subject: (x.subject as string) || "(zonder titel)",
    start: x.start?.dateTime as string,
    end: x.end?.dateTime as string,
    isAllDay: !!x.isAllDay,
    location: (x.location?.displayName as string) || null,
    bodyPreview: (x.bodyPreview as string) || null,
    organizer: (x.organizer?.emailAddress?.name as string) || null,
    webLink: (x.webLink as string) || null,
  };
}

function toGraphEvent(e: AgendaEventInput) {
  return {
    subject: e.subject,
    isAllDay: !!e.allDay,
    start: { dateTime: e.allDay ? `${e.start.slice(0, 10)}T00:00:00` : e.start, timeZone: TZ },
    end: { dateTime: e.allDay ? `${e.end.slice(0, 10)}T00:00:00` : e.end, timeZone: TZ },
    location: e.location ? { displayName: e.location } : undefined,
    body: e.body ? { contentType: "text", content: e.body } : undefined,
  };
}

export function useAgendaEvents(startIso: string, endIso: string) {
  const { graphFetch } = useGraphApi();
  const { isConnected } = useMicrosoftAuth();

  const query = useQuery({
    queryKey: ["agenda", startIso, endIso],
    enabled: isConnected,
    staleTime: 60_000,
    // Een ontbrekende toestemming lost zichzelf niet op met herproberen; alleen een klik van de
    // gebruiker helpt. Drie zinloze rondes zouden het grijze vlak alleen maar verlengen.
    retry: (count, error) => !(error instanceof MicrosoftReauthRequiredError) && count < 2,
    queryFn: async () => {
      const select = "id,subject,start,end,isAllDay,location,bodyPreview,organizer,webLink";
      const path = `/me/calendarView?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}` +
        `&$top=250&$orderby=start/dateTime&$select=${select}`;
      const res = await graphFetch(path, { headers: PREFER_TZ });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((res?.value ?? []) as any[]).map(mapEvent);
    },
  });

  const needsReauth = query.error instanceof MicrosoftReauthRequiredError;
  const status: AgendaStatus = !isConnected
    ? "not_connected"
    : needsReauth
      ? "reauth_required"
      : query.isError
        ? "error"
        : "connected";
  return {
    status,
    events: query.data ?? [],
    // Alleen laden zolang er écht een verzoek loopt: bij reauth of fout moet de UI meteen de
    // juiste knop tonen in plaats van eindeloos een skeleton.
    isLoading: isConnected && query.isLoading && !needsReauth,
    isError: query.isError,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useAgendaMutation() {
  const { graphFetch } = useGraphApi();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (input:
      | { action: "create"; event: AgendaEventInput }
      | { action: "update"; id: string; event: AgendaEventInput }
      | { action: "delete"; id: string }) => {
      setPending(true);
      try {
        if (input.action === "create") {
          await graphFetch(`/me/events`, { method: "POST", headers: PREFER_TZ, body: JSON.stringify(toGraphEvent(input.event)) });
        } else if (input.action === "update") {
          await graphFetch(`/me/events/${encodeURIComponent(input.id)}`, { method: "PATCH", headers: PREFER_TZ, body: JSON.stringify(toGraphEvent(input.event)) });
        } else {
          await graphFetch(`/me/events/${encodeURIComponent(input.id)}`, { method: "DELETE" });
        }
        await qc.invalidateQueries({ queryKey: ["agenda"] });
      } finally {
        setPending(false);
      }
    },
    [graphFetch, qc],
  );

  return useMemo(() => ({ mutateAsync: run, isPending: pending }), [run, pending]);
}
