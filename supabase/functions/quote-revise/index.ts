import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";

// quote-revise — maakt een NIEUWE VERSIE (concept-kopie) van een verstuurde offerte, voor als
// de klant wijzigingen wil. Nieuw documentnummer in dezelfde object-reeks (208-01-26 → 208-02-26),
// zelfde lead/object/contacten; verzend-, ondertekenings- en dossier-velden gereset. De bron
// blijft geldig en tekenbaar totdat de nieuwe versie wordt VERZONDEN — quote-send zet de bron
// dan op 'vervangen' en trekt diens ondertekenlink in. Body: { quote_id }.

const corsHeaders = CORS_STD;

// Deze offer_details-keys worden pas bij verzenden bevroren; in een concept volgen ze het
// gekoppelde object weer live, dus die nemen we bewust NIET mee in de kopie.
const FREEZE_KEYS = ["addressStreet", "addressPostalCode", "addressCity"];

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
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: source, error: srcErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (srcErr) throw srcErr;
    if (!source) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    // Ook een afgewezen offerte mag een nieuwe versie krijgen (bv. afgewezen op prijs →
    // scherper voorstel); de afgewezen bron behoudt dan zijn status + reden (archief).
    if (source.status !== "verstuurd" && source.status !== "afgewezen") {
      return json({ status: "error", message: "Alleen een verstuurde of afgewezen offerte kan een nieuwe versie krijgen" }, 409);
    }
    if (!source.project_location_id) {
      return json({ status: "error", message: "Offerte heeft geen object (nodig voor het offertenummer)" }, 409);
    }

    // Nieuw documentnummer in dezelfde object-reeks.
    const { data: loc, error: locErr } = await sb.from("project_locations")
      .select("location_number").eq("id", source.project_location_id).maybeSingle();
    if (locErr) throw locErr;
    if (!loc) return json({ status: "error", message: "Object niet gevonden" }, 404);
    const { data: docSeq, error: docErr } = await sb.rpc("assign_document_number", { p_location_id: source.project_location_id });
    if (docErr) throw docErr;
    const docNum = Number(docSeq);
    const yy = String(new Date().getFullYear()).slice(-2);
    const quoteNumber = `${loc.location_number}-${String(docNum).padStart(2, "0")}-${yy}`;

    // Inhoud kopiëren; bevroren adres-keys eruit zodat het concept het object weer live volgt.
    const offerDetails = { ...((source.offer_details ?? {}) as Record<string, unknown>) };
    for (const k of FREEZE_KEYS) delete offerDetails[k];

    const { data: revision, error: insErr } = await sb.from("quotes").insert({
      organization_id: source.organization_id,
      lead_id: source.lead_id,
      company_id: source.company_id,
      person_id: source.person_id,
      client_id: source.client_id,
      project_location_id: source.project_location_id,
      prospect_company: source.prospect_company,
      prospect_contact: source.prospect_contact,
      prospect_email: source.prospect_email,
      notes: source.notes,
      locations_data: source.locations_data,
      line_items: source.line_items,
      offer_details: offerDetails,
      tariff_data: source.tariff_data,
      calculation_data: source.calculation_data,
      calculation_snapshot: source.calculation_snapshot,
      monthly_projection: source.monthly_projection,
      num_charge_points: source.num_charge_points,
      with_installation: source.with_installation,
      with_management: source.with_management,
      charge_rate_per_kwh: source.charge_rate_per_kwh,
      energy_cost_per_kwh: source.energy_cost_per_kwh,
      ere_rate_per_kwh: source.ere_rate_per_kwh,
      estimated_kwh_per_point: source.estimated_kwh_per_point,
      revenue_share_pct: source.revenue_share_pct,
      has_solar: source.has_solar,
      solar_percentage: source.solar_percentage,
      charge_point_type: source.charge_point_type,
      total_hardware_cost: source.total_hardware_cost,
      total_installation_cost: source.total_installation_cost,
      status: "concept",
      quote_number: quoteNumber,
      document_number: docNum,
      valid_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      revision_of_quote_id: source.id,
    }).select("id, quote_number").single();
    if (insErr) throw insErr;

    // Interne calculatie meekopiëren (kop + regels) — anders raakt de calculatie
    // stil kwijt bij een nieuwe versie. SharePoint-refs resetten: het nieuwe
    // offertenummer krijgt bij afronden zijn eigen CALC-bestand.
    const { data: srcCalc, error: calcErr } = await sb.from("quote_calculations").select("*").eq("quote_id", source.id).maybeSingle();
    if (calcErr) throw calcErr;
    if (srcCalc) {
      const { data: newCalc, error: calcInsErr } = await sb.from("quote_calculations").insert({
        quote_id: revision.id,
        organization_id: srcCalc.organization_id,
        status: srcCalc.status,
        schema_version: srcCalc.schema_version,
        hourly_rate: srcCalc.hourly_rate,
        km_price: srcCalc.km_price,
        retour_km: srcCalc.retour_km,
        travel_days: srcCalc.travel_days,
        stelpost_graafwerk: srcCalc.stelpost_graafwerk,
        stelpost_note: srcCalc.stelpost_note,
        summary: srcCalc.summary,
        material_sell: srcCalc.material_sell,
        material_cost: srcCalc.material_cost,
        hours_total: srcCalc.hours_total,
        labor_sell: srcCalc.labor_sell,
        travel_sell: srcCalc.travel_sell,
        total_sell: srcCalc.total_sell,
        offer_price_rounded: srcCalc.offer_price_rounded,
        finalized_at: srcCalc.finalized_at,
      }).select("id").single();
      if (calcInsErr) throw calcInsErr;

      const { data: srcLines, error: linesErr } = await sb.from("quote_calculation_lines")
        .select("*").eq("calculation_id", srcCalc.id).order("position");
      if (linesErr) throw linesErr;
      if (srcLines && srcLines.length > 0) {
        const { error: linesInsErr } = await sb.from("quote_calculation_lines").insert(
          srcLines.map((l: Record<string, unknown>) => ({
            calculation_id: newCalc.id,
            organization_id: l.organization_id,
            line_type: l.line_type,
            product_id: l.product_id,
            description: l.description,
            category: l.category,
            supplier: l.supplier,
            order_number: l.order_number,
            unit: l.unit,
            qty: l.qty,
            unit_gross: l.unit_gross,
            unit_cost: l.unit_cost,
            unit_sell: l.unit_sell,
            unit_hours: l.unit_hours,
            position: l.position,
            meta: l.meta,
          })),
        );
        if (linesInsErr) throw linesInsErr;
      }
    }

    if (source.lead_id) {
      const { error: actErr } = await sb.from("lead_activities").insert({
        lead_id: source.lead_id, organization_id: source.organization_id, user_id: auth.userId ?? null,
        type: "quote_revised",
        description: `Nieuwe versie ${revision.quote_number} gemaakt van offerte ${source.quote_number}`,
        metadata: { quote_id: revision.id, revision_of: source.id },
      });
      if (actErr) throw actErr;
    }

    return json({ quoteId: revision.id, quoteNumber: revision.quote_number });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Nieuwe versie maken mislukt" }, 500);
  }
});
