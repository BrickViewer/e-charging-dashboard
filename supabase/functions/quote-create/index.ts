import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Maakt een losse (standalone) concept-offerte voor een object, los van een lead.
// Het object (project_location) levert het offertenummer en het adres; bedrijf/persoon
// zijn optioneel. De regels begint blanco; de verkoper vult ze in het detail in.

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

    // Object → organisatie, nummer, adres, (eventueel) gekoppeld bedrijf.
    const { data: loc, error: locErr } = await serviceClient
      .from("project_locations")
      .select("id, organization_id, location_number, address_street, postal_code, city, company_id")
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

    // Offertenummer = locatie-document-jaar (bv. 201-01-26), zelfde mechaniek als de andere flows.
    const { data: docSeq, error: docErr } = await serviceClient.rpc("assign_document_number", { p_location_id: loc.id });
    if (docErr) throw docErr;
    const docNum = Number(docSeq);
    const yy = String(new Date().getFullYear()).slice(-2);
    const quoteNumber = `${loc.location_number}-${String(docNum).padStart(2, "0")}-${yy}`;

    // 2 maanden geldig — consistent met de offerte-PDF en de ondertekenlink.
    const validUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const offerDetails: Record<string, unknown> = {
      addressStreet: loc.address_street ?? null,
      addressPostalCode: loc.postal_code ?? null,
      addressCity: loc.city ?? null,
    };

    const lineItems = [{ description: "Levering & installatie laadpunten", qty: 1, unit_price: 0, total: 0 }];

    const { data: quote, error } = await serviceClient
      .from("quotes")
      .insert({
        organization_id: orgId,
        lead_id: null,
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
      await serviceClient.from("project_locations").update({ company_id: companyId }).eq("id", loc.id).is("company_id", null);
    }

    return json({ quoteId: quote.id, quoteNumber: quote.quote_number });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Offerte aanmaken mislukt" }, 500);
  }
});
