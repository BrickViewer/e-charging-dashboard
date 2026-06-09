import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { calculatePricing, normalizePricingInput, normalizeSettings } from "../_shared/configurator.ts";
import { resolveOrCreateCompany, resolveOrCreatePerson, linkPersonToCompany } from "../_shared/contacts.ts";

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
  // Extra's vastgelegd in de sales-tool (UI-only, niet via de rekenkern):
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

    const { data: roleRows, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", session.actor_user_id);
    if (roleError) throw roleError;
    const actorRoles = (roleRows ?? []).map((r) => r.role);
    // superadmin telt als admin-niveau; meerdere rollen mogelijk dus geen .maybeSingle()
    if (
      !actorRoles.includes("admin") &&
      !actorRoles.includes("manager") &&
      !actorRoles.includes("sales") &&
      !actorRoles.includes("superadmin")
    ) {
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

    // Ruwe berekening voor de snapshot. Een "blocked" status (fee boven max of
    // negatief rendement) blokkeert NIET het opslaan: dit is een lead-vastlegging;
    // de exacte prijs wordt later bepaald. De blockingReasons blijven in
    // pricing_result staan voor interne review.
    const pricing = calculatePricing(input, settings);

    const investNote = investmentMinTotal !== null && investmentMaxTotal !== null
      ? ` · Investering €${Math.round(investmentMinTotal)}–€${Math.round(investmentMaxTotal)}`
      : "";
    const clientNotes = `Aangemaakt vanuit klant-configurator${ereEnabled ? " · ERE-subsidie: aan (€0,10/kWh)" : ""}${investNote}`;

    // Centrale contacten koppelen: vanuit de lead (indien aanwezig) of resolve-or-create.
    let companyId: string | null = null;
    let personId: string | null = null;
    if (session.lead_id) {
      const { data: leadRow } = await serviceClient
        .from("leads").select("company_id, person_id").eq("id", session.lead_id).maybeSingle();
      companyId = (leadRow?.company_id as string | null) ?? null;
      personId = (leadRow?.person_id as string | null) ?? null;
    }
    if (!companyId) {
      companyId = await resolveOrCreateCompany(serviceClient, session.organization_id, {
        name: input.customer.companyName, street: input.customer.locationAddress,
        postal: input.customer.postalCode, city: input.customer.city,
      });
    }
    if (!personId) {
      personId = await resolveOrCreatePerson(serviceClient, session.organization_id, {
        name: input.customer.contactName, email: input.customer.contactEmail, phone: input.customer.contactPhone,
      });
    }
    if (companyId && personId) await linkPersonToCompany(serviceClient, companyId, personId, true);

    // 1 bedrijf = 1 klantaccount: bestaat er al een account voor dit bedrijf, voeg
    // dan een nieuwe configuratie-versie aan dat account toe i.p.v. een tweede klant.
    let existing: { id: string; client_number: number | null; status: string | null } | null = null;
    if (companyId) {
      const { data } = await serviceClient
        .from("clients").select("id, client_number, status")
        .eq("organization_id", session.organization_id).eq("company_id", companyId)
        .neq("status", "verwijderd").order("created_at", { ascending: true }).limit(1).maybeSingle();
      existing = data as typeof existing;
    }

    let client: { id: string; client_number: number | null };
    if (existing) {
      client = { id: existing.id, client_number: existing.client_number };
      await serviceClient.from("clients").update({
        charge_rate_per_kwh: input.tariffs.chargeTariffPerKwh,
        energy_cost_per_kwh: input.tariffs.energyCostPerKwh,
        revenue_share_percentage: Math.max(0, Math.min(100, (1 - pricing.serviceFeePct) * 100)),
        contract_duration_months: input.contract.durationMonths,
        notice_period_months: input.contract.noticePeriodMonths,
        status: "actief",
      }).eq("id", existing.id);
    } else {
      const { data: created, error: clientError } = await serviceClient
        .from("clients")
        .insert({
          organization_id: session.organization_id,
          company_id: companyId,
          person_id: personId,
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
          status: "actief",
          notes: clientNotes,
        })
        .select("id, client_number")
        .single();
      if (clientError) throw clientError;
      client = { id: created.id, client_number: created.client_number };
    }

    const { data: maxConfigV } = await serviceClient
      .from("customer_configurations").select("version").eq("client_id", client.id)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: configuration, error: configurationError } = await serviceClient
      .from("customer_configurations")
      .insert({
        client_id: client.id,
        organization_id: session.organization_id,
        version: (maxConfigV?.version ?? 0) + 1,
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
        pricing_status: pricing.status,
        ere_enabled: ereEnabled,
        investment_min_total: investmentMinTotal,
        investment_max_total: investmentMaxTotal,
      },
    });

    // Configurator gestart vanuit een lead? Koppel de klant terug en zet de
    // lead op Gewonnen (voorkomt losse/dubbele klanten).
    if (session.lead_id) {
      const { data: wonStage } = await serviceClient
        .from("lead_stages")
        .select("id")
        .eq("organization_id", session.organization_id)
        .eq("is_won", true)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const leadPatch: Record<string, unknown> = { converted_client_id: client.id };
      if (wonStage?.id) leadPatch.stage_id = wonStage.id;
      await serviceClient.from("leads").update(leadPatch).eq("id", session.lead_id);
      await serviceClient.from("lead_activities").insert({
        lead_id: session.lead_id,
        organization_id: session.organization_id,
        user_id: session.actor_user_id,
        type: "converted",
        description: `Offerte vastgelegd via configurator → klant #${client.client_number ?? client.id}`,
        metadata: { client_id: client.id, configuration_id: configuration.id },
      });
    }

    return json({
      clientId: client.id,
      clientNumber: client.client_number,
      configurationId: configuration.id,
    });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Klant aanmaken mislukt" }, 500);
  }
});
