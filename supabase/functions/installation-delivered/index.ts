import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderInternalDeliveredNotice } from "../_shared/offer-email.ts";

// installation-delivered — publieke endpoint waar het externe e-groep/e-portal-systeem
// naartoe POST't zodra een werkbon is afgetekend voor oplevering ("opgeleverd").
// e-charging weet dan dat er een installatiefactuur gestuurd moet worden: de order
// gaat naar status 'opgeleverd' (+ "Factuur sturen"-badge in de Installatie-tab) en
// er gaat een interne melding naar info@e-charging.nl.
//
// Beveiliging: gedeelde sleutel in de header `x-eportal-secret` (timing-safe) tegen
// env EPORTAL_WEBHOOK_SECRET. verify_jwt = false (deployen met --no-verify-jwt).
//
// LET OP — de exacte e-portal-payload is nog ONBEKEND. De body-matching hieronder is
// daarom bewust tolerant (meerdere alias/geneste vormen). Vervang dit zodra het echte
// e-portal-contract bekend is. We matchen bij voorkeur op `external_ref` — precies de
// waarde die order-handoff bij de overdracht heeft opgeslagen.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-eportal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const encoder = new TextEncoder();
function timingSafeEqual(a: string, b: string) {
  const aB = encoder.encode(a);
  const bB = encoder.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

const RESEND_API = "https://api.resend.com/emails";
async function sendEmail(opts: { to: string; subject: string; html: string; text: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
  const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [opts.to], subject: opts.subject,
        html: opts.html, text: opts.text, reply_to: "info@e-charging.nl",
      }),
    });
  } catch (_e) { /* mail mag de webhook niet blokkeren → geen retry-storm */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const expected = Deno.env.get("EPORTAL_WEBHOOK_SECRET") ?? "";
  if (!expected) return json({ status: "not_configured", message: "EPORTAL_WEBHOOK_SECRET ontbreekt" }, 500);
  const provided = req.headers.get("x-eportal-secret") ?? "";
  if (!timingSafeEqual(provided, expected)) return json({ status: "unauthorized", message: "Ongeldige sleutel" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ASSUMED body — tolerant parsen. Identificeer de order via external_ref (voorkeur)
  // of order_id; accepteer een paar geneste/alias-vormen.
  const raw = await req.json().catch(() => ({})) as Record<string, unknown>;
  const data = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const werkbon = (data.werkbon && typeof data.werkbon === "object" ? data.werkbon : {}) as Record<string, unknown>;

  const externalRef =
    str(data.external_ref) ?? str(data.reference) ?? str(data.werkbon_ref) ??
    str(werkbon.reference) ?? str(werkbon.ref);
  const orderId = str(data.order_id) ?? str(data.id);
  const deliveredRaw = str(data.delivered_at) ?? str(data.opgeleverd_at) ?? str(data.signed_at) ?? str(werkbon.signed_at);
  const deliveredAt = deliveredRaw && !isNaN(Date.parse(deliveredRaw)) ? new Date(deliveredRaw).toISOString() : new Date().toISOString();

  if (!externalRef && !orderId) return json({ status: "error", message: "external_ref of order_id verplicht" }, 400);

  try {
    let query = sb.from("installation_orders").select("*, clients(company_name, client_number)");
    query = externalRef ? query.eq("external_ref", externalRef) : query.eq("id", orderId!);
    const { data: order } = await query.maybeSingle();
    if (!order) return json({ status: "not_found", message: "Order niet gevonden" }, 404);

    // Idempotent: de e-portal kan retryen. Al opgeleverd/afgerond → bevestig zonder
    // opnieuw te updaten of te mailen.
    if (order.status === "opgeleverd" || order.status === "afgerond") {
      return json({ status: "ok", already: true, order_id: order.id });
    }

    await sb.from("installation_orders")
      .update({ status: "opgeleverd", delivered_at: deliveredAt })
      .eq("id", order.id);

    if (order.client_id) {
      await sb.from("activity_log").insert({
        organization_id: order.organization_id, client_id: order.client_id, user_id: null,
        action: "installation_order_delivered",
        description: `Werkbon opgeleverd in e-portal (${order.external_ref ?? "—"}) — factuur sturen`,
        metadata: { order_id: order.id, external_ref: order.external_ref, delivered_at: deliveredAt },
      });
    }

    // Interne melding: e-charging moet factureren.
    const company = (order as { clients?: { company_name?: string | null } | null }).clients?.company_name ?? null;
    const mail = renderInternalDeliveredNotice({
      supabaseUrl, company, externalRef: order.external_ref ?? null, deliveredAt,
    });
    await sendEmail({
      to: "info@e-charging.nl",
      subject: `Installatie opgeleverd${company ? ` — ${company}` : ""} — factuur sturen`,
      html: mail.html, text: mail.text,
    });

    return json({ status: "ok", order_id: order.id });
  } catch (err) {
    console.error("installation-delivered failed:", (err as Error).message);
    return json({ status: "error", message: "Verwerken oplevering mislukt" }, 500);
  }
});
