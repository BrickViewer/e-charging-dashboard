/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";

// blog-search-console: haalt Google Search Console-metrics per blogpagina op (impressies/clicks/CTR/positie +
// top-zoekwoorden) en schrijft ze naar blog_metrics / blog_query_metrics. Auth = Google service-account-JWT
// (RS256, PKCS8 via Web Crypto) -> access_token -> webmasters/v3 searchAnalytics. verify_jwt=false; admin/manager/
// marketing of interne cron-secret. Body: { days?: number } (cron=5; eerste backfill bv. 90). GSC-data ~2 dagen vertraagd.

const cors = CORS_INTERNAL;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

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
async function gscQuery(token: string, siteUrl: string, reqBody: any): Promise<any[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) throw new Error(`GSC query -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.rows ?? [];
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function slugOf(url: string): string | null {
  const m = url.match(/\/kennisbank\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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
    const days = Number.isFinite(body.days) ? Math.max(1, Math.min(480, Number(body.days))) : 5;

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
      return json({
        status: "no_access",
        message: "Geen e-charging.nl-property gevonden voor dit serviceaccount. Voeg het serviceaccount-e-mailadres toe als gebruiker in Search Console (stap 6 van de gids).",
        sites,
      });
    }

    const endDate = ymd(new Date());
    const startDate = ymd(new Date(Date.now() - days * 86400000));

    const { data: posts } = await sb.from("blog_posts").select("id, slug");
    const slugMap = new Map<string, string>();
    for (const p of (posts ?? []) as any[]) slugMap.set(p.slug, p.id);

    // 1) Per dag per pagina -> blog_metrics.
    const rows1 = await gscQuery(token, site, { startDate, endDate, dimensions: ["date", "page"], rowLimit: 25000, dataState: "all" });
    const allPages = [...new Set(rows1.map((r: any) => r.keys?.[1]).filter(Boolean))];
    const metricRows = rows1
      .filter((r: any) => (r.keys?.[1] ?? "").includes("/kennisbank/"))
      .map((r: any) => {
        const date = r.keys[0]; const page = r.keys[1]; const slug = slugOf(page);
        return {
          blog_post_id: slug ? (slugMap.get(slug) ?? null) : null,
          page_url: page, date,
          clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0),
          ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0),
          updated_at: new Date().toISOString(),
        };
      });
    let metricUpserts = 0;
    for (const c of chunk(metricRows, 500)) {
      const { error } = await sb.from("blog_metrics").upsert(c, { onConflict: "page_url,date" });
      if (error) throw error;
      metricUpserts += c.length;
    }

    // 2) Top-zoekwoorden per pagina (top 12) -> blog_query_metrics.
    const rows2 = await gscQuery(token, site, { startDate, endDate, dimensions: ["page", "query"], rowLimit: 25000, dataState: "all" });
    const perPage = new Map<string, any[]>();
    for (const r of rows2) {
      const page = r.keys?.[0] ?? "";
      if (!page.includes("/kennisbank/")) continue;
      const arr = perPage.get(page) ?? [];
      arr.push(r);
      perPage.set(page, arr);
    }
    const snap = ymd(new Date());
    const queryRows: any[] = [];
    for (const [page, arr] of perPage) {
      arr.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0) || (b.impressions ?? 0) - (a.impressions ?? 0));
      const slug = slugOf(page);
      const bpid = slug ? (slugMap.get(slug) ?? null) : null;
      for (const r of arr.slice(0, 12)) {
        queryRows.push({
          blog_post_id: bpid, page_url: page, query: r.keys[1],
          clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0),
          ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0),
          snapshot_date: snap, updated_at: new Date().toISOString(),
        });
      }
    }
    for (const c of chunk(queryRows, 500)) {
      const { error } = await sb.from("blog_query_metrics").upsert(c, { onConflict: "page_url,query" });
      if (error) throw error;
    }

    return json({
      status: "ok", site, days, start: startDate, end: endDate,
      blog_metric_rows: metricUpserts, query_rows: queryRows.length, kennisbank_pages: perPage.size,
      diag: { total_page_rows: rows1.length, distinct_pages: allPages.length, sample_pages: allPages.slice(0, 15) },
    });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "GSC-ophaal mislukt" }, 500);
  }
});
