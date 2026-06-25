/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getDataForSeoAuth, fetchSearchVolume, fetchKeywordDifficulty } from "../_shared/dataforseo.ts";

// Content-metrics: verrijkt content_keywords met echte zoekvolume + keyword-difficulty (DataForSEO) en
// herberekent de opportunity-score (laaghangend fruit). Slaapt netjes (no_key) zonder DataForSEO-sleutels.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const dfs = await getDataForSeoAuth(sb);
    if (!dfs) return json({ status: "no_key", message: "Stel eerst de DataForSEO-sleutels (DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD) in om zoekvolumes op te halen." });

    // Active keywords zonder verse metrics (>30 dagen), gecapt op de batch-limiet.
    const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await sb.from("content_keywords")
      .select("id, query, metrics_at")
      .eq("status", "active")
      .or(`metrics_at.is.null,metrics_at.lt.${stale}`)
      .order("times_seen", { ascending: false })
      .limit(700);
    const keywords = (rows ?? []) as { id: string; query: string }[];
    if (keywords.length === 0) return json({ status: "ok", enriched: 0, message: "Alle zoekwoorden hebben al verse metrics." });

    const queries = keywords.map((k) => k.query);
    let volume: Awaited<ReturnType<typeof fetchSearchVolume>> = [];
    let difficulty: Awaited<ReturnType<typeof fetchKeywordDifficulty>> = [];
    try {
      [volume, difficulty] = await Promise.all([fetchSearchVolume(dfs, queries), fetchKeywordDifficulty(dfs, queries)]);
    } catch (e) {
      return json({ status: "error", message: `DataForSEO-aanroep mislukt: ${(e as Error).message}` }, 502);
    }

    const volMap: Record<string, any> = {};
    for (const v of volume) if (v.keyword) volMap[v.keyword.toLowerCase()] = v;
    const kdMap: Record<string, any> = {};
    for (const d of difficulty) if (d.keyword) kdMap[d.keyword.toLowerCase()] = d;

    const payload = keywords.map((k) => {
      const nk = k.query.toLowerCase();
      const v = volMap[nk];
      const d = kdMap[nk];
      return {
        q: k.query,
        v: v && v.search_volume != null ? String(v.search_volume) : "",
        kd: d && d.keyword_difficulty != null ? String(d.keyword_difficulty) : "",
        comp: v && v.competition != null ? String(v.competition) : "",
        cpc: v && v.cpc != null ? String(v.cpc) : "",
      };
    });

    const { data: enriched, error: applyErr } = await sb.rpc("content_apply_keyword_metrics", { p_rows: payload });
    if (applyErr) throw applyErr;

    // Rematch zodat onderwerpen de nieuwe opportunity-score erven.
    await sb.rpc("content_match_topics_to_keywords", {});

    const { data: settingsRow } = await sb.from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...(settingsRow.settings as any), last_metrics_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", considered: keywords.length, enriched: enriched ?? 0 });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
