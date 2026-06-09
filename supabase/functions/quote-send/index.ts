import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";

// Verstuurt een offerte via Resend met een beveiligde akkoord-link (token).
// Body: { quote_id, email? }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RESEND_API = "https://api.resend.com/emails";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bytesToHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
function generateToken() { const b = new Uint8Array(32); crypto.getRandomValues(b); return bytesToHex(b); }
async function sha256Hex(v: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))); }
const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
  const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
  const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://e-charging.nl").replace(/\/+$/, "");

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await serviceClient.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    const recipient = (typeof body.email === "string" && body.email.trim()) || quote.prospect_email;
    if (!recipient) return json({ status: "error", message: "Geen e-mailadres bekend voor deze offerte" }, 400);

    // Oude pending acceptaties intrekken.
    await serviceClient.from("quote_acceptances").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");

    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: aErr } = await serviceClient.from("quote_acceptances").insert({
      quote_id: quoteId,
      organization_id: quote.organization_id,
      token_hash: tokenHash,
      token_last4: token.slice(-4),
      status: "pending",
      expires_at: expiresAt,
    });
    if (aErr) throw aErr;

    const acceptUrl = `${PUBLIC_URL}/offerte/${token}`;
    const total = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
    const monthly = quote.monthly_projection?.customerPerMonth ? Math.round(Number(quote.monthly_projection.customerPerMonth)) : null;
    const lineRows = (Array.isArray(quote.line_items) ? quote.line_items : [])
      .map((li: any) => `<tr><td style="padding:6px 0;color:#374151">${li.description}</td><td style="padding:6px 0;text-align:right;color:#111827;font-weight:600">${euro(Number(li.total) || 0)}</td></tr>`)
      .join("");

    if (RESEND_API_KEY) {
      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7eb">
  <p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#05A500;font-weight:700;margin:0">Offerte ${quote.quote_number}</p>
  <h1 style="font-size:22px;color:#111827;margin:6px 0 4px">Uw voorstel voor laadpalen</h1>
  <p style="color:#6b7280;font-size:14px;margin:0 0 18px">Voor ${quote.prospect_company ?? "uw organisatie"}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${lineRows}
    <tr><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:700;color:#111827">Totaal investering</td>
        <td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:800;color:#111827">${euro(total)}</td></tr>
  </table>
  ${monthly ? `<p style="margin:16px 0 0;color:#374151;font-size:14px">Geschatte opbrengst: <strong style="color:#05A500">${euro(monthly)} / maand</strong></p>` : ""}
  <a href="${acceptUrl}" style="display:inline-block;margin:24px 0 8px;background:#05A500;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700">Offerte bekijken & akkoord geven</a>
  <p style="color:#9ca3af;font-size:12px;margin-top:14px">Deze link is 30 dagen geldig. Geldig tot ${quote.valid_until ?? ""}.</p>
</div></body></html>`;
      const text = `Offerte ${quote.quote_number} voor ${quote.prospect_company ?? ""}\nTotaal investering: ${euro(total)}\n${monthly ? `Geschatte opbrengst: ${euro(monthly)}/maand\n` : ""}Bekijk & accordeer: ${acceptUrl}\n(30 dagen geldig)`;
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [recipient],
          subject: `Offerte ${quote.quote_number} — e-Charging laadpalen`,
          html, text,
          reply_to: "info@e-charging.nl",
          tags: [{ name: "type", value: "quote_offer" }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return json({ status: "send_failed", message: `Resend gaf ${res.status}: ${errText}` }, 502);
      }
    }

    await serviceClient.from("quotes").update({ status: "verstuurd", sent_at: new Date().toISOString() }).eq("id", quoteId);

    // Lead naar fase "Offerte verstuurd".
    if (quote.lead_id) {
      const { data: stage } = await serviceClient
        .from("lead_stages").select("id").eq("organization_id", quote.organization_id)
        .ilike("name", "%offerte%").order("position", { ascending: true }).limit(1).maybeSingle();
      if (stage?.id) await serviceClient.from("leads").update({ stage_id: stage.id }).eq("id", quote.lead_id);
      await serviceClient.from("lead_activities").insert({
        lead_id: quote.lead_id, organization_id: quote.organization_id, user_id: auth.userId ?? null,
        type: "quote_sent", description: `Offerte ${quote.quote_number} verstuurd naar ${recipient}`,
        metadata: { quote_id: quoteId },
      });
    }

    return json({ status: "sent", to: recipient, acceptUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Versturen mislukt" }, 500);
  }
});
