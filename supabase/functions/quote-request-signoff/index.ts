import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { renderInternalSignoffRequest } from "../_shared/offer-email.ts";
import { sha256Hex, generateToken } from "../_shared/hash.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// Stuurt een offerte ter ondertekening naar de gekozen interne ondertekenaar
// (een ander dan de afzender). Maakt een token-link aan, zet de status op
// 'intern_ter_ondertekening' en mailt de ondertekenaar.
// Body: { quote_id }

const corsHeaders = CORS_STD;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
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

    // De ondertekenaar hoeft vooraf geen handtekening te hebben: hij tekent op de tekenlink-pagina zelf.
    const { data: prof } = await sb.from("profiles").select("full_name, signer_title, signature_data_url").eq("user_id", signerId).maybeSingle();

    const { data: userRes } = await sb.auth.admin.getUserById(signerId);
    const signerEmail = userRes?.user?.email;
    if (!signerEmail) return json({ status: "error", message: "Geen e-mailadres bekend voor de ondertekenaar" }, 400);

    // Snapshot de ondertekenaar op de offerte; nog niet getekend (internal_signed_at blijft leeg).
    await sb.from("quotes").update({
      internal_signer_name: prof?.full_name ?? null,
      internal_signer_function: prof?.signer_title ?? null,
      internal_signature_data_url: prof?.signature_data_url ?? null,
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
        signerName: prof?.full_name ?? "collega", total, reviewUrl,
      });
      const res = await sendEmail({
        to: [signerEmail],
        subject: `Ter ondertekening · Offerte ${quote.quote_number}`,
        html, text,
        tags: [{ name: "type", value: "quote_signoff_request" }],
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
