import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveQuoteDossier } from "../_shared/quoteDossier.ts";
import { sanitizeName, base64ToBytes } from "../_shared/sharepoint.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// quote-sharepoint-calc — uploadt de INTERNE calculatie-xlsx naar de dossier-root,
// naast de OFF: "{offertenummer} CALC {adres}.xlsx". Anders dan de OFF is dit
// bestand overschrijfbaar: her-afronden van de calculatie ververst hetzelfde
// bestand (Graph PUT op naam behoudt het item-id). Refs op quote_calculations.
// Body: { quote_id, calc_xlsx_base64 }.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const corsHeaders = CORS_INTERNAL;
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
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: true, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const quoteId = String(body.quote_id ?? "").trim();
    const calcXlsxBase64 = String(body.calc_xlsx_base64 ?? "");
    if (!quoteId || !calcXlsxBase64) return json({ status: "error", message: "quote_id en calc_xlsx_base64 verplicht" }, 400);

    const dossier = await resolveQuoteDossier(sb, quoteId);
    if (!dossier.ok) {
      if (dossier.skipped) return json({ status: "ok", skipped: dossier.skipped });
      return json({ status: "error", message: dossier.error ?? "Dossier-resolutie mislukt" }, dossier.status ?? 500);
    }
    const { gc, driveId, folderId, addrLabel, offNumber } = dossier;

    const calcName = sanitizeName(`${offNumber} CALC ${addrLabel}`) + ".xlsx";
    const file = await gc.uploadFile(driveId, folderId, calcName, base64ToBytes(calcXlsxBase64), XLSX_MIME);

    // Refs op de calculatie — fouten niet stil negeren (42501-les).
    const { error: refErr } = await sb.from("quote_calculations").update({
      calc_item_id: file.id,
      calc_web_url: file.webUrl,
      calc_uploaded_at: new Date().toISOString(),
    }).eq("quote_id", quoteId);
    if (refErr) throw refErr;

    return json({ status: "ok", calc_web_url: file.webUrl });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Calculatie-upload mislukt" }, 500);
  }
});
