import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";

// quote-reject — wijst een VERSTUURDE offerte intern af mét gestructureerde reden
// (categorie + toelichting, voor analyse van terugkerende afwijsredenen). Trekt de
// ondertekenlink in (een afgewezen offerte kan de klant niet alsnog tekenen) en kan
// optioneel de lead op de Verloren-fase zetten met dezelfde reden (leads.lost_reason).
// Alleen intern — de klant heeft geen afwijs-knop.
// Body: { quote_id, reason_category, reason?, mark_lead_lost? }.

const corsHeaders = CORS_STD;

const CATEGORIES = ["prijs", "concurrent", "geen_behoefte", "timing", "anders"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  prijs: "Prijs te hoog", concurrent: "Gekozen voor concurrent", geen_behoefte: "Geen behoefte meer",
  timing: "Verkeerde timing", anders: "Anders",
};

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

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    const category = typeof body.reason_category === "string" ? body.reason_category : "";
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    const markLeadLost = body.mark_lead_lost === true;
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return json({ status: "error", message: "Kies een afwijsreden (categorie)" }, 400);
    }

    const { data: quote, error: qErr } = await sb.from("quotes")
      .select("id, status, quote_number, lead_id, organization_id").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    if (quote.status !== "verstuurd") {
      return json({ status: "error", message: "Alleen een verstuurde offerte kan worden afgewezen" }, 409);
    }

    const { error: upErr } = await sb.from("quotes").update({
      status: "afgewezen",
      rejected_at: new Date().toISOString(),
      rejected_by: auth.userId ?? null,
      rejected_reason_category: category,
      rejected_reason: reason,
    }).eq("id", quoteId);
    if (upErr) throw upErr;

    // Ondertekenlink + eventuele interne ondertekenverzoeken intrekken.
    const { error: revErr } = await sb.from("quote_acceptances")
      .update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");
    if (revErr) throw revErr;
    await sb.from("quote_internal_signings").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");

    const reasonText = `${CATEGORY_LABEL[category] ?? category}${reason ? `: ${reason}` : ""}`;

    if (quote.lead_id) {
      const { error: actErr } = await sb.from("lead_activities").insert({
        lead_id: quote.lead_id, organization_id: quote.organization_id, user_id: auth.userId ?? null,
        type: "quote_rejected",
        description: `Offerte ${quote.quote_number} afgewezen — ${reasonText}`,
        metadata: { quote_id: quoteId, reason_category: category },
      });
      if (actErr) throw actErr;

      if (markLeadLost) {
        const { data: lostStage, error: stErr } = await sb.from("lead_stages")
          .select("id").eq("organization_id", quote.organization_id).eq("is_lost", true)
          .order("position", { ascending: true }).limit(1).maybeSingle();
        if (stErr) throw stErr;
        if (lostStage?.id) {
          const { error: leadErr } = await sb.from("leads")
            .update({ stage_id: lostStage.id, lost_reason: reasonText }).eq("id", quote.lead_id);
          if (leadErr) throw leadErr;
        }
      }
    }

    return json({ status: "ok", quoteId, leadMarkedLost: markLeadLost && !!quote.lead_id });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Afwijzen mislukt" }, 500);
  }
});
