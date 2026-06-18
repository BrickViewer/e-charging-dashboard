import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { renderInternalSignoffRequest } from "../_shared/offer-email.ts";

// Stuurt een offerte ter ondertekening naar de gekozen interne ondertekenaar
// (een ander dan de afzender). Maakt een token-link aan, zet de status op
// 'intern_ter_ondertekening' en mailt de ondertekenaar.
// Body: { quote_id }

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
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
  const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
  const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    const offB64 = typeof body.off_pdf_base64 === "string" ? body.off_pdf_base64 : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);

    const signerId = quote.internal_signer_user_id as string | null;
    if (!signerId) return json({ status: "error", message: "Kies eerst een ondertekenaar" }, 400);
    if (auth.kind === "user" && auth.userId === signerId) {
      return json({ status: "error", message: "Je bent zelf de ondertekenaar — gebruik 'Onderteken & verstuur'" }, 400);
    }

    // De ondertekenaar moet admin/superadmin zijn.
    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", signerId);
    const roles = (roleRows ?? []).map((r: { role?: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("superadmin")) {
      return json({ status: "error", message: "De ondertekenaar moet admin zijn" }, 400);
    }

    const { data: prof } = await sb.from("profiles").select("full_name, signer_title, signature_data_url").eq("user_id", signerId).maybeSingle();
    if (!prof?.signature_data_url) {
      return json({ status: "no_signature", message: "Deze ondertekenaar heeft nog geen handtekening ingesteld" }, 422);
    }

    const { data: userRes } = await sb.auth.admin.getUserById(signerId);
    const signerEmail = userRes?.user?.email;
    if (!signerEmail) return json({ status: "error", message: "Geen e-mailadres bekend voor de ondertekenaar" }, 400);

    // SharePoint-dossier + ongetekende OFF (eerste verzending; blokkerend indien geconfigureerd).
    if (quote.status === "concept" && !quote.off_item_id) {
      const init = await chainToSharepointInit(quoteId, offB64);
      if (init.status !== "ok") return json({ status: "error", message: init.message || "SharePoint-init mislukt" }, 502);
    }

    // Snapshot de ondertekenaar op de offerte; nog niet getekend (internal_signed_at blijft leeg).
    await sb.from("quotes").update({
      internal_signer_name: prof.full_name ?? null,
      internal_signer_function: prof.signer_title ?? null,
      internal_signature_data_url: prof.signature_data_url,
      internal_signed_at: null,
      status: "intern_ter_ondertekening",
    }).eq("id", quoteId);

    // Oude pending tekenverzoeken intrekken, nieuw token aanmaken.
    await sb.from("quote_internal_signings").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: sErr } = await sb.from("quote_internal_signings").insert({
      quote_id: quoteId,
      organization_id: quote.organization_id,
      signer_user_id: signerId,
      token_hash: tokenHash,
      token_last4: token.slice(-4),
      status: "pending",
      expires_at: expiresAt,
    });
    if (sErr) throw sErr;

    const reviewUrl = `${PUBLIC_URL}/offerte/intern/${token}`;
    const total = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);

    if (RESEND_API_KEY) {
      const { html, text } = renderInternalSignoffRequest({
        supabaseUrl, quoteNumber: quote.quote_number, company: quote.prospect_company,
        signerName: prof.full_name ?? "collega", total, reviewUrl,
      });
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [signerEmail],
          subject: `Ter ondertekening · Offerte ${quote.quote_number}`,
          html, text,
          reply_to: "info@e-charging.nl",
          tags: [{ name: "type", value: "quote_signoff_request" }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return json({ status: "send_failed", message: `Resend gaf ${res.status}: ${errText}` }, 502);
      }
    }

    return json({ status: "requested", to: signerEmail });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Versturen mislukt" }, 500);
  }
});
