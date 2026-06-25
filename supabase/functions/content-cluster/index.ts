/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";

// Content-cluster: laat Claude de zoekwoorden in pijler/cluster-groepen indelen (topische autoriteit). Slaapt
// (no_key) zonder Claude-sleutel. Pg_trgm-fallback (content_recluster_keywords) blijft los altijd beschikbaar.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Je bent contentstrateeg voor een Nederlands B2B-bedrijf in laadinfrastructuur (doelgroep: vastgoed, VvE, bedrijven, installateurs).

Je krijgt een lijst zoekwoorden met zoekdoel en kansscore. Groepeer ze in topische clusters (pijler + bijbehorende cluster-zoekwoorden), zodat we per cluster een pijlerartikel en ondersteunende artikelen kunnen maken met onderlinge interne links.

Per cluster:
- cluster: korte, herbruikbare clusternaam in kleine letters (bijv. "vve", "kosten", "subsidie", "netcongestie").
- pillar_query: het zoekwoord dat het beste pijlerartikel zou worden (breed, hoge kans).
- members: de bijbehorende zoekwoorden (specifieker, long-tail).

Regels: Nederlands, GEEN gedachtestreepjes (em-dashes), gebruik ALLEEN aangeleverde zoekwoorden, verzin er geen bij. Houd het pragmatisch: 4 tot 8 clusters.

Antwoord UITSLUITEND met geldige JSON, exact dit schema:
{"clusters":[{"cluster": string, "pillar_query": string, "members": [string]}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) return json({ status: "no_key", message: "Stel eerst de Claude-sleutel in om clusters te maken." });

    const { data: settingsRow } = await sb.from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const model = typeof (settingsRow?.settings as any)?.generation_model === "string" ? (settingsRow!.settings as any).generation_model : DEFAULT_MODEL;

    const { data: kws } = await sb.from("content_keywords")
      .select("query, intent, opportunity, priority")
      .eq("status", "active")
      .order("opportunity", { ascending: false, nullsFirst: false })
      .limit(150);
    const keywords = (kws ?? []) as { query: string; intent: string; opportunity: number | null; priority: number | null }[];
    if (keywords.length === 0) return json({ status: "ok", clustered: 0, message: "Geen zoekwoorden om te clusteren." });

    const user = `Zoekwoorden (zoekwoord | zoekdoel | kans):\n${keywords.map((k) => `${k.query} | ${k.intent} | ${Math.round(Number(k.opportunity ?? k.priority ?? 0) * 100)}`).join("\n")}`;

    let parsed: { clusters?: Array<{ cluster?: string; pillar_query?: string; members?: string[] }> };
    try {
      const raw = await anthropicMessage({ apiKey, system: SYSTEM, user, model, maxTokens: 3000 });
      parsed = extractJson(raw);
    } catch (e) {
      return json({ status: "error", message: `Clusteren mislukt: ${(e as Error).message}` }, 502);
    }
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
    if (clusters.length === 0) return json({ status: "ok", clustered: 0, message: "Geen clusters teruggekregen." });

    const { data: applied, error: applyErr } = await sb.rpc("content_apply_clusters", { p_clusters: clusters });
    if (applyErr) throw applyErr;

    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...(settingsRow.settings as any), last_cluster_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", clusters: clusters.length, clustered: applied ?? 0 });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
