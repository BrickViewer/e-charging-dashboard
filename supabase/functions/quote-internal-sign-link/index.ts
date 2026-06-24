import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { sha256Hex, generateToken } from "../_shared/hash.ts";
import { CORS_STD } from "../_shared/cors.ts";

// Geeft de TOEGEWEZEN interne ondertekenaar een verse ondertekenlink in-app.
// Het ruwe token wordt nooit bewaard (alleen de hash), dus minten we hier een nieuw token
// (na verificatie dat de aanroeper de toegewezen ondertekenaar is) en geven dat terug.
// Body: { quote_id }  →  { status: "ok", token }
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
    if (auth.kind !== "user" || !auth.userId) return json({ status: "forbidden", message: "Geen gebruiker" }, 403);

    const body = await req.json().catch(() => ({}));
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    if (!quoteId) return json({ status: "error", message: "quote_id ontbreekt" }, 400);

    const { data: quote, error: qErr } = await sb.from("quotes")
      .select("id, organization_id, status, internal_signer_user_id").eq("id", quoteId).maybeSingle();
    if (qErr) throw qErr;
    if (!quote) return json({ status: "error", message: "Offerte niet gevonden" }, 404);

    if (quote.status !== "intern_ter_ondertekening") {
      return json({ status: "error", message: "Deze offerte staat niet ter ondertekening" }, 409);
    }
    if (quote.internal_signer_user_id !== auth.userId) {
      return json({ status: "forbidden", message: "Deze offerte is aan een andere collega toegewezen om te ondertekenen." }, 403);
    }

    // Oude pending links intrekken, een nieuw token aanmaken (consistent met quote-request-signoff).
    await sb.from("quote_internal_signings").update({ status: "revoked" }).eq("quote_id", quoteId).eq("status", "pending");
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: sErr } = await sb.from("quote_internal_signings").insert({
      quote_id: quoteId,
      organization_id: quote.organization_id,
      signer_user_id: auth.userId,
      token_hash: tokenHash,
      token_last4: token.slice(-4),
      status: "pending",
      expires_at: expiresAt,
    });
    if (sErr) throw sErr;

    return json({ status: "ok", token });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Link aanmaken mislukt" }, 500);
  }
});
