// Basis-URL voor e-mailafbeeldingen. Deze MOETEN op het verzenddomein (of een subdomein
// daarvan) staan, anders markeert o.a. Gmail ze als verdacht (Resend-waarschuwing
// "host images on the sending domain"). We hosten ze op dashboard.e-charging.nl/email/…
// (Cloudflare Pages serveert apps/admin/public/email/*), een subdomein van e-charging.nl
// dat als on-domain telt t.o.v. info@/noreply@e-charging.nl. Override via env indien nodig.
export const EMAIL_ASSET_BASE = (Deno.env.get("EMAIL_ASSET_BASE_URL") ?? "https://dashboard.e-charging.nl/email").replace(/\/+$/, "");

// Horizontale wordmark, wit — voor donkere e-mailkaarten (uitnodiging, wachtwoord, storing). 2000×400 (5:1).
export const logoBrightUrl = `${EMAIL_ASSET_BASE}/e-charging-logo-bright.png`;
// Kleur/donker logo — voor de witte offerte-mailkaart. 600×240 (2,5:1).
export const logoColorUrl = `${EMAIL_ASSET_BASE}/e-charging-logo-color.png`;
// Hero-afbeelding voor de klant-uitnodiging. 1280×420 (3,048:1).
export const heroV2Url = `${EMAIL_ASSET_BASE}/e-charging-invite-hero-v2.png`;
