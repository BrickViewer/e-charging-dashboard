import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";

// Maakt een concept-offerte vanuit de opgeslagen configuratie van een lead.
// Regels worden voorgevuld vanuit de investeringsband; de verkoper kan ze bewerken.

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

    const { data: lead, error: leadErr } = await serviceClient.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return json({ status: "error", message: "Lead niet gevonden" }, 404);

    const withManagement = body.with_management !== false; // default: met beheer
    const cfg = (lead.configuration ?? null) as Record<string, any> | null;
    const pi = cfg?.pricing_input ?? null;
    const pr = cfg?.pricing_result ?? null;
    const estPoints = num(lead.estimated_charge_points);

    let lineItems: Array<{ description: string; qty: number; unit_price: number; total: number }>;
    let hardwareTotal = 0;
    let installationTotal = 0;
    let numChargePoints: number | null = estPoints;
    let tariffData: unknown = null;
    let calcData: unknown = null;
    let calcSnapshot: unknown = null;
    let monthlyProjection: unknown = null;
    let chargeRate: number | null = null;
    let energyCost: number | null = null;

    if (pi) {
      // Voorvullen vanuit de opgeslagen configuratie.
      const sockets = Math.max(1, Math.round(num(pi.hardware?.chargePoints) ?? 1));
      const invMin = Math.max(0, num(cfg?.investment_min_total) ?? 0);
      const invMax = Math.max(invMin, num(cfg?.investment_max_total) ?? invMin);
      const avg = Math.round((invMin + invMax) / 2);
      hardwareTotal = invMin;
      installationTotal = Math.max(0, avg - invMin);
      numChargePoints = sockets;
      lineItems = [
        { description: `Laadpunten (hardware) — ${sockets} stuks`, qty: sockets, unit_price: sockets > 0 ? Math.round(hardwareTotal / sockets) : hardwareTotal, total: hardwareTotal },
        { description: "Installatie, aansluiting & oplevering", qty: 1, unit_price: installationTotal, total: installationTotal },
      ];
      tariffData = pi.tariffs ?? null;
      calcData = pr ?? null;
      calcSnapshot = cfg;
      monthlyProjection = pr?.totals ?? null;
      chargeRate = num(pi.tariffs?.chargeTariffPerKwh);
      energyCost = num(pi.tariffs?.energyCostPerKwh);
    } else {
      // Blanco offerte (zonder configurator) — de verkoper vult de regels in.
      const qty = estPoints && estPoints > 0 ? Math.round(estPoints) : 1;
      lineItems = [{ description: `Levering & installatie laadpunten${estPoints ? ` — ${Math.round(estPoints)} stuks` : ""}`, qty, unit_price: 0, total: 0 }];
    }

    // 2 maanden geldig — consistent met de offerte-PDF en de ondertekenlink.
    const validUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: quote, error } = await serviceClient
      .from("quotes")
      .insert({
        organization_id: lead.organization_id,
        lead_id: lead.id,
        client_id: lead.converted_client_id ?? null,
        company_id: lead.company_id ?? null,
        person_id: lead.person_id ?? null,
        prospect_company: lead.company_name,
        prospect_contact: lead.contact_name,
        prospect_email: lead.contact_email,
        status: "concept",
        with_management: withManagement,
        valid_until: validUntil,
        num_charge_points: numChargePoints,
        charge_rate_per_kwh: chargeRate,
        energy_cost_per_kwh: energyCost,
        tariff_data: tariffData,
        calculation_data: calcData,
        calculation_snapshot: calcSnapshot,
        monthly_projection: monthlyProjection,
        line_items: lineItems,
        total_hardware_cost: hardwareTotal,
        total_installation_cost: installationTotal,
      })
      .select("id, quote_number")
      .single();
    if (error) throw error;

    // De waarde van een lead wordt bepaald door de offerte (verkoopprijs van de palen).
    await serviceClient.from("leads")
      .update({ estimated_value: Math.round(hardwareTotal + installationTotal) })
      .eq("id", lead.id);

    return json({ quoteId: quote.id, quoteNumber: quote.quote_number });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Offerte aanmaken mislukt" }, 500);
  }
});
