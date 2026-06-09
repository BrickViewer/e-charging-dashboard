import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";

// Converteert een lead naar een klant. Bestaat er een opgeslagen configuratie op
// de lead, dan krijgt de klant EXACT die tarieven/contract + een
// customer_configurations-snapshot. De lead wordt gelinkt en op Gewonnen gezet.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
    if (!leadId) return json({ status: "error", message: "lead_id ontbreekt" }, 400);

    const { data: lead, error: leadError } = await serviceClient
      .from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return json({ status: "error", message: "Lead niet gevonden" }, 404);
    if (lead.converted_client_id) {
      return json({ clientId: lead.converted_client_id, clientNumber: null, alreadyConverted: true });
    }

    const cfg = (lead.configuration ?? null) as Record<string, any> | null;
    const pi = cfg?.pricing_input ?? null;
    const pr = cfg?.pricing_result ?? null;

    // 1 bedrijf = 1 klantaccount: bestaat er al een (niet-verwijderd) account voor
    // dit bedrijf, koppel daaraan i.p.v. een tweede klant te maken.
    let existing: { id: string; client_number: number | null; status: string | null } | null = null;
    if (lead.company_id) {
      const { data } = await serviceClient
        .from("clients").select("id, client_number, status")
        .eq("organization_id", lead.organization_id).eq("company_id", lead.company_id)
        .neq("status", "verwijderd").order("created_at", { ascending: true }).limit(1).maybeSingle();
      existing = data as typeof existing;
    }

    let client: { id: string; client_number: number | null };
    if (existing) {
      client = { id: existing.id, client_number: existing.client_number };
      if (existing.status === "inactief") {
        await serviceClient.from("clients").update({ status: "actief" }).eq("id", existing.id);
      }
    } else {
      const clientInsert: Record<string, unknown> = {
        organization_id: lead.organization_id,
        // Zelfde bedrijf/persoon als de lead → geen dubbel contact. De sync-trigger
        // vult company_name/contact_* op de klant vanuit deze koppelingen.
        company_id: lead.company_id ?? null,
        person_id: lead.person_id ?? null,
        company_name: lead.company_name,
        kvk: lead.kvk ?? null,
        contact_name: lead.contact_name ?? null,
        contact_email: lead.contact_email ?? null,
        contact_phone: lead.contact_phone ?? null,
        billing_address_street: lead.address_street ?? null,
        billing_address_postal: lead.postal_code ?? null,
        billing_address_city: lead.city ?? null,
        status: "actief",
        notes: cfg ? "Geconverteerd vanuit lead (met configuratie)" : "Geconverteerd vanuit lead",
      };
      // Exacte tarieven/contract uit de opgeslagen configuratie.
      if (pi) {
        const chargeTariff = num(pi.tariffs?.chargeTariffPerKwh);
        const energyCost = num(pi.tariffs?.energyCostPerKwh);
        const serviceFeePct = num(pr?.serviceFeePct);
        if (chargeTariff !== null) clientInsert.charge_rate_per_kwh = chargeTariff;
        if (energyCost !== null) clientInsert.energy_cost_per_kwh = energyCost;
        if (serviceFeePct !== null) clientInsert.revenue_share_percentage = Math.max(0, Math.min(100, (1 - serviceFeePct) * 100));
        const duration = num(pi.contract?.durationMonths);
        const notice = num(pi.contract?.noticePeriodMonths);
        if (duration !== null) clientInsert.contract_duration_months = duration;
        if (notice !== null) clientInsert.notice_period_months = notice;
      }
      const { data: created, error: clientError } = await serviceClient
        .from("clients").insert(clientInsert).select("id, client_number").single();
      if (clientError) throw clientError;
      client = { id: created.id, client_number: created.client_number };
    }

    // Snapshot van de overeengekomen configuratie (nieuwe versie bij bestaand account).
    if (pi && pr) {
      const { data: maxV } = await serviceClient
        .from("customer_configurations").select("version").eq("client_id", client.id)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      await serviceClient.from("customer_configurations").insert({
        client_id: client.id,
        organization_id: lead.organization_id,
        version: (maxV?.version ?? 0) + 1,
        settings_version: num(cfg?.settings_version) ?? 1,
        pricing_input: pi,
        pricing_result: pr,
        status: "agreed",
        created_by: auth.userId ?? null,
      });
    }

    // Lead linken + naar Gewonnen.
    const { data: wonStage } = await serviceClient
      .from("lead_stages").select("id")
      .eq("organization_id", lead.organization_id).eq("is_won", true)
      .order("position", { ascending: true }).limit(1).maybeSingle();
    const leadPatch: Record<string, unknown> = { converted_client_id: client.id };
    if (wonStage?.id) leadPatch.stage_id = wonStage.id;
    await serviceClient.from("leads").update(leadPatch).eq("id", leadId);

    await serviceClient.from("lead_activities").insert({
      lead_id: leadId,
      organization_id: lead.organization_id,
      user_id: auth.userId ?? null,
      type: "converted",
      description: `Geconverteerd naar klant #${client.client_number ?? client.id}${cfg ? " (met configuratie)" : ""}`,
      metadata: { client_id: client.id },
    });
    await serviceClient.from("activity_log").insert({
      organization_id: lead.organization_id,
      client_id: client.id,
      user_id: auth.userId ?? null,
      action: "client_created",
      description: `Klant #${client.client_number ?? ""} aangemaakt vanuit lead`,
      metadata: { lead_id: leadId, from_configuration: !!cfg },
    });

    return json({ clientId: client.id, clientNumber: client.client_number });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Converteren mislukt" }, 500);
  }
});
