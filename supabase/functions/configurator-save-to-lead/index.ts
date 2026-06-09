import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { calculatePricing, normalizePricingInput, normalizeSettings } from "../_shared/configurator.ts";
import { splitName } from "../_shared/contacts.ts";

// Slaat de volledige configurator-configuratie op AAN DE LEAD (geen klant).
// Sessie blijft actief zodat meerdere keren opslaan kan; fase wordt niet gewijzigd.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function buildAddress(input: ReturnType<typeof normalizePricingInput>) {
  return [input.customer.locationAddress, input.customer.postalCode, input.customer.city].filter(Boolean).join(", ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const ereEnabled = body.ere === true;
  const investmentMinTotal = Number.isFinite(Number(body.investmentMinTotal)) ? Number(body.investmentMinTotal) : null;
  const investmentMaxTotal = Number.isFinite(Number(body.investmentMaxTotal)) ? Number(body.investmentMaxTotal) : null;

  try {
    const { data: session, error: sessionError } = await serviceClient
      .from("configurator_sessions")
      .select("id, actor_user_id, organization_id, status, expires_at, settings_id, settings_version, lead_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || session.status !== "active" || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ status: "forbidden", message: "Configuratiesessie verlopen" }, 403);
    }
    if (!session.lead_id) {
      return json({ status: "error", message: "Deze sessie is niet aan een lead gekoppeld" }, 400);
    }

    const { data: roleRows, error: roleError } = await serviceClient
      .from("user_roles").select("role").eq("user_id", session.actor_user_id);
    if (roleError) throw roleError;
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("manager") && !roles.includes("sales") && !roles.includes("superadmin")) {
      return json({ status: "forbidden", message: "Gebruiker mag deze actie niet uitvoeren" }, 403);
    }

    const { data: settingsRow, error: settingsError } = await serviceClient
      .from("configurator_settings").select("version, settings").eq("id", session.settings_id).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settingsRow) return json({ status: "error", message: "Instellingen ontbreken" }, 400);

    const settings = normalizeSettings(settingsRow.settings);
    const input = normalizePricingInput(body.input, settings);
    if (!input.customer.companyName) {
      return json({ status: "error", message: "Bedrijfsnaam is verplicht", field: "companyName" }, 400);
    }
    const pricing = calculatePricing(input, settings);

    const configuration = {
      pricing_input: input,
      pricing_result: pricing,
      settings_version: settingsRow.version,
      ere: ereEnabled,
      investment_min_total: investmentMinTotal,
      investment_max_total: investmentMaxTotal,
    };

    const savedAt = new Date().toISOString();
    const { error: updateError } = await serviceClient
      .from("leads")
      .update({
        company_name: input.customer.companyName,
        contact_name: input.customer.contactName || null,
        contact_email: input.customer.contactEmail || null,
        contact_phone: input.customer.contactPhone || null,
        address_street: input.customer.locationAddress || null,
        postal_code: input.customer.postalCode || null,
        city: input.customer.city || null,
        location_type: input.customer.locationType || null,
        estimated_charge_points: input.hardware.chargePoints,
        estimated_kwh_per_month: input.usage.kwhPerChargePointMonth,
        estimated_value: Math.round(pricing.totals.customerPerYear),
        configuration,
        configuration_updated_at: savedAt,
      })
      .eq("id", session.lead_id);
    if (updateError) throw updateError;

    // Houd de centrale contacten-laag de bron van waarheid: bewerk de salesrep
    // bedrijf/contact in de configurator, dan werken we de gekoppelde records bij
    // (de propagate-trigger synct vervolgens alle gekoppelde leads/klanten).
    const { data: leadRow } = await serviceClient
      .from("leads").select("company_id, person_id").eq("id", session.lead_id).maybeSingle();
    if (leadRow?.company_id) {
      await serviceClient.from("companies").update({
        name: input.customer.companyName,
        address_street: input.customer.locationAddress || null,
        postal_code: input.customer.postalCode || null,
        city: input.customer.city || null,
      }).eq("id", leadRow.company_id);
    }
    if (leadRow?.person_id) {
      const personPatch: Record<string, unknown> = {
        email: input.customer.contactEmail || null,
        phone: input.customer.contactPhone || null,
      };
      if (input.customer.contactName && input.customer.contactName.trim()) {
        const { first_name, last_name } = splitName(input.customer.contactName);
        personPatch.first_name = first_name;
        personPatch.last_name = last_name;
      }
      await serviceClient.from("persons").update(personPatch).eq("id", leadRow.person_id);
    }

    // Draft archiveren, sessie actief laten (meermaals opslaan mogelijk).
    await serviceClient.from("configurator_drafts").update({ archived_at: savedAt }).eq("session_id", session.id);
    await serviceClient.from("configurator_sessions").update({ last_seen_at: savedAt }).eq("id", session.id);

    await serviceClient.from("lead_activities").insert({
      lead_id: session.lead_id,
      organization_id: session.organization_id,
      user_id: session.actor_user_id,
      type: "configuration_saved",
      description: "Configuratie opgeslagen via de configurator",
      metadata: {
        settings_version: settingsRow.version,
        customer_per_year: Math.round(pricing.totals.customerPerYear),
        ere_enabled: ereEnabled,
        address: buildAddress(input) || null,
      },
    });

    return json({ leadId: session.lead_id, savedAt });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Opslaan aan lead mislukt" }, 500);
  }
});
