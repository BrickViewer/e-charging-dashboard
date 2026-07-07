import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { renderFaultEmail, type FaultEmailItem } from "./email-template.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { logoBrightUrl } from "../_shared/email-assets.ts";

// Verstuurt een branded storingsmail (gebundeld per locatie) naar het
// ingestelde notificatie-adres. Aangeroepen door eflux-sync (x-internal-secret)
// of handmatig door een admin (JWT). Body: { location_id?, fault_ids: string[] }.

const corsHeaders = CORS_INTERNAL;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const REASON_LABELS: Record<string, string> = {
  connectivity: "Geen verbinding",
  operational: "Operationele fout",
  heartbeat: "Geen hartslag",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const faultIds: string[] = Array.isArray(body.fault_ids) ? body.fault_ids.filter((x: unknown) => typeof x === "string") : [];
    const dryRun = body.dry_run === true;
    // force = handmatige "Mail opnieuw": negeer de email_sent_at-dedup en verstuur sowieso opnieuw.
    const force = body.force === true;
    if (faultIds.length === 0) return json({ status: "error", message: "fault_ids ontbreekt" }, 400);

    // Laad de storingen + relaties (actiekaart-data).
    const { data: faults, error } = await sb
      .from("charge_point_faults")
      .select("id, fault_reason, email_sent_at, organization_id, charge_points(name, eflux_evse_id, eflux_evse_controller_id, serial_number, brand, model, max_power), locations(name, address, city, postal_code), clients(company_name, client_number, contact_name, contact_phone, contact_email)")
      .in("id", faultIds);
    if (error) throw error;

    // Dedup: normaal alleen storingen die nog geen mail kregen. Met force (handmatig
    // "Mail opnieuw") negeren we email_sent_at en versturen we sowieso opnieuw.
    const pending = force
      ? (faults ?? [])
      : (faults ?? []).filter((f) => !(f as { email_sent_at?: string | null }).email_sent_at);
    if (pending.length === 0) return json({ status: "already_sent" });

    // Ontvanger uit de instellingen.
    const { data: org } = await sb.from("organizations").select("fault_notification_email").limit(1).maybeSingle();
    const recipient = (org as { fault_notification_email?: string | null } | null)?.fault_notification_email || "info@e-charging.nl";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://e-charging.nl").replace(/\/+$/, "");
    const logoUrl = logoBrightUrl; // on-domain i.p.v. supabase.co

    const fmtId = (...parts: (string | number | null | undefined)[]) =>
      parts.filter((x) => x !== null && x !== undefined && String(x).trim() !== "").join(" / ") || "onbekend";

    const items: FaultEmailItem[] = pending.map((raw) => {
      const f = raw as Record<string, unknown>;
      const cp = (f.charge_points ?? {}) as Record<string, unknown>;
      const loc = (f.locations ?? {}) as Record<string, unknown>;
      const cl = (f.clients ?? {}) as Record<string, unknown>;
      const addr = [loc.address, [loc.postal_code, loc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return {
        faultId: String(f.id),
        clientName: (cl.company_name as string) || "Onbekende klant",
        clientNumber: cl.client_number ? `#${cl.client_number}` : "",
        locationName: (loc.name as string) || "Onbekende locatie",
        locationAddress: addr || "Adres onbekend",
        chargePointName: (cp.name as string) || "Laadpunt",
        identifiers: fmtId(cp.eflux_evse_id as string, cp.serial_number as string, [cp.brand, cp.model].filter(Boolean).join(" ")),
        reason: REASON_LABELS[String(f.fault_reason)] ?? String(f.fault_reason),
        contactName: (cl.contact_name as string) || "Geen contact bekend",
        contactPhone: (cl.contact_phone as string) || "",
        detailUrl: `${PUBLIC_URL}/admin/storingen/${f.id}`,
      };
    });

    const firstLoc = items[0]?.locationName ?? "locatie";
    const overviewUrl = `${PUBLIC_URL}/admin/storingen`;
    const { subject, html, text } = renderFaultEmail({ items, locationName: firstLoc, overviewUrl, logoUrl });

    // Dry-run: render zonder te versturen of email_sent_at te zetten (voor tests).
    if (dryRun) {
      return json({ status: "ok_dry_run", subject, recipient, count: items.length, html_length: html.length });
    }

    // Geen Resend geconfigureerd: markeer als verstuurd-overgeslagen, geen harde fout.
    if (!RESEND_API_KEY) {
      return json({ status: "not_configured", message: "RESEND_API_KEY ontbreekt", would_send_to: recipient, count: items.length });
    }

    const resendRes = await sendEmail({
      to: [recipient],
      subject, html, text,
      tags: [{ name: "type", value: "fault_notification" }],
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      throw new Error(`Resend ${resendRes.status}: ${errText}`);
    }
    const resendData = await resendRes.json().catch(() => ({}));

    // Markeer verstuurd + log per storing.
    const now = new Date().toISOString();
    const sentIds = pending.map((f) => String((f as { id: string }).id));
    await sb.from("charge_point_faults").update({ email_sent_at: now }).in("id", sentIds);
    for (const f of pending) {
      const id = String((f as { id: string }).id);
      await sb.from("charge_point_fault_events").insert({
        fault_id: id, event_type: "email_sent",
        note: `Storingsmail ${force ? "opnieuw " : ""}verstuurd naar ${recipient}`,
      });
    }

    return json({ status: "ok", sent: sentIds.length, recipient, resend_id: (resendData as { id?: string }).id ?? null });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Versturen mislukt" }, 500);
  }
});
