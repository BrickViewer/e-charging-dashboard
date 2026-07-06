/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// blog-indexnow: seint zoekmachines (Bing/Yandex + AI-discovery) via IndexNow dat URLs nieuw/gewijzigd zijn, voor
// snellere indexering. NB: Google gebruikt IndexNow NIET. Aangeroepen (a) door de DB-trigger notify_indexnow bij
// publiceren met {url}, en (b) vanuit het dashboard met {all:true} = alle huidige URLs opnieuw aanmelden.
// verify_jwt=false; intern (x-internal-secret) OF admin/manager/marketing. Key staat publiek in /<KEY>.txt (geen geheim).

const KEY = "0fd17b7627781b062135decc58e78a5c";
const HOST = "www.e-charging.nl";
const ORIGIN = `https://${HOST}`;
const cors = CORS_INTERNAL;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as any));

  let urls: string[];
  if (body.all === true) {
    // Alle huidige URLs: vaste pagina's + gepubliceerde artikelen + categorie-hubs.
    const { data: posts } = await sb.from("blog_posts").select("slug, category_slug").eq("status", "gepubliceerd");
    urls = ["/", "/zakelijk", "/particulier", "/kennisbank", "/over-ons", "/contact"].map((p) => `${ORIGIN}${p}`);
    const hubs = new Set<string>();
    for (const p of (posts ?? []) as any[]) {
      urls.push(`${ORIGIN}/kennisbank/${p.slug}`);
      if (p.category_slug) hubs.add(p.category_slug);
    }
    for (const cs of hubs) urls.push(`${ORIGIN}/kennisbank/categorie/${cs}`);
  } else {
    urls = Array.isArray(body.urls)
      ? body.urls.filter((u: unknown) => typeof u === "string")
      : typeof body.url === "string" ? [body.url] : [];
  }
  if (urls.length === 0) return json({ status: "ok", count: 0 });

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: urls.slice(0, 100) }),
    });
    return json({ status: "ok", indexnow_http: res.status, count: urls.length });
  } catch (e) {
    return json({ status: "error", message: e instanceof Error ? e.message : "IndexNow-ping mislukt" }, 500);
  }
});
