import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/auth.ts";
import { mapEgroupStatus } from "../_shared/installationHandoff.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { CORS_ECHARGING_SECRET } from "../_shared/cors.ts";

// Inbound webhook: E-Group meldt statuswijzigingen van een doorgezette
// installatie-order terug (volledige spiegeling). verify_jwt=false; auth via
// gedeelde secret-header. Body = Contract 2.

const corsHeaders = CORS_ECHARGING_SECRET;
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

  // Auth: gedeelde secret (env-first, anders Vault), timing-safe vergeleken.
  const webhookSecret = await resolveSecret(sb, ["EGROUP_WEBHOOK_SECRET"], "egroup_webhook_secret");
  if (!webhookSecret) return json({ status: "error", message: "Webhook-secret ontbreekt" }, 500);
  const provided =
    req.headers.get("x-echarging-secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !timingSafeEqual(provided, webhookSecret)) {
    return json({ status: "unauthorized", message: "Ongeldige secret" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const externalReference = typeof body.external_reference === "string" ? body.external_reference : "";
    const egroupOrderId = typeof body.egroup_order_id === "string" ? body.egroup_order_id : "";
    const egroupStatus = typeof body.status === "string" ? body.status : "";
    if ((!externalReference && !egroupOrderId) || !egroupStatus) {
      return json({ status: "error", message: "external_reference/egroup_order_id + status vereist" }, 400);
    }

    // Zoek de order op interne id (external_reference) of op egroup_order_id.
    let query = sb.from("installation_orders").select("*");
    query = externalReference ? query.eq("id", externalReference) : query.eq("egroup_order_id", egroupOrderId);
    const { data: order } = await query.maybeSingle();
    if (!order) return json({ status: "error", message: "Order niet gevonden" }, 404);

    const mapped = mapEgroupStatus(egroupStatus);
    const patch: Record<string, unknown> = { external_status: egroupStatus };
    if (mapped.status) patch.status = mapped.status;
    if (mapped.completed) patch.completed_at = body.completed_at ?? order.completed_at ?? new Date().toISOString();
    if (typeof body.scheduled_date === "string") patch.scheduled_date = body.scheduled_date;
    if (egroupOrderId && !order.egroup_order_id) patch.egroup_order_id = egroupOrderId;

    // Idempotent: niets te doen als status + completed_at al kloppen.
    const noop =
      order.external_status === egroupStatus &&
      (!mapped.status || order.status === mapped.status) &&
      (!mapped.completed || !!order.completed_at);
    if (noop) return json({ status: "ok", noop: true });

    await sb.from("installation_orders").update(patch).eq("id", order.id);

    if (order.client_id) {
      await sb.from("activity_log").insert({
        organization_id: order.organization_id,
        client_id: order.client_id,
        user_id: null,
        action: "installation_order_status_synced",
        description: `E-Group status bijgewerkt naar "${egroupStatus}"`,
        metadata: {
          order_id: order.id,
          egroup_status: egroupStatus,
          mapped_status: mapped.status,
          work_order_pdf_url: body.work_order_pdf_url ?? null,
          note: body.note ?? null,
        },
      });
    }

    return json({ status: "ok" });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwerking mislukt" }, 500);
  }
});
