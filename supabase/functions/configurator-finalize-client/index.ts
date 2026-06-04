import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { calculatePricing, normalizePricingInput, normalizeSettings } from "../_shared/configurator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildAddress(input: ReturnType<typeof normalizePricingInput>) {
  return [input.customer.locationAddress, input.customer.postalCode, input.customer.city]
    .filter(Boolean)
    .join(", ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

  try {
    const { data: session, error: sessionError } = await serviceClient
      .from("configurator_sessions")
      .select("id, actor_user_id, organization_id, status, expires_at, settings_id, settings_version")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || session.status !== "active" || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ status: "forbidden", message: "Configuratiesessie verlopen" }, 403);
    }

    const { data: roleRow, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", session.actor_user_id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRow?.role !== "admin" && roleRow?.role !== "manager") {
      return json({ status: "forbidden", message: "Gebruiker mag geen klanten aanmaken" }, 403);
    }

    const { data: settingsRow, error: settingsError } = await serviceClient
      .from("configurator_settings")
      .select("version, settings")
      .eq("id", session.settings_id)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settingsRow) return json({ status: "error", message: "Instellingen ontbreken" }, 400);
    if (Number(body.settingsVersion ?? settingsRow.version) !== Number(settingsRow.version)) {
      return json({ status: "error", message: "Instellingenversie is gewijzigd. Herlaad de configuratie." }, 409);
    }

    const settings = normalizeSettings(settingsRow.settings);
    const input = normalizePricingInput(body.input, settings);
    if (!input.customer.companyName) {
      return json({ status: "error", message: "Bedrijfsnaam is verplicht", field: "companyName" }, 400);
    }

    const pricing = calculatePricing(input, settings);
    if (pricing.status === "blocked") {
      return json({ status: "blocked", message: pricing.blockingReasons.join(" "), reasons: pricing.blockingReasons }, 422);
    }

    const { data: client, error: clientError } = await serviceClient
      .from("clients")
      .insert({
        organization_id: session.organization_id,
        company_name: input.customer.companyName,
        contact_name: input.customer.contactName || null,
        contact_email: input.customer.contactEmail || null,
        contact_phone: input.customer.contactPhone || null,
        billing_address: buildAddress(input) || null,
        billing_address_street: input.customer.locationAddress || null,
        billing_address_postal: input.customer.postalCode || null,
        billing_address_city: input.customer.city || null,
        charge_rate_per_kwh: input.tariffs.chargeTariffPerKwh,
        energy_cost_per_kwh: input.tariffs.energyCostPerKwh,
        revenue_share_percentage: Math.max(0, Math.min(100, (1 - pricing.serviceFeePct) * 100)),
        contract_duration_months: input.contract.durationMonths,
        notice_period_months: input.contract.noticePeriodMonths,
        status: "offerte",
        notes: "Aangemaakt vanuit klant-configurator",
      })
      .select("id, client_number")
      .single();
    if (clientError) throw clientError;

    const { data: configuration, error: configurationError } = await serviceClient
      .from("customer_configurations")
      .insert({
        client_id: client.id,
        organization_id: session.organization_id,
        version: 1,
        settings_version: settingsRow.version,
        pricing_input: input,
        pricing_result: pricing,
        source_session_id: session.id,
        created_by: session.actor_user_id,
      })
      .select("id")
      .single();
    if (configurationError) throw configurationError;

    await serviceClient
      .from("configurator_drafts")
      .update({ archived_at: new Date().toISOString() })
      .eq("session_id", session.id);

    await serviceClient
      .from("configurator_sessions")
      .update({ status: "finalized", last_seen_at: new Date().toISOString() })
      .eq("id", session.id);

    await serviceClient.from("activity_log").insert({
      organization_id: session.organization_id,
      client_id: client.id,
      user_id: session.actor_user_id,
      action: "configurator_client_finalized",
      description: "Klant aangemaakt vanuit configurator",
      metadata: {
        configuration_id: configuration.id,
        settings_version: settingsRow.version,
        service_fee_pct: pricing.serviceFeePct,
      },
    });

    return json({
      clientId: client.id,
      clientNumber: client.client_number,
      configurationId: configuration.id,
    });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Klant aanmaken mislukt" }, 500);
  }
});
