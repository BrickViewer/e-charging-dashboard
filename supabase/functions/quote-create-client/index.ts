import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Maakt — als bewuste onboarding-stap — het klantaccount aan vanuit een getekende offerte.
// Dunne wrapper: deze functie is de AUTH-gate; alle muterende stappen (client + configuratie-snapshot
// + installatie-order + dossierlink + offerte/lead-koppeling + contactenlaag) gebeuren ATOMAIR in de
// plpgsql-functie create_client_from_quote (faalt er iets → alles rolt terug, geen half-aangemaakte klant).
// Idempotent op quote.client_id; ondersteunt target_client_id (koppelen aan bestaand account).

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
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);
    const reviewed = body.client && typeof body.client === "object" ? body.client : {};
    const targetClientId = typeof body.target_client_id === "string" && body.target_client_id ? body.target_client_id : null;

    const { data, error } = await sb.rpc("create_client_from_quote", {
      p_quote_id: quoteId,
      p_reviewed: reviewed,
      p_target_client_id: targetClientId,
    });
    if (error) return json({ status: "error", message: error.message }, 400);
    if (!data?.clientId) return json({ status: "error", message: "Klantaccount aanmaken mislukt" }, 500);
    return json(data);
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Klantaccount aanmaken mislukt" }, 500);
  }
});
