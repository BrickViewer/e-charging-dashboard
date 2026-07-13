import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { pushMaterialStatusToEportal } from "../_shared/materialSync.ts";

// Syncet de geaggregeerde materiaal-bestelstatus van een installatie-order naar
// de e-portal-planner. Best-effort vanuit de frontend (fire-and-forget na elke
// materiaal-mutatie + retry-knop): daarom altijd HTTP 200 met een status-veld,
// nooit een harde fout — de sync herstelt zichzelf bij de volgende aanroep
// omdat hij het volledige aggregaat stuurt. Body: { order_id }

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
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    if (!orderId) return json({ status: "error", message: "order_id ontbreekt" }, 400);

    const result = await pushMaterialStatusToEportal(sb, orderId);
    return json(result);
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Materiaalsync mislukt" });
  }
});
