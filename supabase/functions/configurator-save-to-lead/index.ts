import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { calculatePricing, normalizePricingInput, normalizeSettings } from "../_shared/configurator.ts";
import { splitName, resolveOrCreateCompany, resolveOrCreatePerson, linkPersonToCompany } from "../_shared/contacts.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Slaat de volledige configurator-configuratie op AAN DE LEAD (geen klant).
// Heeft de sessie nog geen lead (losse configuratie), dan wordt er een lead
// aangemaakt — een klant ontstaat pas zodra de offerte wordt geaccepteerd.
// Sessie blijft actief zodat meerdere keren opslaan kan; fase wordt niet gewijzigd.

const corsHeaders = CORS_STD;

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
  const validScopes = ["installatie_beheer", "alleen_installatie", "alleen_beheer"];
  const scope = validScopes.includes(body.scope) ? body.scope : "installatie_beheer";

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
      scope,
      // Eenmalige activatie-/onboardingkost (alleen relevant bij alleen-beheer) — vastgelegd
      // hier waar de settings beschikbaar zijn, zodat quote-create-from-lead 'm 1:1 overneemt.
      activation_fee_total: (settings.offerTemplate?.activatiekostenPerSocket ?? 0) * input.hardware.chargePoints,
    };

    const savedAt = new Date().toISOString();

    const orgId = session.organization_id as string;
    // Configurator-leads horen in de "Geconfigureerd"-fase (niet "Nieuw"). Haal de fases
    // één keer op; val terug op de eerste fase als die fase niet bestaat (oud gedrag).
    const { data: stages } = await serviceClient
      .from("lead_stages").select("id, name, position")
      .eq("organization_id", orgId).order("position", { ascending: true });
    const configuredStage = (stages ?? []).find(
      (s) => (s.name ?? "").trim().toLowerCase() === "geconfigureerd",
    );
    const initialStageId = (configuredStage ?? stages?.[0])?.id ?? null;

    // Sessie zonder lead (losse configuratie) → maak een lead aan (géén klant).
    let leadId = session.lead_id as string | null;
    const createdNewLead = !leadId;
    if (!leadId) {
      const companyId = await resolveOrCreateCompany(serviceClient, orgId, {
        name: input.customer.companyName,
        street: input.customer.locationAddress || null,
        postal: input.customer.postalCode || null,
        city: input.customer.city || null,
      });
      const personId = await resolveOrCreatePerson(serviceClient, orgId, {
        name: input.customer.contactName || null,
        email: input.customer.contactEmail || null,
        phone: input.customer.contactPhone || null,
      });
      if (companyId && personId) await linkPersonToCompany(serviceClient, companyId, personId, true);
      const { data: newLead, error: leadErr } = await serviceClient.from("leads").insert({
        organization_id: orgId, stage_id: initialStageId,
        company_id: companyId, person_id: personId,
        company_name: input.customer.companyName,
        contact_name: input.customer.contactName || null,
        contact_email: input.customer.contactEmail || null,
        contact_phone: input.customer.contactPhone || null,
        owner_user_id: session.actor_user_id, source: "configurator", position: 0,
      }).select("id").single();
      if (leadErr) throw leadErr;
      leadId = newLead.id as string;
      await serviceClient.from("configurator_sessions").update({ lead_id: leadId }).eq("id", session.id);
    }

    // Bestaande lead: vooruit verplaatsen naar "Geconfigureerd" (forward-only) — van een
    // eerdere/geen fase naar Geconfigureerd; nooit terug, en gewonnen/verloren/latere fases
    // blijven staan. Nieuwe leads zijn hierboven al in de juiste fase aangemaakt.
    const stagePatch: { stage_id?: string } = {};
    if (!createdNewLead && configuredStage) {
      const { data: curLead } = await serviceClient
        .from("leads").select("stage_id").eq("id", leadId).maybeSingle();
      const cur = (stages ?? []).find((s) => s.id === curLead?.stage_id);
      if (!cur || cur.position < configuredStage.position) {
        stagePatch.stage_id = configuredStage.id as string;
      }
    }

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
        // Géén estimated_value uit de configuratie: de waarde van een lead wordt
        // pas bepaald bij het maken van een offerte (verkoopprijs van de palen).
        configuration,
        configuration_updated_at: savedAt,
        ...stagePatch,
      })
      .eq("id", leadId);
    if (updateError) throw updateError;

    // Houd de centrale contacten-laag de bron van waarheid: bewerk de salesrep
    // bedrijf/contact in de configurator, dan werken we de gekoppelde records bij
    // (de propagate-trigger synct vervolgens alle gekoppelde leads/klanten).
    const { data: leadRow } = await serviceClient
      .from("leads").select("company_id, person_id").eq("id", leadId).maybeSingle();
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
      lead_id: leadId,
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

    return json({ leadId, savedAt, leadCreated: createdNewLead });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Opslaan aan lead mislukt" }, 500);
  }
});
