import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { normalizeSettings } from "../_shared/configurator.ts";
import { CORS_STD } from "../_shared/cors.ts";

const corsHeaders = CORS_STD;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getActiveSettings(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from("configurator_settings")
    .select("id, organization_id, version, settings")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getSessionSettings(serviceClient: ReturnType<typeof createClient>, sessionId: string) {
  const { data: session, error: sessionError } = await serviceClient
    .from("configurator_sessions")
    .select("id, status, expires_at, settings_id, lead_id, seed_config")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.status !== "active" || new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }

  const { data, error } = await serviceClient
    .from("configurator_settings")
    .select("id, version, settings")
    .eq("id", session.settings_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    settings: data,
    leadId: (session.lead_id as string | null) ?? null,
    seedConfig: (session.seed_config as { pricing_input?: unknown; ere?: boolean } | null) ?? null,
  };
}

// Lead-context voor de wizard: basis-prefill (klant-/behoeftevelden) + de eerder
// opgeslagen volledige configuratie (savedInput) zodat heropenen verder bewerkt.
async function getLeadContext(serviceClient: ReturnType<typeof createClient>, leadId: string) {
  const { data: lead } = await serviceClient
    .from("leads")
    .select("company_name, contact_name, contact_email, contact_phone, address_street, postal_code, city, location_type, estimated_charge_points, configuration")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return undefined;
  const prefill = {
    companyName: lead.company_name ?? "",
    contactName: lead.contact_name ?? "",
    contactEmail: lead.contact_email ?? "",
    contactPhone: lead.contact_phone ?? "",
    locationAddress: lead.address_street ?? "",
    postalCode: lead.postal_code ?? "",
    city: lead.city ?? "",
    locationType: lead.location_type ?? null,
    sockets: lead.estimated_charge_points ?? null,
  };
  const cfg = (lead.configuration ?? null) as Record<string, unknown> | null;
  const savedInput = cfg && cfg.pricing_input ? cfg.pricing_input : undefined;
  const savedExtras = cfg
    ? {
        ere: cfg.ere === true,
        investmentMin: (cfg.investment_min_total as number | null) ?? null,
        investmentMax: (cfg.investment_max_total as number | null) ?? null,
      }
    : undefined;
  return { prefill, savedInput, savedExtras };
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
  const action = String(body.action ?? "get");
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

  try {
    if (!req.headers.get("Authorization") && sessionId) {
      const result = await getSessionSettings(serviceClient, sessionId);
      if (!result) return json({ status: "forbidden", message: "Configuratiesessie verlopen" }, 403);
      const ctx = result.leadId ? await getLeadContext(serviceClient, result.leadId) : undefined;
      // Geen lead maar wél een demo-seed → gebruik die als savedInput (start vanuit
      // de demo-schaal; opslaan in de wizard maakt daarna de lead aan).
      const seed = !result.leadId && result.seedConfig ? result.seedConfig : null;
      return json({
        version: result.settings.version,
        settings: normalizeSettings(result.settings.settings),
        leadId: result.leadId,
        prefill: ctx?.prefill,
        savedInput: ctx?.savedInput ?? seed?.pricing_input,
        savedExtras: ctx?.savedExtras ?? (seed ? { ere: seed.ere === true, investmentMin: null, investmentMax: null } : undefined),
      });
    }

    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const active = await getActiveSettings(serviceClient);
    if (!active) return json({ status: "error", message: "Configurator-instellingen ontbreken" }, 404);

    if (action === "get") {
      return json({ version: active.version, settings: normalizeSettings(active.settings) });
    }

    if (action !== "update") {
      return json({ status: "error", message: "Onbekende actie" }, 400);
    }

    if (auth.role !== "admin" || !auth.userId) {
      return json({ status: "forbidden", message: "Alleen admin mag instellingen wijzigen" }, 403);
    }

    const nextSettings = normalizeSettings(body.settings);
    const nextVersion = Number(active.version ?? 1) + 1;

    const { error: deactivateError } = await serviceClient
      .from("configurator_settings")
      .update({ is_active: false })
      .eq("organization_id", active.organization_id)
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;

    const { data: created, error: createError } = await serviceClient
      .from("configurator_settings")
      .insert({
        organization_id: active.organization_id,
        version: nextVersion,
        settings: nextSettings,
        is_active: true,
        created_by: auth.userId,
      })
      .select("version, settings")
      .single();
    if (createError) throw createError;

    await serviceClient.from("activity_log").insert({
      organization_id: active.organization_id,
      user_id: auth.userId,
      action: "configurator_settings_updated",
      description: "Configurator-instellingen bijgewerkt",
      metadata: { version: nextVersion },
    });

    return json({ version: created.version, settings: normalizeSettings(created.settings) });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Configurator-instellingen verwerken mislukt" }, 500);
  }
});
