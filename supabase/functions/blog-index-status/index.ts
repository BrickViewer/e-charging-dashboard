/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";

// blog-index-status: checkt via de Google Search Console URL Inspection API of onze pagina's daadwerkelijk
// GEINDEXEERD zijn (los van zoekprestaties/impressies). Per URL: verdict + coverageState + laatst-gecrawld +
// robots/canonical/fetch-state. Leest ook de sitemap-status en kan (optioneel) de sitemap (her)indienen.
// Auth = Google service-account-JWT (RS256, PKCS8 via Web Crypto). URL Inspection + sitemap-submit vereisen dat het
// serviceaccount OWNER van de property is; anders 403 -> status 'needs_owner'. verify_jwt=false; admin/marketing/intern.
// Body: { submit_sitemap?: boolean }. Schrijft naar blog_index_status.

const cors = CORS_INTERNAL;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SITE_ORIGIN = "https://www.e-charging.nl";
// Full scope: dekt zowel inspect/list (read) als sitemap-submit (write) met één token.
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: GSC_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
  const input = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)));
  const jwt = `${input}.${b64url(sig)}`;
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Token-exchange mislukt: HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token as string;
}
async function gscGet(token: string, url: string): Promise<any> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GSC GET ${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
function slugOf(url: string): string | null {
  const m = url.match(/\/kennisbank\/([^/?#]+)/);
  return m && m[1] !== "categorie" ? decodeURIComponent(m[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as any));
    const doSubmitSitemap = body.submit_sitemap === true;

    const saRaw = await resolveSecret(sb, ["GSC_SERVICE_ACCOUNT"], "gsc_service_account");
    if (!saRaw) return json({ status: "no_key", message: "Stel eerst de GSC-service-account in (Vault: gsc_service_account)." });
    let sa: any;
    try { sa = JSON.parse(saRaw); } catch { return json({ status: "error", message: "GSC-service-account is geen geldige JSON" }, 500); }

    const token = await getAccessToken(sa);

    // Property auto-detecteren (domein vs url-prefix).
    const sitesData = await gscGet(token, "https://www.googleapis.com/webmasters/v3/sites");
    const sites: string[] = (sitesData.siteEntry ?? []).map((s: any) => s.siteUrl).filter(Boolean);
    const prefer = ["sc-domain:e-charging.nl", "https://www.e-charging.nl/", "https://e-charging.nl/"];
    const site = prefer.find((p) => sites.includes(p)) ?? sites.find((s) => s.includes("e-charging.nl")) ?? null;
    if (!site) {
      return json({ status: "no_access", message: "Geen e-charging.nl-property gevonden voor dit serviceaccount.", sites });
    }

    // URL-lijst: vaste pagina's + gepubliceerde artikelen + categorie-hubs.
    const { data: posts } = await sb.from("blog_posts").select("id, slug, category_slug").eq("status", "gepubliceerd");
    const slugMap = new Map<string, string>();
    const urls: string[] = ["/", "/zakelijk", "/particulier", "/kennisbank", "/over-ons", "/contact"].map((p) => `${SITE_ORIGIN}${p}`);
    const hubSlugs = new Set<string>();
    for (const p of (posts ?? []) as any[]) {
      urls.push(`${SITE_ORIGIN}/kennisbank/${p.slug}`);
      slugMap.set(p.slug, p.id);
      if (p.category_slug) hubSlugs.add(p.category_slug);
    }
    for (const cs of hubSlugs) urls.push(`${SITE_ORIGIN}/kennisbank/categorie/${cs}`);

    // Sitemap-status ophalen.
    let sitemapInfo: any = null;
    try {
      const sm = await gscGet(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`);
      const entry = (sm.sitemap ?? []).find((s: any) => (s.path ?? "").includes("sitemap.xml")) ?? (sm.sitemap ?? [])[0] ?? null;
      sitemapInfo = entry
        ? {
            path: entry.path, lastSubmitted: entry.lastSubmitted ?? null, lastDownloaded: entry.lastDownloaded ?? null,
            isPending: entry.isPending ?? null, errors: Number(entry.errors ?? 0), warnings: Number(entry.warnings ?? 0),
            submitted: entry.contents?.[0]?.submitted ?? null, indexed: entry.contents?.[0]?.indexed ?? null,
          }
        : { path: null, note: "Geen sitemap ingediend in GSC." };
    } catch (e) {
      sitemapInfo = { error: e instanceof Error ? e.message : "sitemap-lijst mislukt" };
    }

    // Optioneel: sitemap (her)indienen (write; vereist Full/Owner-perm).
    let sitemapSubmit: any = null;
    if (doSubmitSitemap) {
      const feed = `${SITE_ORIGIN}/sitemap.xml`;
      const putUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feed)}`;
      const res = await fetch(putUrl, { method: "PUT", headers: { authorization: `Bearer ${token}` } });
      sitemapSubmit = { feed, ok: res.ok, status: res.status, message: res.ok ? "Sitemap ingediend" : (await res.text()).slice(0, 200) };
    }

    // URL Inspection per pagina.
    const results: any[] = [];
    const rows: any[] = [];
    let needsOwner = false;
    const nowIso = new Date().toISOString();
    for (const u of urls) {
      const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ inspectionUrl: u, siteUrl: site, languageCode: "nl-NL" }),
      });
      if (res.status === 403) { needsOwner = true; break; }
      if (!res.ok) { results.push({ url: u, error: `HTTP ${res.status}` }); continue; }
      const data = await res.json();
      const r = data?.inspectionResult?.indexStatusResult ?? {};
      const slug = slugOf(u);
      const row = {
        url: u,
        blog_post_id: slug ? (slugMap.get(slug) ?? null) : null,
        verdict: r.verdict ?? null,
        coverage_state: r.coverageState ?? null,
        indexing_state: r.indexingState ?? null,
        robots_state: r.robotsTxtState ?? null,
        page_fetch_state: r.pageFetchState ?? null,
        google_canonical: r.googleCanonical ?? null,
        last_crawl_time: r.lastCrawlTime ?? null,
        checked_at: nowIso,
      };
      rows.push(row);
      results.push({ url: u, verdict: row.verdict, coverage_state: row.coverage_state, last_crawl_time: row.last_crawl_time });
      // Incrementeel wegschrijven: gedeeltelijke voortgang overleeft een eventuele time-out (URL Inspection is traag).
      const { error: upErr } = await sb.from("blog_index_status").upsert([row], { onConflict: "url" });
      if (upErr) console.error("index-status upsert:", upErr.message);
    }

    if (needsOwner) {
      return json({
        status: "needs_owner",
        message: "De URL Inspection API gaf 403. Het GSC-serviceaccount moet OWNER zijn van de property. Voeg het serviceaccount-e-mailadres in Search Console toe met de rol 'Eigenaar' (Instellingen -> Gebruikers en machtigingen) en probeer opnieuw.",
        service_account: sa.client_email, site, sitemap: sitemapInfo,
      });
    }

    // verdict is taal-onafhankelijk (PASS/NEUTRAL/FAIL); coverage_state komt gelokaliseerd terug (nl-NL).
    const indexed = rows.filter((r) => r.verdict === "PASS").length;
    return json({
      status: "ok", site, checked: rows.length, indexed, not_indexed: rows.length - indexed,
      sitemap: sitemapInfo, sitemap_submit: sitemapSubmit, results,
    });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Index-status mislukt" }, 500);
  }
});
