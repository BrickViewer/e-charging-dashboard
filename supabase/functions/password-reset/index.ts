import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/hash.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { logoBrightUrl } from "../_shared/email-assets.ts";

// Publieke "wachtwoord vergeten"-flow met branded Resend-mail (verify_jwt = false).
// Body: { email: string, redirectTo?: string }
// - genereert een recovery-link (admin.generateLink type:'recovery')
// - mailt een branded link via Resend
// - anti-enumeratie: geeft ALTIJD 200 { status:"ok" } bij een geldig verzoek
// - rate-limit per IP (8/uur) en per e-mail (3/15min) via password_reset_log

const corsHeaders = CORS_STD;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// redirectTo alleen toestaan naar bekende hosts (open-redirect-preventie).
const ALLOWED_HOSTS = ["dashboard.e-charging.nl", "app.e-charging.nl", "echarging-admin-app.pages.dev", "localhost", "127.0.0.1"];
function safeRedirect(input: string | undefined, fallback: string): string {
  try {
    const u = new URL(input ?? "");
    if (ALLOWED_HOSTS.includes(u.hostname) && (u.protocol === "https:" || u.protocol === "http:")) {
      return `${u.origin}/wachtwoord-herstellen`;
    }
  } catch { /* ongeldig → fallback */ }
  return `${fallback.replace(/\/+$/, "")}/wachtwoord-herstellen`;
}

function renderResetHtml(opts: { actionLink: string; logoUrl: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <img src="${opts.logoUrl}" alt="E-Charging" height="30" style="display:block;margin-bottom:28px;" />
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">Stel je wachtwoord opnieuw in</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">We ontvingen een verzoek om het wachtwoord van je E-Charging-account opnieuw in te stellen. Klik op de knop hieronder om een nieuw wachtwoord te kiezen. Deze link is beperkt geldig.</p>
    <a href="${opts.actionLink}" style="display:inline-block;background:#05A500;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">Nieuw wachtwoord instellen</a>
    <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:24px 0 0;">Werkt de knop niet? Kopieer deze link in je browser:<br/><span style="color:#6b7280;word-break:break-all;">${opts.actionLink}</span></p>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0;">Heb je dit niet aangevraagd? Negeer deze e-mail dan — je wachtwoord blijft ongewijzigd.</p>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json({ status: "error", message: "Geldig e-mailadres verplicht" }, 400);

    const PUBLIC_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl";
    const redirectTo = safeRedirect(body.redirectTo, PUBLIC_URL);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const ipHash = await sha256Hex(ip);
    const emailHash = await sha256Hex(email);

    // Rate-limit: 8 per IP/uur, 3 per e-mail/15min.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const qAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: ipCount } = await admin.from("password_reset_log").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo);
    if ((ipCount ?? 0) >= 8) return json({ status: "rate_limited", message: "Te veel verzoeken. Probeer het later opnieuw." }, 429);
    const { count: emailCount } = await admin.from("password_reset_log").select("*", { count: "exact", head: true }).eq("email_hash", emailHash).gte("created_at", qAgo);

    await admin.from("password_reset_log").insert({ ip_hash: ipHash, email_hash: emailHash });

    // Te vaak voor dit e-mailadres → stil overslaan (geen mailbom), maar wél 200.
    if ((emailCount ?? 0) >= 3) return json({ status: "ok" });

    // Recovery-link genereren. Bestaat het account niet, dan faalt dit → anti-enumeratie: gewoon 200.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkErr || !actionLink) {
      console.warn("password-reset: geen link (account bestaat waarschijnlijk niet):", linkErr?.message);
      return json({ status: "ok" });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("password-reset: RESEND_API_KEY ontbreekt");
      return json({ status: "ok" }); // niet onthullen
    }
    const logoUrl = logoBrightUrl; // on-domain i.p.v. supabase.co
    const html = renderResetHtml({ actionLink, logoUrl });

    const res = await sendEmail({
      to: [email],
      subject: "Wachtwoord opnieuw instellen — E-Charging",
      html,
      text: `Stel je wachtwoord opnieuw in via deze link: ${actionLink}\n\nHeb je dit niet aangevraagd? Negeer deze e-mail.`,
      tags: [{ name: "type", value: "password_reset" }],
    });
    if (!res.ok) {
      console.error("password-reset Resend faalde:", res.status, await res.text());
    }
    return json({ status: "ok" });
  } catch (err) {
    console.error("password-reset failed:", (err as Error).message);
    // Generiek 200 om geen interne details/enumeratie te lekken bij onverwachte fouten.
    return json({ status: "ok" });
  }
});
