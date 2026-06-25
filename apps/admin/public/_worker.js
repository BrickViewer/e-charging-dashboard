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

// Content-Security-Policy (voorlopig REPORT-ONLY: blokkeert niets, meldt alleen overtredingen in de
// console, zodat we de policy kunnen aanscherpen zonder de UI te breken vóór we naar enforce gaan).
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://uuldldhmuanmjlyvnagt.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https://uuldldhmuanmjlyvnagt.supabase.co wss://uuldldhmuanmjlyvnagt.supabase.co https://login.microsoftonline.com https://graph.microsoft.com",
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
  headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
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
