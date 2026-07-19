/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { GraphError, graphFetch } from "../_shared/msgraph.ts";

// graph-agenda: bedrijfsagenda van het directie-werkblad via Microsoft Graph
// (app-only, zelfde Azure-app als SharePoint). Werkt op de agenda van de
// mailbox in organizations.agenda_mailbox. Alleen admins (verify_jwt = true).
// Acties: list {start,end} | create {event} | update {id,event} | delete {id}.
// Vereist eenmalig de application-permissie Calendars.ReadWrite + admin-consent.

const cors = CORS_STD;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TZ = "Europe/Amsterdam";

interface EventInput {
  subject: string;
  start: string;        // "2026-07-19T10:00" (lokale tijd) of "2026-07-19" bij allDay
  end: string;
  allDay?: boolean;
  location?: string;
  body?: string;
}

function toGraphEvent(e: EventInput) {
  return {
    subject: e.subject,
    isAllDay: !!e.allDay,
    start: { dateTime: e.allDay ? `${e.start.slice(0, 10)}T00:00:00` : e.start, timeZone: TZ },
    end: { dateTime: e.allDay ? `${e.end.slice(0, 10)}T00:00:00` : e.end, timeZone: TZ },
    location: e.location ? { displayName: e.location } : undefined,
    body: e.body ? { contentType: "text", content: e.body } : undefined,
  };
}

function mapEvent(x: any) {
  return {
    id: x.id as string,
    subject: (x.subject as string) ?? "(zonder titel)",
    start: x.start?.dateTime as string,
    end: x.end?.dateTime as string,
    isAllDay: !!x.isAllDay,
    location: (x.location?.displayName as string) || null,
    bodyPreview: (x.bodyPreview as string) || null,
    organizer: (x.organizer?.emailAddress?.name as string) || null,
    webLink: (x.webLink as string) || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    // Alleen echte admin-sessies (geen interne secret, geen managers): de agenda
    // is directie-informatie.
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: false });
    if (!auth.ok) return auth.response;
    if (auth.role !== "admin") return json({ status: "forbidden", message: "Alleen admins" }, 403);

    const { data: org } = await sb.from("organizations").select("agenda_mailbox").limit(1).maybeSingle();
    const mailbox = (org as { agenda_mailbox?: string | null } | null)?.agenda_mailbox?.trim();
    if (!mailbox) return json({ status: "not_configured", message: "Geen agenda-mailbox ingesteld (Instellingen → Standaardwaarden)" });

    const body = await req.json().catch(() => ({} as any));
    const action = typeof body.action === "string" ? body.action : "";
    const base = `/users/${encodeURIComponent(mailbox)}`;

    if (action === "list") {
      const start = typeof body.start === "string" ? body.start : "";
      const end = typeof body.end === "string" ? body.end : "";
      if (!start || !end) return json({ status: "error", message: "start/end ontbreekt" }, 400);
      const path = `${base}/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
        `&$top=250&$orderby=start/dateTime&$select=id,subject,start,end,isAllDay,location,bodyPreview,organizer,webLink`;
      const res = await graphFetch<{ value: any[] }>("GET", path, {
        headers: { Prefer: `outlook.timezone="${TZ}"` },
      });
      return json({ status: "ok", events: (res.value ?? []).map(mapEvent) });
    }

    if (action === "create") {
      const e = body.event as EventInput | undefined;
      if (!e?.subject || !e.start || !e.end) return json({ status: "error", message: "event.subject/start/end ontbreekt" }, 400);
      const created = await graphFetch<any>("POST", `${base}/events`, {
        body: toGraphEvent(e),
        headers: { Prefer: `outlook.timezone="${TZ}"` },
      });
      return json({ status: "ok", event: mapEvent(created) });
    }

    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      const e = body.event as EventInput | undefined;
      if (!id || !e) return json({ status: "error", message: "id/event ontbreekt" }, 400);
      const updated = await graphFetch<any>("PATCH", `${base}/events/${encodeURIComponent(id)}`, {
        body: toGraphEvent(e),
        headers: { Prefer: `outlook.timezone="${TZ}"` },
      });
      return json({ status: "ok", event: mapEvent(updated) });
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return json({ status: "error", message: "id ontbreekt" }, 400);
      await graphFetch<void>("DELETE", `${base}/events/${encodeURIComponent(id)}`);
      return json({ status: "ok" });
    }

    return json({ status: "error", message: `Onbekende actie: ${action}` }, 400);
  } catch (e) {
    // Ontbrekende Azure-consent (Calendars.ReadWrite) of onbekende mailbox →
    // nette setup-status zodat de frontend de instructie kan tonen.
    if (e instanceof GraphError && (e.status === 401 || e.status === 403 || e.status === 404)) {
      return json({ status: "no_consent", message: e.message, graph_status: e.status });
    }
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
