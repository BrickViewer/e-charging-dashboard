import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, WefactError } from "../_shared/wefact.ts";

// Test de WeFact-verbinding en geef meteen de administratie-specifieke BTW-codes,
// producten en debiteurgroepen terug, zodat de Settings-UI die kan mappen naar de
// org-config (wefact_tax_code_sale/-purchase, wefact_product_code_activation, ...).
// Admin-JWT of interne secret (read-only diagnostiek).
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
    if (!apiKey) {
      return json({ status: "not_configured", message: "WEFACT_API_KEY ontbreekt (Supabase secret of Vault)" });
    }

    const client = new WefactClient(apiKey);

    // settings/list levert Tax.Codes.Sale / .Purchase als OBJECTEN gekeyed op TaxCode
    // (dus geen array met Direction-veld).
    const settings = await client.settingsList();
    const codes = settings?.settings?.Tax?.Codes ?? settings?.Tax?.Codes ?? {};
    const toArr = (obj: Record<string, Record<string, unknown>> | undefined) =>
      Object.values(obj ?? {}).map((c) => ({ TaxCode: String(c?.TaxCode ?? ""), Name: String(c?.Name ?? ""), Rate: c?.Rate ?? null }));
    const saleCodes = toArr(codes?.Sale);
    const purchaseCodes = toArr(codes?.Purchase);

    // product/list voor de activatie-productmapping (best-effort).
    let products: Array<{ ProductCode: string; ProductName: string }> = [];
    try {
      const prod = await client.productList({ limit: 200 });
      products = Array.isArray(prod?.products)
        ? prod.products.map((p: Record<string, unknown>) => ({
            ProductCode: String(p?.ProductCode ?? ""),
            ProductName: String(p?.ProductName ?? ""),
          }))
        : [];
    } catch (_) {
      // productmodule kan uit staan; geen blocker voor de verbindingstest.
    }

    return json({
      status: "ok",
      message: "Verbinding met WeFact werkt",
      taxCodesSale: saleCodes,
      taxCodesPurchase: purchaseCodes,
      products,
    });
  } catch (err) {
    if (err instanceof WefactError) {
      return json({ status: "wefact_error", statusCode: err.status, message: err.message, errors: err.errors });
    }
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_INTERNAL, "Content-Type": "application/json" } });
}
