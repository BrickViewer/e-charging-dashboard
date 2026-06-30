import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { renderOfferEmail } from "../_shared/offer-email.ts";
import { sha256Hex, generateToken } from "../_shared/hash.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// Verstuurt een offerte via Resend met een beveiligde akkoord-link (token).
// Body: { quote_id, email?, pdf_base64? } — de offerte-PDF gaat altijd als bijlage mee.

const corsHeaders = CORS_INTERNAL;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: true, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    const pdfBase64 = typeof body.pdf_base64 === "string" ? body.pdf_base64.replace(/^data:[^,]+,/, "") : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await serviceClient.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    const recipient = (typeof body.email === "string" && body.email.trim()) || quote.prospect_email;
    if (!recipient) return json({ status: "error", message: "Geen e-mailadres bekend voor deze offerte" }, 400);

    // Effectieve naam van de ondertekenaar voor de mail-ondertekening. Begint bij de DB-waarde en
    // wordt hieronder bijgewerkt bij zelf-ondertekenen (anders blijft 'quote' stale → "Team E-Charging").
    let internalSignerName: string | null = quote.internal_signer_name ?? null;

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
      // Ter plekke getekende handtekening heeft voorrang op de opgeslagen; minstens een van beide vereist.
      const drawnSig = typeof body.internal_signature_data_url === "string" && body.internal_signature_data_url ? body.internal_signature_data_url : null;
      const sig = drawnSig ?? prof?.signature_data_url ?? null;
      if (!sig) return json({ status: "no_signature", message: "Teken je handtekening of stel er een in bij Instellingen › Mijn handtekening" }, 422);
      await serviceClient.from("quotes").update({
        internal_signer_user_id: auth.userId,
        internal_signer_name: prof?.full_name ?? null,
        internal_signer_function: prof?.signer_title ?? null,
        internal_signature_data_url: sig,
        internal_signed_at: new Date().toISOString(),
      }).eq("id", quoteId);
      internalSignerName = prof?.full_name ?? null;
      await serviceClient.from("quote_internal_signings").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");
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
      const od = quote.offer_details as { emailMessage?: string | null; emailClosingName?: string | null; emailGreeting?: string | null } | null;
      const customMessage = od?.emailMessage ?? null;
      // Ondertekening: expliciete override > de ondertekenaar > "Team E-Charging" (fallback in renderOfferEmail).
      const signoffName = (od?.emailClosingName?.trim()) || internalSignerName || null;
      // Aanhef: expliciete override > automatisch "Beste {contact}," (fallback in renderOfferEmail).
      const greeting = od?.emailGreeting?.trim() || null;
      const { html, text } = renderOfferEmail({
        supabaseUrl, quoteNumber: quote.quote_number, company: quote.prospect_company,
        contact: quote.prospect_contact, total, acceptUrl, validUntil: quote.valid_until,
        hasAttachment: !!pdfBase64, customMessage, signoffName, greeting,
        withInstallation: quote.with_installation, withManagement: quote.with_management, chargePoints: quote.num_charge_points,
      });
      const res = await sendEmail({
        to: [recipient],
        subject: `E-Charging · Uw offerte ${quote.quote_number}`,
        html, text,
        tags: [{ name: "type", value: "quote_offer" }],
        ...(pdfBase64 ? { attachments: [{ filename: `offerte-${quote.quote_number}.pdf`, content: pdfBase64 }] } : {}),
      });
      if (!res.ok) {
        const errText = await res.text();
        return json({ status: "send_failed", message: `Resend gaf ${res.status}: ${errText}` }, 502);
      }
    }

    // Bewaar het werkelijke verzendadres als bron-van-waarheid (bevestiging gaat hierheen).
    // Freeze adres: leeg offerte-adres → neem het adres van het gekoppelde object over, zodat een verstuurde
    // offerte niet meeverandert als het object later wijzigt.
    const odSend = (quote.offer_details ?? {}) as Record<string, unknown>;
    let frozenOd = odSend;
    const hasOfferAddr = !!(odSend.addressStreet || odSend.addressPostalCode || odSend.addressCity);
    if (!hasOfferAddr && quote.project_location_id) {
      const { data: loc } = await serviceClient.from("project_locations")
        .select("address_street, postal_code, city").eq("id", quote.project_location_id).maybeSingle();
      if (loc) frozenOd = { ...odSend, addressStreet: loc.address_street ?? null, addressPostalCode: loc.postal_code ?? null, addressCity: loc.city ?? null };
    }
    // Freeze: leg het BTW-regime (particulier?) + het effectieve adres vast bij verzenden, zodat een verstuurde
    // offerte nooit meer mee verandert met latere template-/code-/object-wijzigingen (zie isPrivate-override).
    await serviceClient.from("quotes").update({ status: "verstuurd", sent_at: new Date().toISOString(), prospect_email: recipient, is_private: !((quote.prospect_company ?? "").trim()), offer_details: frozenOd }).eq("id", quoteId);

    // Lead naar fase "Offerte verstuurd".
    if (quote.lead_id) {
      const { data: stage } = await serviceClient
        .from("lead_stages").select("id").eq("organization_id", quote.organization_id)
        .ilike("name", "%offerte%").order("position", { ascending: true }).limit(1).maybeSingle();
      // Leadwaarde volgt het verstuurde offertebedrag (zodat het leads-overzicht de dealwaarde toont).
      const leadTotal = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
      const leadPatch: Record<string, unknown> = { estimated_value: leadTotal };
      // De offerte is leidend: het aantal laadpunten uit de offerte schrijft terug naar de lead.
      if (quote.num_charge_points != null) leadPatch.estimated_charge_points = quote.num_charge_points;
      if (stage?.id) leadPatch.stage_id = stage.id;
      await serviceClient.from("leads").update(leadPatch).eq("id", quote.lead_id);
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
