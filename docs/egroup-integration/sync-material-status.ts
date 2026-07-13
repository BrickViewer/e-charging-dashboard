import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// REFERENTIEKOPIE — draait als edge function `sync-material-status` in het
// e-portal-project (natxaneygihzzszabmcv); de live deploy is de bron van
// waarheid. Bij wijzigen: opnieuw deployen via MCP én deze kopie bijwerken.
//
// Ontvangt materiaal-bestelstatus-updates van het E-Charging dashboard
// (Contract 3, zie README.md). E-Charging is de bron van waarheid: elke call
// bevat de volledige actuele staat (aggregaat over de werkvoorbereidings-
// checklist) en is daarmee idempotent en laatste-wint. De update raakt ALLE
// order_lines van de opdracht (order-brede semantiek; e-charging-orders hebben
// er precies één). Scope strikt op source='e_charging_dashboard' — eigen
// e-portal-opdrachten zijn onbereikbaar via dit endpoint.
// verify_jwt=false; auth via gedeelde secret-header (zelfde secret als intake).

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

// Secret: env-first, anders uit de Vault via service-role RPC.
// deno-lint-ignore no-explicit-any
async function resolveSecret(sb: any, envKey: string, vaultName: string): Promise<string | null> {
  const fromEnv = Deno.env.get(envKey);
  if (fromEnv) return fromEnv;
  const { data, error } = await sb.rpc("get_integration_secret", { p_name: vaultName });
  if (error) return null;
  return (data as string | null) ?? null;
}

const PREPARATION_STATUSES = ["niet_nodig", "te_bestellen", "besteld", "binnen"];

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
    if (!PREPARATION_STATUSES.includes(p.preparation_status)) {
      return json({ status: "error", message: "preparation_status ongeldig (niet_nodig|te_bestellen|besteld|binnen)" }, 400);
    }
    const expectedAt =
      typeof p.materials_expected_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.materials_expected_at)
        ? p.materials_expected_at
        : null;
    const notes =
      typeof p.preparation_notes === "string" && p.preparation_notes.trim() ? p.preparation_notes.trim() : null;

    const { data: order, error: findErr } = await sb
      .from("orders")
      .select("id, order_number")
      .eq("external_reference", externalReference)
      .eq("source", "e_charging_dashboard")
      .maybeSingle();
    if (findErr) return json({ status: "error", message: findErr.message }, 500);
    // Onbekende order is voor e-charging niet fataal (wijst op drift); 404 zodat
    // de afzender het kan registreren.
    if (!order) return json({ status: "not_found", message: "Order onbekend" }, 404);

    const { data: updated, error: updErr } = await sb
      .from("order_lines")
      .update({
        preparation_status: p.preparation_status,
        materials_expected_at: expectedAt,
        preparation_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id)
      .select("id");
    if (updErr) return json({ status: "error", message: updErr.message }, 500);

    return json({ status: "ok", order_id: order.id, order_number: order.order_number, lines_updated: (updated ?? []).length });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Sync mislukt" }, 500);
  }
});
