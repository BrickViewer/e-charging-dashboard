// Cloudflare Pages advanced-mode worker voor het admin-project.
// Eén Pages-domein serveert twee SPA's: admin op / en configurator op /configurator/.
//
// Belangrijk: env.ASSETS.fetch() heeft een ingebouwde SPA-fallback naar de ROOT
// /index.html (admin) voor elk pad zonder bestand. Daardoor zou een configurator-
// clientroute (bv. /configurator/s/<id>/stap/1) de ADMIN-index krijgen. Daarom vangen
// we configurator-navigatieroutes (paden zonder bestandsextensie) hier af en serveren
// expliciet de configurator-index; echte bestanden (/configurator/assets/…) en alle
// admin-routes laten we door env.ASSETS afhandelen (inclusief de admin-SPA-fallback).
// LET OP: met een _worker.js negeert Pages `_redirects`/`_headers`.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const inConfigurator = url.pathname === "/configurator" || url.pathname.startsWith("/configurator/");
    const isFile = /\.[^/]+$/.test(url.pathname); // laatste segment heeft een extensie → asset

    if (inConfigurator && !isFile) {
      // Fetch de MAP (/configurator/), niet /configurator/index.html — dat laatste
      // 308-redirect Cloudflare naar de map. De map levert direct de index-HTML (200).
      return env.ASSETS.fetch(new Request(new URL("/configurator/", url.origin), request));
    }
    return env.ASSETS.fetch(request);
  },
};
