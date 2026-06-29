import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { normalizeSettings } from "../_shared/configurator.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Interne tekenpagina-backend. JWT vereist (inloggen) + de ingelogde gebruiker moet
// de toegewezen ondertekenaar zijn. Acties (POST body.action):
//  - "load"   -> offerte-samenvatting + voorgevulde handtekening (read-only)
//  - "approve"-> markeer intern getekend en stuur door naar de klant (chain quote-send)
//  - "edit"   -> zet de offerte terug op concept (wis de interne ondertekening)

const corsHeaders = CORS_STD;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

// Stuurt de (al intern getekende) offerte door naar de klant via quote-send.
async function chainToCustomerSend(quoteId: string, pdfBase64: string) {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!internalSecret || !supabaseUrl) throw new Error("INTERNAL_FUNCTION_SECRET of SUPABASE_URL ontbreekt");
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-internal-secret": internalSecret };
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey) headers.apikey = anonKey;
  const res = await fetch(`${supabaseUrl}/functions/v1/quote-send`, {
    method: "POST",
    headers,
    body: JSON.stringify({ quote_id: quoteId, pdf_base64: pdfBase64 }),
  });
  const text = await res.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = text; }
  if (!res.ok) {
    const message = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message?: unknown }).message)
      : `quote-send gaf ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    // Inloggen vereist (geen interne secret toegestaan): de ondertekenaar moet zelf zijn ingelogd.
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;
    if (auth.kind !== "user" || !auth.userId) return json({ status: "forbidden", message: "Inloggen vereist" }, 403);

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const action = typeof body.action === "string" ? body.action : "load";
    if (!token) return json({ status: "error", message: "Token ontbreekt" }, 400);

    const tokenHash = await sha256Hex(token);
    const { data: signing } = await sb.from("quote_internal_signings").select("*").eq("token_hash", tokenHash).maybeSingle();
    if (!signing) return json({ status: "not_found", message: "Tekenlink niet gevonden" }, 404);

    // Alleen de toegewezen ondertekenaar mag deze offerte beoordelen/tekenen.
    if (auth.userId !== signing.signer_user_id) {
      return json({ status: "forbidden", message: "Deze offerte is aan een andere collega toegewezen om te ondertekenen." }, 403);
    }

    const { data: quote } = await sb.from("quotes").select("*").eq("id", signing.quote_id).maybeSingle();
    if (!quote) return json({ status: "not_found", message: "Offerte niet gevonden" }, 404);

    const expired = new Date(signing.expires_at).getTime() < Date.now();
    if (signing.status === "signed") return json({ status: "already_signed", message: "Deze offerte is al getekend en naar de klant gestuurd." });
    if (signing.status === "revoked") return json({ status: "revoked", message: "Deze tekenlink is vervangen door een nieuwere." }, 410);
    if (signing.status === "edited") return json({ status: "edited", message: "Deze offerte is teruggezet op concept." }, 410);
    if (expired) return json({ status: "expired", message: "Deze tekenlink is verlopen." }, 410);

    if (action === "load") {
      const { data: lead } = quote.lead_id
        ? await sb.from("leads").select("*").eq("id", quote.lead_id).maybeSingle()
        // deno-lint-ignore no-explicit-any
        : { data: null as any };
      const total = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
      // deno-lint-ignore no-explicit-any
      const tariffs = (quote.tariff_data ?? {}) as Record<string, any>;
      // deno-lint-ignore no-explicit-any
      const snap = (quote.calculation_snapshot ?? {}) as Record<string, any>;
      const addr = lead ? [lead.address_street, [lead.postal_code, lead.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
      const { data: settingsRow } = await sb.from("configurator_settings")
        .select("settings").eq("organization_id", quote.organization_id).eq("is_active", true)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      const offerTemplate = normalizeSettings(settingsRow?.settings).offerTemplate;

      // Profiel van de ingelogde ondertekenaar: fallback voor naam/functie als er nog geen voorgevulde is.
      const { data: signerProfile } = await sb.from("profiles")
        .select("full_name, signer_title").eq("user_id", auth.userId).maybeSingle();

      const summary = {
        quoteNumber: quote.quote_number,
        company: quote.prospect_company,
        contact: quote.prospect_contact,
        addressLine: addr || null,
        numChargePoints: quote.num_charge_points ?? null,
        total,
        withManagement: quote.with_management !== false,
        withInstallation: quote.with_installation !== false,
        durationMonths: snap?.pricing_input?.contract?.durationMonths ?? null,
        noticeMonths: snap?.pricing_input?.contract?.noticePeriodMonths ?? null,
        chargeTariffPerKwh: num(quote.charge_rate_per_kwh) ?? num(tariffs.chargeTariffPerKwh),
        idleFeePerMinute: num(tariffs.idleFeePerMinute),
        startFeePerSession: num(tariffs.startFeePerSession),
        idleGraceMinutes: num(tariffs.idleGraceMinutes),
        validUntil: quote.valid_until,
        date: quote.sent_at ?? quote.created_at ?? null,
        offerDetails: (quote.offer_details ?? {}) as Record<string, unknown>,
        offerTemplate,
        // Voorgevulde interne handtekening (read-only) + klantgegevens.
        internalSignerName: quote.internal_signer_name ?? null,
        internalSignerFunction: quote.internal_signer_function ?? null,
        internalSignatureDataUrl: quote.internal_signature_data_url ?? null,
        // Fallbacks + volledige e-mailcontext voor de ondertekenaar.
        signerProfileName: signerProfile?.full_name ?? null,
        signerProfileFunction: signerProfile?.signer_title ?? null,
        recipientEmail: quote.prospect_email ?? null,
      };
      return json({ status: "ok", quote: summary });
    }

    if (action === "approve") {
      const pdfBase64 = typeof body.signed_pdf_base64 === "string" ? body.signed_pdf_base64 : "";
      if (!pdfBase64) return json({ status: "error", message: "Ondertekende PDF ontbreekt" }, 400);
      // Ter plekke getekende handtekening (optioneel) opslaan zodat de bron-van-waarheid klopt.
      const drawnSig = typeof body.signature_data_url === "string" && body.signature_data_url ? body.signature_data_url : null;
      const now = new Date().toISOString();
      const { data: prof } = await sb.from("profiles").select("full_name, signer_title").eq("user_id", auth.userId).maybeSingle();
      const patch: Record<string, string | null> = { internal_signed_at: now };
      if (drawnSig) patch.internal_signature_data_url = drawnSig;
      if (!quote.internal_signer_name) patch.internal_signer_name = prof?.full_name ?? null;
      if (!quote.internal_signer_function) patch.internal_signer_function = prof?.signer_title ?? null;
      if (!quote.internal_signer_user_id) patch.internal_signer_user_id = auth.userId;
      await sb.from("quote_internal_signings").update({ status: "signed", signed_at: now }).eq("id", signing.id);
      await sb.from("quotes").update(patch).eq("id", quote.id);
      await chainToCustomerSend(quote.id, pdfBase64);
      return json({ status: "approved" });
    }

    if (action === "edit") {
      await sb.from("quote_internal_signings").update({ status: "edited" }).eq("id", signing.id);
      await sb.from("quotes").update({
        status: "concept",
        internal_signed_at: null,
        internal_signature_data_url: null,
        internal_signer_name: null,
        internal_signer_function: null,
      }).eq("id", quote.id);
      return json({ status: "edited" });
    }

    return json({ status: "error", message: "Onbekende actie" }, 400);
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwerken mislukt" }, 500);
  }
});
