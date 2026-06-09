import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";

// Overdracht van een installatie-order naar het externe e-groep/e-portal-systeem
// (werkbonnen). STUB: markeert de order als overgedragen. Zodra de e-portal-API
// (endpoint + auth) beschikbaar is, wordt hier de echte call ingebouwd.
// Body: { order_id }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
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
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    if (!orderId) return json({ status: "error", message: "order_id ontbreekt" }, 400);

    const { data: order } = await sb.from("installation_orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return json({ status: "error", message: "Order niet gevonden" }, 404);

    const externalApiUrl = Deno.env.get("EPORTAL_API_URL");
    let externalRef = order.external_ref as string | null;

    // --- Echte koppeling (later): POST de werkbon naar e-groep/e-portal ---
    if (externalApiUrl) {
      // TODO: bouw de echte call zodra endpoint + auth bekend zijn.
      // const res = await fetch(externalApiUrl, { ... }); externalRef = (await res.json()).id;
    }
    if (!externalRef) externalRef = `EPORTAL-PENDING-${orderId.slice(0, 8)}`;

    await sb.from("installation_orders").update({ status: "overgedragen", external_ref: externalRef }).eq("id", orderId);

    if (order.client_id) {
      await sb.from("activity_log").insert({
        organization_id: order.organization_id, client_id: order.client_id, user_id: auth.userId ?? null,
        action: "installation_order_handed_off",
        description: `Installatie-order overgedragen naar e-portal (${externalRef})`,
        metadata: { order_id: orderId, external_ref: externalRef },
      });
    }

    return json({ status: "ok", external_ref: externalRef, configured: !!externalApiUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Overdracht mislukt" }, 500);
  }
});
