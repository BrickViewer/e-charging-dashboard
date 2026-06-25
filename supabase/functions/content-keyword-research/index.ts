/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// Content-keyword-research: ontdekt waar de doelgroep op googelt via Google Autocomplete (gratis, geen
// sleutel). Per zaad-term (settings.keyword_seeds) vraagt hij de suggesties op met vraag-/modifierwoorden,
// classificeert de intent heuristisch en zet alles via RPC content_ingest_keyword in content_keywords
// (dedup in SQL). Best-effort: per-fetch try/catch, rate-limited, met een harde tijds- en request-cap.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Vraag-/modifierwoorden die long-tail met koop- en informatie-intentie blootleggen (NL, B2B laadinfra).
const QWORDS = [
  "hoe", "wat", "waarom", "kosten", "prijs", "subsidie", "verplicht", "regels",
  "beste", "vergelijken", "installateur", "aanvragen", "voorbeeld", "zakelijk", "aanschaf", "huren",
];

function classifyIntent(q: string): string {
  const s = q.toLowerCase();
  if (/(kopen|offerte|installateur|prijs|kosten|aanvragen|aanschaf|bestellen|huren|lease|leasen|installeren|laten plaatsen)/.test(s)) return "transactional";
  if (/(beste|vergelijk|review|welke|aanbieder|merk|alternatief)/.test(s)) return "commercial";
  if (/(hoe|wat|waarom|uitleg|werkt|regels|verplicht|mag|moet|voorbeeld|betekenis)/.test(s)) return "informational";
  return "informational";
}

async function fetchSuggest(term: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=nl&gl=NL&q=${encodeURIComponent(term)}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter((x: unknown) => typeof x === "string") : [];
  } catch (_) {
    return [];
  } finally {
    clearTimeout(to);
  }
}

type Seed = { term: string; cluster?: string; audience?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const { data: settingsRow } = await sb
      .from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const seeds: Seed[] = Array.isArray(settings.keyword_seeds) ? settings.keyword_seeds : [];
    if (seeds.length === 0) {
      return json({ status: "no_seeds", message: "Nog geen zaad-termen ingesteld. Voeg ze toe bij Instellingen." });
    }

    const MAX_REQUESTS = 300;
    const MAX_MS = 110000;
    const started = Date.now();
    let requests = 0, created = 0, skipped = 0, errors = 0;
    let stopped = false;

    for (const seed of seeds) {
      if (stopped) break;
      const term = (seed.term ?? "").trim();
      if (!term) continue;
      const variants = [term, ...QWORDS.map((w) => `${term} ${w}`)];
      for (const v of variants) {
        if (requests >= MAX_REQUESTS || Date.now() - started > MAX_MS) { stopped = true; break; }
        requests++;
        const suggestions = await fetchSuggest(v);
        for (const s of suggestions) {
          const { data, error } = await sb.rpc("content_ingest_keyword", {
            p_query: s,
            p_seed: term,
            p_cluster: seed.cluster ?? null,
            p_intent: classifyIntent(s),
            p_audience: seed.audience ?? null,
            p_source: "autocomplete",
          });
          if (error) errors++; else if (data) created++; else skipped++;
        }
        await sleep(250);
      }
    }

    // Nieuwe zoekvragen kunnen bestaande onderwerpen beter koppelen (Laag B).
    await sb.rpc("content_match_topics_to_keywords", {});

    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...settings, last_keyword_research_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", seeds: seeds.length, requests, created, skipped, errors, capped: stopped });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
