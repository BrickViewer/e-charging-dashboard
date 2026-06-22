import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { splitName } from "../_shared/contacts.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Maakt — als bewuste onboarding-stap — het klantaccount aan vanuit een getekende offerte,
// met door de admin gereviewde gegevens. Doet wat quote-accept vroeger automatisch deed:
// client (1 bedrijf = 1 account) + configuratie-snapshot + installatie-order + dossierlink +
// lead-koppeling. Idempotent op quote.client_id. De gereviewde gegevens worden ook naar de
// contactenlaag (bedrijf/persoon) teruggeschreven, zodat de installateur-handoff klopt.

const corsHeaders = CORS_STD;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function str(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }

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
    const reviewed = (body.client && typeof body.client === "object" ? body.client : {}) as Record<string, unknown>;
    // Optioneel: koppel de offerte aan een BESTAAND klantaccount i.p.v. een nieuw account.
    const targetClientId = typeof body.target_client_id === "string" && body.target_client_id ? body.target_client_id : null;

    const { data: quote, error: qErr } = await sb.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);
    if (quote.status !== "getekend") return json({ status: "error", message: "Alleen getekende offertes kunnen een klantaccount krijgen" }, 422);

    // Idempotent: bestaat het account al, geef het terug.
    if (quote.client_id) {
      const { data: existingClient } = await sb.from("clients").select("id, client_number").eq("id", quote.client_id).maybeSingle();
      if (existingClient) return json({ clientId: existingClient.id, clientNumber: existingClient.client_number ?? null });
    }

    const org = quote.organization_id as string;
    const { data: lead } = quote.lead_id
      ? await sb.from("leads").select("*").eq("id", quote.lead_id).maybeSingle()
      : { data: null as Record<string, unknown> | null };
    const companyId = (quote.company_id ?? lead?.company_id) as string | null;
    const personId = (quote.person_id ?? lead?.person_id) as string | null;

    // Tarieven + service-fee staan per LOCATIE (tariff_profiles), niet op het klantaccount.
    // Snapshot blijft nodig voor de configuratie-versie op het account (zie verderop).
    const snap = (quote.calculation_snapshot ?? null) as
      { settings_version?: unknown; pricing_input?: unknown; pricing_result?: Record<string, unknown> } | null;
    // Gereviewde klantgegevens (val terug op offerte/lead waar leeg gelaten).
    const fields = {
      company_name: str(reviewed.company_name) ?? quote.prospect_company ?? lead?.company_name ?? "Onbekend bedrijf",
      kvk: str(reviewed.kvk) ?? lead?.kvk ?? null,
      btw_number: str(reviewed.btw_number),
      contact_name: str(reviewed.contact_name) ?? quote.prospect_contact ?? lead?.contact_name ?? null,
      contact_email: str(reviewed.contact_email) ?? quote.prospect_email ?? lead?.contact_email ?? null,
      contact_phone: str(reviewed.contact_phone) ?? lead?.contact_phone ?? null,
      billing_address_street: str(reviewed.billing_address_street) ?? lead?.address_street ?? null,
      billing_address_postal: str(reviewed.billing_address_postal) ?? lead?.postal_code ?? null,
      billing_address_city: str(reviewed.billing_address_city) ?? lead?.city ?? null,
      contract_duration_months: num(reviewed.contract_duration_months),
      notice_period_months: num(reviewed.notice_period_months),
      managed: typeof reviewed.managed === "boolean" ? reviewed.managed : (quote.with_management === false ? false : true),
    };

    // Gereviewde gegevens terugschrijven naar de contactenlaag (bron van waarheid; best-effort).
    if (personId && (fields.contact_name || fields.contact_email || fields.contact_phone)) {
      const pPatch: Record<string, unknown> = {};
      if (fields.contact_name) { const { first_name, last_name } = splitName(fields.contact_name); pPatch.first_name = first_name; pPatch.last_name = last_name; }
      if (fields.contact_email) pPatch.email = fields.contact_email;
      if (fields.contact_phone) pPatch.phone = fields.contact_phone;
      if (Object.keys(pPatch).length) await sb.from("persons").update(pPatch).eq("id", personId); // 23505 → genegeerd
    }
    if (companyId) {
      const cPatch: Record<string, unknown> = {};
      if (fields.company_name) cPatch.name = fields.company_name;
      if (fields.kvk) cPatch.kvk = fields.kvk;
      if (fields.btw_number) cPatch.btw_number = fields.btw_number;
      if (fields.billing_address_street) cPatch.address_street = fields.billing_address_street;
      if (fields.billing_address_postal) cPatch.postal_code = fields.billing_address_postal;
      if (fields.billing_address_city) cPatch.city = fields.billing_address_city;
      if (Object.keys(cPatch).length) await sb.from("companies").update(cPatch).eq("id", companyId);
    }

    let clientId: string | null = null;
    if (targetClientId) {
      // Expliciet koppelen aan een bestaand account: alleen de offerte/locatie eraan hangen, de
      // accountgegevens van het bestaande account NIET overschrijven.
      const { data: tc } = await sb.from("clients").select("id, status").eq("organization_id", org).eq("id", targetClientId).maybeSingle();
      if (!tc || tc.status === "verwijderd") return json({ status: "error", message: "Gekozen klantaccount niet gevonden" }, 422);
      clientId = tc.id;
    } else if (companyId) {
      // 1 bedrijf = 1 actief klantaccount: bestaand account hergebruiken (reactiveren) + bijwerken.
      const { data: existing } = await sb.from("clients").select("id, status").eq("organization_id", org).eq("company_id", companyId)
        .neq("status", "verwijderd").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (existing) {
        clientId = existing.id;
        await sb.from("clients").update({ ...fields, status: "actief" }).eq("id", existing.id);
      }
    }
    if (!clientId) {
      const { data: created, error: cErr } = await sb.from("clients").insert({
        organization_id: org, company_id: companyId, person_id: personId,
        ...fields, status: "actief", notes: `Aangemaakt via offerte ${quote.quote_number}`,
      }).select("id").single();
      if (cErr) throw cErr;
      clientId = created.id;
    }

    // Configuratie-snapshot op het account (nieuwe versie).
    if (snap?.pricing_input && snap?.pricing_result) {
      const { data: maxV } = await sb.from("customer_configurations").select("version").eq("client_id", clientId)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      await sb.from("customer_configurations").insert({
        client_id: clientId, organization_id: org, version: (maxV?.version ?? 0) + 1,
        settings_version: num(snap.settings_version) ?? 1, pricing_input: snap.pricing_input,
        pricing_result: snap.pricing_result, status: "agreed",
      });
    }

    // Installatie-order (exact één per offerte).
    const { data: existingOrder } = await sb.from("installation_orders").select("id").eq("quote_id", quote.id).maybeSingle();
    if (!existingOrder) {
      await sb.from("installation_orders").insert({
        organization_id: org, client_id: clientId, quote_id: quote.id, lead_id: quote.lead_id ?? null,
        company_id: companyId, status: "nieuw", notes: `Vanuit getekende offerte ${quote.quote_number}`,
      });
    }

    // Dossier aan het account koppelen (alleen bij beheer).
    if (quote.project_location_id && quote.with_management !== false) {
      await sb.from("project_locations").update({ client_id: clientId }).eq("id", quote.project_location_id);
    }

    // Offerte + lead koppelen.
    await sb.from("quotes").update({ client_id: clientId }).eq("id", quote.id);
    if (lead) {
      await sb.from("leads").update({ converted_client_id: lead.converted_client_id ?? clientId }).eq("id", lead.id);
    }

    await sb.from("activity_log").insert({
      organization_id: org, client_id: clientId, action: "client_created_from_quote",
      details: { quote_id: quote.id, quote_number: quote.quote_number },
    });

    const { data: out } = await sb.from("clients").select("client_number").eq("id", clientId).maybeSingle();
    return json({ clientId, clientNumber: out?.client_number ?? null });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Klantaccount aanmaken mislukt" }, 500);
  }
});
