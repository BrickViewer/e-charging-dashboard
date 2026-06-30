// Cloudflare Pages advanced-mode worker voor het admin-project.
// Eén Pages-domein serveert twee SPA's: admin op / en configurator op /configurator/.
//
// Belangrijk: env.ASSETS.fetch() heeft een ingebouwde SPA-fallback naar de ROOT
// /index.html (admin) voor elk pad zonder bestand. Daardoor zou een configurator-
// clientroute (bv. /configurator/s/<id>/stap/1) de ADMIN-index krijgen. Daarom vangen
// we configurator-navigatieroutes (paden zonder bestandsextensie) hier af en serveren
// expliciet de configurator-index; echte bestanden (/configurator/assets/…) en alle
// admin-routes laten we door env.ASSETS afhandelen (inclusief de admin-SPA-fallback).
// LET OP: met een _worker.js negeert Pages `_redirects`/`_headers` → security-headers/CSP hier zetten.

// Content-Security-Policy (HANDHAVEND). script-src 'self' is de kern-anti-XSS-maatregel: er zijn GEEN
// inline scripts in de build (admin/configurator/redirect.html laden allemaal externe /assets/*.js), dus
// 'self' breekt niets en sluit injectie van uitvoerbare code af. Beeld/lettertype/style mogen ruimer
// (inert, kan geen code uitvoeren): img-src https: dekt de OSM-kaarttegels (AdminMspLocaties) +
// Leaflet-marker-CDN; fonts.googleapis/gstatic voor de @import "Outfit"-webfont; style 'unsafe-inline'
// voor inline style-attributen (offerte-template/charts/html2canvas). connect-src = Supabase (REST/realtime/
// storage/functions) + Microsoft (MSAL/Graph) + PDOK (postcode→adres-autofill). frame-src = MSAL silent-iframe.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://uuldldhmuanmjlyvnagt.supabase.co wss://uuldldhmuanmjlyvnagt.supabase.co https://login.microsoftonline.com https://graph.microsoft.com https://api.pdok.nl",
  "frame-src https://login.microsoftonline.com",
].join("; ");

// Vaste, direct-handhaafbare security-headers (geen UI-risico).
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function withSecurityHeaders(res) {
  // Alleen op HTML-documenten; assets (js/css/img) laten we ongemoeid.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("Content-Security-Policy", CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const inConfigurator = url.pathname === "/configurator" || url.pathname.startsWith("/configurator/");
    const isFile = /\.[^/]+$/.test(url.pathname); // laatste segment heeft een extensie → asset

    if (inConfigurator && !isFile) {
      // Fetch de MAP (/configurator/), niet /configurator/index.html — dat laatste
      // 308-redirect Cloudflare naar de map. De map levert direct de index-HTML (200).
      const res = await env.ASSETS.fetch(new Request(new URL("/configurator/", url.origin), request));
      return withSecurityHeaders(res);
    }
    const res = await env.ASSETS.fetch(request);
    return withSecurityHeaders(res);
  },
};
