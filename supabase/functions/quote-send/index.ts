import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { renderOfferEmail } from "../_shared/offer-email.ts";

// Verstuurt een offerte via Resend met een beveiligde akkoord-link (token).
// Body: { quote_id, email?, pdf_base64? } — de offerte-PDF gaat altijd als bijlage mee.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RESEND_API = "https://api.resend.com/emails";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bytesToHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
function generateToken() { const b = new Uint8Array(32); crypto.getRandomValues(b); return bytesToHex(b); }
async function sha256Hex(v: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))); }

// Chaint naar quote-sharepoint-init (maakt dossier + uploadt de ongetekende OFF).
async function chainToSharepointInit(quoteId: string, offB64: string): Promise<{ status: string; message?: string }> {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!internalSecret || !supabaseUrl) return { status: "error", message: "INTERNAL_FUNCTION_SECRET ontbreekt" };
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-internal-secret": internalSecret };
  const anon = Deno.env.get("SUPABASE_ANON_KEY"); if (anon) headers.apikey = anon;
  const res = await fetch(`${supabaseUrl}/functions/v1/quote-sharepoint-init`, { method: "POST", headers, body: JSON.stringify({ quote_id: quoteId, off_pdf_base64: offB64 }) });
  const text = await res.text();
  let payload: { status?: string; message?: string } = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { status: "error", message: text }; }
  if (!res.ok) return { status: "error", message: payload.message || `init ${res.status}` };
  return { status: payload.status ?? "error", message: payload.message };
}

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
  const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: true, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    const pdfBase64 = typeof body.pdf_base64 === "string" ? body.pdf_base64.replace(/^data:[^,]+,/, "") : "";
    const offB64 = typeof body.off_pdf_base64 === "string" ? body.off_pdf_base64 : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await serviceClient.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    const recipient = (typeof body.email === "string" && body.email.trim()) || quote.prospect_email;
    if (!recipient) return json({ status: "error", message: "Geen e-mailadres bekend voor deze offerte" }, 400);

    // Zelf-ondertekenen: stempel de eigen (server-side gelezen) handtekening op de offerte
    // voordat die naar de klant gaat. Alleen voor ingelogde admin/superadmin.
    if (body.internal_self_sign === true) {
      if (auth.kind !== "user" || !auth.userId) return json({ status: "error", message: "Zelf-ondertekenen vereist een ingelogde gebruiker" }, 403);
      const { data: roleRows } = await serviceClient.from("user_roles").select("role").eq("user_id", auth.userId);
      const roles = (roleRows ?? []).map((r: { role?: string }) => r.role);
      if (!roles.includes("admin") && !roles.includes("superadmin")) {
        return json({ status: "error", message: "Alleen admin/superadmin kan namens E-Charging tekenen" }, 403);
      }
      const { data: prof } = await serviceClient.from("profiles").select("full_name, signer_title, signature_data_url").eq("user_id", auth.userId).maybeSingle();
      if (!prof?.signature_data_url) return json({ status: "no_signature", message: "Stel eerst je handtekening in bij Instellingen › Mijn handtekening" }, 422);
      await serviceClient.from("quotes").update({
        internal_signer_user_id: auth.userId,
        internal_signer_name: prof.full_name ?? null,
        internal_signer_function: prof.signer_title ?? null,
        internal_signature_data_url: prof.signature_data_url,
        internal_signed_at: new Date().toISOString(),
      }).eq("id", quoteId);
      await serviceClient.from("quote_internal_signings").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");
    }

    // SharePoint-dossier + ongetekende OFF (eerste verzending; blokkerend indien geconfigureerd).
    if (quote.status === "concept" && !quote.off_item_id) {
      const init = await chainToSharepointInit(quoteId, offB64);
      if (init.status !== "ok") return json({ status: "error", message: init.message || "SharePoint-init mislukt" }, 502);
    }

    // Oude pending acceptaties intrekken.
    await serviceClient.from("quote_acceptances").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");

    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
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

    if (RESEND_API_KEY) {
      const { html, text } = renderOfferEmail({
        supabaseUrl, quoteNumber: quote.quote_number, company: quote.prospect_company,
        contact: quote.prospect_contact, total, acceptUrl, validUntil: quote.valid_until,
        hasAttachment: !!pdfBase64,
      });
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [recipient],
          subject: `E-Charging · Uw offerte ${quote.quote_number}`,
          html, text,
          reply_to: "info@e-charging.nl",
          tags: [{ name: "type", value: "quote_offer" }],
          ...(pdfBase64 ? { attachments: [{ filename: `offerte-${quote.quote_number}.pdf`, content: pdfBase64 }] } : {}),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return json({ status: "send_failed", message: `Resend gaf ${res.status}: ${errText}` }, 502);
      }
    }

    // Bewaar het werkelijke verzendadres als bron-van-waarheid (bevestiging gaat hierheen).
    await serviceClient.from("quotes").update({ status: "verstuurd", sent_at: new Date().toISOString(), prospect_email: recipient }).eq("id", quoteId);

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
