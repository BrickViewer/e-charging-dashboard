// ============================================================================
// E-GROUP PORTAL — edge function `intake-external-order` (verify_jwt=false)
// Project: natxaneygihzzszabmcv. REFERENTIE-kopie van wat via MCP is gedeployd.
// Ontvangt installatie-opdrachten van E-Charging en maakt organisatie + project
// + order(+regels) aan. Idempotent op external_reference. Auth: x-echarging-secret.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-echarging-secret, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const encoder = new TextEncoder();
function timingSafeEqual(a: string, b: string) {
  const aB = encoder.encode(a), bB = encoder.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}

// Secret: env-first, anders uit de Vault via service-role RPC get_integration_secret.
// deno-lint-ignore no-explicit-any
async function resolveSecret(sb: any, envKey: string, vaultName: string): Promise<string | null> {
  const fromEnv = Deno.env.get(envKey);
  if (fromEnv) return fromEnv;
  const { data, error } = await sb.rpc("get_integration_secret", { p_name: vaultName });
  if (error) return null;
  return (data as string | null) ?? null;
}

const SERVICE_CATEGORIES = ["e_check", "e_charging", "e_make", "e_maintenance"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const sharedSecret = await resolveSecret(sb, "ECHARGING_SHARED_SECRET", "echarging_intake_secret");
  if (!sharedSecret) return json({ status: "error", message: "Shared secret ontbreekt" }, 500);
  const provided = req.headers.get("x-echarging-secret") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !timingSafeEqual(provided, sharedSecret)) {
    return json({ status: "unauthorized", message: "Ongeldige secret" }, 401);
  }

  try {
    const p = await req.json().catch(() => ({}));
    const externalReference = typeof p.external_reference === "string" ? p.external_reference : "";
    if (!externalReference) return json({ status: "error", message: "external_reference vereist" }, 400);

    const serviceCategory = SERVICE_CATEGORIES.includes(p.service_category) ? p.service_category : "e_charging";
    const site = p.site ?? {};
    const customer = p.customer ?? {};
    if (!site.street || !site.house_number || !site.postal_code || !site.city) {
      return json({ status: "error", message: "site adres incompleet (street/house_number/postal_code/city)" }, 400);
    }
    if (!customer.name) return json({ status: "error", message: "customer.name vereist" }, 400);

    // Idempotent: bestaat de order al, geef hem terug.
    const { data: existing } = await sb.from("orders").select("id, order_number").eq("external_reference", externalReference).maybeSingle();
    if (existing) return json({ order_id: existing.id, order_number: existing.order_number, idempotent: true });

    // Organisatie match-or-create (op kvk, anders naam).
    let orgId: string | null = null;
    if (customer.kvk_number) {
      const { data: byKvk } = await sb.from("organizations").select("id").eq("kvk_number", String(customer.kvk_number)).maybeSingle();
      orgId = byKvk?.id ?? null;
    }
    if (!orgId && customer.name) {
      const { data: byName } = await sb.from("organizations").select("id").ilike("name", String(customer.name)).maybeSingle();
      orgId = byName?.id ?? null;
    }
    if (!orgId) {
      const { data: createdOrg, error: orgErr } = await sb.from("organizations").insert({
        name: customer.name,
        organization_type: customer.organization_type === "particulier" ? "particulier" : "bedrijf",
        kvk_number: customer.kvk_number ?? null,
        vat_number: customer.vat_number ?? null,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        street: customer.street ?? null,
        house_number: customer.house_number ?? null,
        postal_code: customer.postal_code ?? null,
        city: customer.city ?? null,
        country: customer.country ?? "Nederland",
      }).select("id").single();
      if (orgErr) throw orgErr;
      orgId = createdOrg.id;
    }

    // Project (installatieadres).
    const { data: projNum, error: projNumErr } = await sb.rpc("get_next_number", { p_entity_type: "project" });
    if (projNumErr) throw projNumErr;
    const { data: project, error: projErr } = await sb.from("projects").insert({
      project_number: projNum,
      street: site.street,
      house_number: site.house_number,
      postal_code: site.postal_code,
      city: site.city,
      country: site.country ?? "Nederland",
      location_name: site.location_name ?? customer.name,
      client_id: orgId,
      notes: p.notes ?? null,
    }).select("id").single();
    if (projErr) throw projErr;

    // Order.
    const { data: orderNum, error: orderNumErr } = await sb.rpc("get_next_number", { p_entity_type: "order" });
    if (orderNumErr) throw orderNumErr;
    const totals = p.totals ?? {};
    const totalAmount = (Number(totals.hardware_cost) || 0) + (Number(totals.installation_cost) || 0);
    const description = p.service_summary || p.notes || `Opdracht vanuit ${p.external_system ?? "extern"}`;
    const { data: order, error: orderErr } = await sb.from("orders").insert({
      order_number: orderNum,
      project_id: project.id,
      status: "bevestigd",
      service_category: serviceCategory,
      source: "e_charging_dashboard",
      external_reference: externalReference,
      external_system: p.external_system ?? "e-charging",
      external_callback_url: p.callback_url ?? null,
      opdrachtgever_id: orgId,
      description,
      notes: p.notes ?? null,
      material_cost: Number(totals.hardware_cost) || 0,
      labor_cost: Number(totals.installation_cost) || 0,
      total_amount: totalAmount,
    }).select("id, order_number").single();
    if (orderErr) throw orderErr;

    // Order-regels.
    const lines = Array.isArray(p.order_lines) ? p.order_lines : [];
    if (lines.length > 0) {
      const rows = lines
        .filter((l: { description?: string }) => l?.description)
        .map((l: { description: string }) => ({
          order_id: order.id,
          project_id: project.id,
          service_type: serviceCategory,
          work_description: l.description,
          status: "open",
        }));
      if (rows.length > 0) {
        const { error: linesErr } = await sb.from("order_lines").insert(rows);
        if (linesErr) throw linesErr;
      }
    }

    return json({ order_id: order.id, order_number: order.order_number });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Intake mislukt" }, 500);
  }
});
