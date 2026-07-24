import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient } from "../_shared/wefact.ts";
import { pushSettlement } from "../_shared/wefactSettlement.ts";

// Vangnet-cron (patroon quote-opd-sync): registreert goedgekeurde afrekeningen die nog
// GEEN WeFact-inkoopfactuur hebben, data-only (zonder PDF). De admin ziet 'pdf_pending'
// en kan vanuit de browser de compliant PDF alsnog aanhangen (re-push). Zo klopt het
// crediteurenbeheer ook als een goedkeuring plaatsvond vóór/zonder WeFact-render.
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
    if (!apiKey) return json({ status: "not_configured", message: "WeFact API-key ontbreekt", pushed: 0, skipped: 0, failed: 0 });
    const wf = new WefactClient(apiKey);

    const { data: org } = await supabase.from("organizations").select("wefact_enabled, wefact_tax_code_purchase").limit(1).maybeSingle();
    if (!org?.wefact_enabled) return json({ status: "disabled", pushed: 0, skipped: 0, failed: 0 });

    const { data: rows } = await supabase
      .from("settlements")
      .select("id")
      .in("status", ["approved", "paid", "invoice_sent", "invoice_paid"])
      .not("invoice_number", "is", null)
      .is("wefact_creditinvoice_id", null)
      .gt("client_payout", 0)
      .order("created_at", { ascending: true })
      .limit(25);

    let pushed = 0, skipped = 0, failed = 0;
    for (const row of rows ?? []) {
      try {
        const res = await pushSettlement(supabase, wf, row.id, { purchaseTaxCode: org?.wefact_tax_code_purchase ?? null });
        if (res.status === "ok") pushed++; else skipped++;
      } catch (err) {
        failed++;
        await supabase.from("settlements")
          .update({ wefact_sync_error: (err as Error).message?.slice(0, 500) ?? "fout" })
          .eq("id", row.id);
      }
    }

    return json({ status: "ok", pushed, skipped, failed });
  } catch (err) {
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_INTERNAL, "Content-Type": "application/json" } });
}
