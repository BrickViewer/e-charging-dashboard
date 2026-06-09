import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveOrCreateCompany, resolveOrCreatePerson, linkPersonToCompany } from "../_shared/contacts.ts";

// Publiek contactformulier-endpoint vanaf de website. verify_jwt = false.
// Een inzending komt binnen als LEAD in de Leads-module, met bedrijf + persoon
// netjes in de contacten-laag (gededupliceerd), zodat er niks dubbel hoeft.
// Beveiliging (gelaagd):
//   1. CORS beperkt tot de eigen domeinen.
//   2. Honeypot-veld (hp / website_url_hp).
//   3. Rate-limiting per IP (max 10 / 10 min) via contact_intake_log.
//   4. Optioneel Cloudflare Turnstile zodra TURNSTILE_SECRET_KEY is gezet.

const ALLOWED_ORIGINS = ["https://www.e-charging.nl", "https://e-charging.nl"];
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
}
function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function bytesToHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
async function sha256Hex(v: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))); }

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500, origin);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));

    // 2. Honeypot — gevuld = bot → doe alsof het lukt, sla niets op.
    if (str(body.hp) || str(body.website_url_hp)) return json({ status: "ok" }, 200, origin);

    // 4. Turnstile (alleen als de secret is geconfigureerd).
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      const token = str(body.turnstile_token);
      if (!token) return json({ status: "error", message: "Verificatie ontbreekt" }, 400, origin);
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
      const form = new FormData();
      form.append("secret", turnstileSecret);
      form.append("response", token);
      if (ip) form.append("remoteip", ip);
      const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
        .then((r) => r.json()).catch(() => ({ success: false }));
      if (!verify.success) return json({ status: "error", message: "Verificatie mislukt" }, 400, origin);
    }

    // Validatie.
    const message = str(body.message);
    if (!message) return json({ status: "error", message: "Bericht is verplicht" }, 400, origin);
    if (message.length > 5000) return json({ status: "error", message: "Bericht is te lang" }, 400, origin);
    const email = str(body.email).slice(0, 200);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ status: "error", message: "Ongeldig e-mailadres" }, 400, origin);

    // 3. Rate-limiting per IP (gehasht voor privacy): max 10 / 10 min.
    const ipRaw = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null;
    if (ipHash) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await sb.from("contact_intake_log").select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", since);
      if ((count ?? 0) >= 10) return json({ status: "rate_limited", message: "Te veel berichten — probeer het later opnieuw." }, 429, origin);
    }

    // ---- Lead aanmaken (contacten-laag: bedrijf + persoon gededupliceerd) ----
    const { data: org } = await sb.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    const orgId = (org?.id as string) ?? "00000000-0000-0000-0000-000000000001";

    const { data: stage } = await sb.from("lead_stages").select("id").eq("organization_id", orgId)
      .order("is_default", { ascending: false }).order("position", { ascending: true }).limit(1).maybeSingle();

    const name = str(body.name).slice(0, 200);
    const phone = str(body.phone).slice(0, 60);
    const companyName = str(body.company).slice(0, 200);
    const subject = str(body.subject).slice(0, 200);

    const companyId = companyName ? await resolveOrCreateCompany(sb, orgId, { name: companyName }) : null;
    const personId = await resolveOrCreatePerson(sb, orgId, { name: name || null, email: email || null, phone: phone || null });
    if (companyId && personId) await linkPersonToCompany(sb, companyId, personId, true);

    const { error } = await sb.from("leads").insert({
      organization_id: orgId,
      stage_id: stage?.id ?? null,
      company_id: companyId,
      person_id: personId,
      company_name: companyName || name || "Onbekend",
      contact_name: name || null,
      contact_email: email || null,
      contact_phone: phone || null,
      notes: subject ? `${subject}\n\n${message}` : message,
      source: "contactformulier",
      position: 0,
    });
    if (error) throw error;

    // Rate-limit-log (alleen geslaagde, echte inzendingen tellen mee).
    if (ipHash) await sb.from("contact_intake_log").insert({ ip_hash: ipHash });

    return json({ status: "ok" }, 200, origin);
  } catch (err) {
    console.error("contact-intake failed:", err instanceof Error ? err.message : err);
    return json({ status: "error", message: "Versturen mislukt" }, 500, origin);
  }
});
