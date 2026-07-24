import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, WefactError } from "../_shared/wefact.ts";
import { pushSettlement } from "../_shared/wefactSettlement.ts";

// Zet één goedgekeurde afrekening als inkoopfactuur in WeFact, met onze compliant
// S-/B-PDF als bijlage (pdfBase64, door de browser gerenderd met de bevroren template).
// Aanroepbaar door admin/manager (JWT) én intern (cron-vangnet, zonder PDF).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_INTERNAL });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, CORS_INTERNAL, { allowInternal: true });
    if (!auth.ok) return auth.response;

    const apiKey = await resolveSecret(supabase, ["WEFACT_API_KEY"], "wefact_api_key");
    if (!apiKey) return json({ status: "not_configured", message: "WeFact API-key ontbreekt" });
    const wf = new WefactClient(apiKey);

    const { data: org } = await supabase.from("organizations").select("wefact_tax_code_purchase").limit(1).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const settlementId = String(body.settlementId ?? "");
    if (!settlementId) return json({ status: "error", message: "settlementId is verplicht" }, 400);

    const result = await pushSettlement(supabase, wf, settlementId, {
      pdfBase64: body.pdfBase64 ?? null,
      pdfFilename: body.pdfFilename ?? null,
      purchaseTaxCode: org?.wefact_tax_code_purchase ?? null,
    });

    return json({ status: result.status === "skipped" ? "skipped" : "ok", ...result });
  } catch (err) {
    // Bewaar de fout op de afrekening zodat de admin 'm ziet.
    try {
      const body2 = await req.clone().json().catch(() => ({}));
      if (body2?.settlementId) {
        await supabase.from("settlements")
          .update({ wefact_sync_error: (err as Error).message?.slice(0, 500) ?? "fout" })
          .eq("id", body2.settlementId);
      }
    } catch (_) { /* best effort */ }
    if (err instanceof WefactError) {
      return json({ status: "wefact_error", statusCode: err.status, message: err.message, errors: err.errors });
    }
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_INTERNAL, "Content-Type": "application/json" } });
}
