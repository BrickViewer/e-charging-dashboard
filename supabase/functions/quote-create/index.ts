import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Maakt een losse (standalone) concept-offerte voor een BESTAAND object. Het object levert
// het offertenummer en het adres; bedrijf/persoon zijn optioneel; de regels beginnen blanco.
//
// Elke offerte hoort in de leads-pipeline (inzicht in opvolging). lead_id is daarom ALTIJD
// gevuld: de meegegeven lead wint, anders de oudste lead van het object (junctie), anders
// wordt automatisch een lead aangemaakt in de default-fase. Het DB-vangnet
// (trigger quotes_require_lead) weigert bovendien elke offerte zonder lead.

const corsHeaders = CORS_STD;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const projectLocationId = typeof body.project_location_id === "string" ? body.project_location_id : "";
    if (!projectLocationId) return json({ status: "error", message: "project_location_id ontbreekt (een offerte hoort bij een object)" }, 400);
    const withManagement = body.with_management !== false; // default: met beheer

    // Object → organisatie, nummer, adres, (eventueel) gekoppeld bedrijf/lead. Alleen een
    // bestaand object: deze flow maakt bewust geen objecten aan (nieuwe klant = via de leads-flow).
    const { data: loc, error: locErr } = await serviceClient
      .from("project_locations")
      .select("id, organization_id, location_number, display_name, address_street, house_number, postal_code, city, company_id, lead_id")
      .eq("id", projectLocationId)
      .maybeSingle();
    if (locErr) throw locErr;
    if (!loc) return json({ status: "error", message: "Object niet gevonden" }, 404);

    const orgId = loc.organization_id as string;
    // Honoreer EXACT de keuze uit de dialoog: geen bedrijf gekozen = particulier (company_id null).
    // NIET terugvallen op het bedrijf van het object — anders erft een standalone-offerte met alleen een
    // persoon ongewild het bedrijf van dat object (bug: BrickViewer op een particulier-offerte).
    const companyId = (typeof body.company_id === "string" && body.company_id) ? body.company_id : null;
    const personId = (typeof body.person_id === "string" && body.person_id) ? body.person_id : null;

    // Prospect-velden uit het gekoppelde bedrijf/persoon (denormalized cache op de quote).
    let prospectCompany: string | null = null;
    let prospectContact: string | null = null;
    let prospectEmail: string | null = null;
    if (companyId) {
      const { data: company } = await serviceClient.from("companies").select("name").eq("id", companyId).maybeSingle();
      prospectCompany = company?.name ?? null;
    }
    if (personId) {
      const { data: person } = await serviceClient.from("persons").select("full_name, email").eq("id", personId).maybeSingle();
      prospectContact = person?.full_name ?? null;
      prospectEmail = person?.email ?? null;
    }

    // ── Lead-borging: elke offerte hoort in de pipeline ──────────────────────────
    const requestedLeadId = (typeof body.lead_id === "string" && body.lead_id) ? body.lead_id : null;
    let leadId: string | null = null;
    let leadCreated = false;

    if (requestedLeadId) {
      const { data: lead, error: leadErr } = await serviceClient
        .from("leads").select("id").eq("id", requestedLeadId).eq("organization_id", orgId).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead) return json({ status: "error", message: "Gekozen lead niet gevonden" }, 404);
      leadId = lead.id as string;
    }

    if (!leadId) {
      // Oudste gekoppelde lead van het object (junctie = bron van waarheid voor object↔lead).
      const { data: linked, error: linkErr } = await serviceClient
        .from("lead_project_locations").select("lead_id")
        .eq("project_location_id", loc.id)
        .order("created_at", { ascending: true }).limit(1);
      if (linkErr) throw linkErr;
      leadId = (linked?.[0]?.lead_id as string | undefined) ?? null;
    }

    if (!leadId) {
      // Geen lead bij dit object → automatisch aanmaken in de default-fase. Fases zijn
      // runtime-hernoembaar, dus we kijken naar is_default en vallen terug op de eerste.
      const { data: stages, error: stErr } = await serviceClient
        .from("lead_stages").select("id, is_default, position")
        .eq("organization_id", orgId).order("position", { ascending: true });
      if (stErr) throw stErr;
      const stageId = ((stages ?? []).find((s) => s.is_default) ?? (stages ?? [])[0])?.id ?? null;
      const companyName = prospectCompany ?? prospectContact ?? (loc.display_name as string | null) ?? "Onbekend";
      const { data: newLead, error: leadInsErr } = await serviceClient.from("leads").insert({
        organization_id: orgId, stage_id: stageId,
        company_id: companyId, person_id: personId,
        company_name: companyName,
        contact_name: prospectContact, contact_email: prospectEmail,
        address_street: loc.address_street, house_number: loc.house_number,
        postal_code: loc.postal_code, city: loc.city,
        owner_user_id: auth.userId ?? null, source: "offerte", position: 0,
      }).select("id").single();
      if (leadInsErr) throw leadInsErr;
      leadId = newLead.id as string;
      leadCreated = true;
    }

    // Junctie lead↔object (idempotent) + primaire lead op het object als die nog leeg is.
    {
      const { error: juncErr } = await serviceClient.from("lead_project_locations")
        .upsert({ lead_id: leadId, project_location_id: loc.id }, { onConflict: "lead_id,project_location_id", ignoreDuplicates: true });
      if (juncErr) throw juncErr;
    }
    if (!loc.lead_id) {
      const { error: plErr } = await serviceClient.from("project_locations")
        .update({ lead_id: leadId }).eq("id", loc.id).is("lead_id", null);
      if (plErr) throw plErr;
    }

    // Offertenummer = locatie-document-jaar (bv. 201-01-26), zelfde mechaniek als de andere flows.
    const { data: docSeq, error: docErr } = await serviceClient.rpc("assign_document_number", { p_location_id: loc.id });
    if (docErr) throw docErr;
    const docNum = Number(docSeq);
    const yy = String(new Date().getFullYear()).slice(-2);
    const quoteNumber = `${loc.location_number}-${String(docNum).padStart(2, "0")}-${yy}`;

    // 2 maanden geldig — consistent met de offerte-PDF en de ondertekenlink.
    const validUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Adres niet voorvullen: de offerte volgt live het gekoppelde object (per offerte te overschrijven;
    // bij verzenden wordt het effectieve adres bevroren in offer_details).
    const offerDetails: Record<string, unknown> = {};

    const lineItems = [{ description: "Levering & installatie laadpunten", qty: 1, unit_price: 0, total: 0 }];

    const { data: quote, error } = await serviceClient
      .from("quotes")
      .insert({
        organization_id: orgId,
        lead_id: leadId,
        company_id: companyId,
        person_id: personId,
        prospect_company: prospectCompany,
        prospect_contact: prospectContact,
        prospect_email: prospectEmail,
        status: "concept",
        quote_number: quoteNumber,
        project_location_id: loc.id,
        document_number: docNum,
        with_management: withManagement,
        valid_until: validUntil,
        line_items: lineItems,
        total_hardware_cost: 0,
        total_installation_cost: 0,
        offer_details: offerDetails,
      })
      .select("id, quote_number")
      .single();
    if (error) throw error;

    // Koppel het object aan het bedrijf als dat nog niet zo is.
    if (companyId && !loc.company_id) {
      const { error: coErr } = await serviceClient.from("project_locations").update({ company_id: companyId }).eq("id", loc.id).is("company_id", null);
      if (coErr) throw coErr;
    }

    return json({ quoteId: quote.id, quoteNumber: quote.quote_number, leadId, leadCreated });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Offerte aanmaken mislukt" }, 500);
  }
});
