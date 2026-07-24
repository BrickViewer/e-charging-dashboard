/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getDataForSeoAuth, fetchSerp } from "../_shared/dataforseo.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";

// Content-serp-gap: haalt de top-10 van Google (DataForSEO) en laat Claude beoordelen hoe zwak die is, zodat we
// "veel gezocht, weinig goed antwoord" zien. Slaapt (no_key) als DataForSEO OF Claude ontbreekt.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const INTENT_NL: Record<string, string> = {
  informational: "informatief", commercial: "commercieel", transactional: "transactioneel", navigational: "navigatie",
};

const SYSTEM = `Je bent SEO-analist voor een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer. Doelgroep: vastgoedeigenaren, VvE-besturen, bedrijven en installateurs.

Je krijgt een zoekwoord met het zoekdoel en de huidige top-10 van Google (titel, domein, omschrijving per resultaat).

Beoordeel hoe ZWAK de huidige top-10 is, dus hoeveel kans wij maken om met een sterk, origineel artikel te ranken. Een zwakke SERP herken je aan: forums of Q&A-sites, dunne of generieke pagina's, verouderde inhoud, pure productpagina's of webshops zonder uitleg, ontbrekende deelonderwerpen die de doelgroep wel zoekt, of louter consumentgerichte content terwijl de zoekvraag zakelijk is. Een sterke SERP herken je aan diepgaande, recente gidsen van autoriteiten (overheid, netbeheerders, brancheorganisaties, gespecialiseerde B2B-aanbieders) die de vraag compleet beantwoorden.

Regels:
- Schrijf in het Nederlands. Gebruik GEEN gedachtestreepjes (em-dashes).
- Baseer je uitsluitend op de aangeleverde resultaten; verzin niets.
- serp_gap is een getal van 0 tot 1: 0 = ijzersterke SERP (weinig kans), 1 = zwakke SERP (veel kans).

Antwoord UITSLUITEND met geldige JSON, exact dit schema:
{"serp_gap": number, "weakness_type": string, "serp_notes": string, "content_angle": string}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const dfs = await getDataForSeoAuth(sb);
    if (!dfs) return json({ status: "no_key", message: "Stel eerst de DataForSEO-sleutels in om de SERP-analyse te draaien." });
    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) return json({ status: "no_key", message: "Stel eerst de Claude-sleutel in om de SERP-analyse te draaien." });

    const body = await req.json().catch(() => ({} as any));
    const keywordId: string | null = typeof body.keyword_id === "string" ? body.keyword_id : null;
    const limit = Number.isFinite(body.limit) ? Math.min(10, Math.max(1, body.limit)) : 5;

    const { data: settingsRow } = await sb.from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const model = typeof (settingsRow?.settings as any)?.generation_model === "string" ? (settingsRow!.settings as any).generation_model : DEFAULT_MODEL;

    let query = sb.from("content_keywords").select("id, query, intent").eq("status", "active");
    if (keywordId) {
      query = query.eq("id", keywordId);
    } else {
      const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`serp_checked_at.is.null,serp_checked_at.lt.${stale}`)
        .order("opportunity", { ascending: false, nullsFirst: false }).limit(limit);
    }
    const { data: kws, error: kwErr } = await query;
    if (kwErr) throw kwErr;
    const keywords = (kws ?? []) as { id: string; query: string; intent: string }[];
    if (keywords.length === 0) return json({ status: "ok", checked: 0, message: "Geen zoekwoorden om te analyseren." });

    let checked = 0, errors = 0;
    for (const k of keywords) {
      try {
        const serp = await fetchSerp(dfs, k.query);
        if (serp.length === 0) { errors++; continue; }
        const user = `Zoekwoord: ${k.query}\nZoekdoel: ${INTENT_NL[k.intent] ?? "informatief"}\n\nTop-10 van Google:\n${serp.map((s, i) => `${i + 1}. ${s.title} - ${s.domain} - ${s.description}`).join("\n")}`;
        const raw = await anthropicMessage({ apiKey, system: SYSTEM, user, model, maxTokens: 1500, thinking: "disabled" });
        const parsed = extractJson<{ serp_gap?: number; weakness_type?: string; serp_notes?: string }>(raw);
        const gap = typeof parsed.serp_gap === "number" ? parsed.serp_gap : null;
        if (gap == null) throw new Error("Geen serp_gap in respons");
        const notes = [parsed.weakness_type, parsed.serp_notes].filter(Boolean).join(" - ");
        const { error: applyErr } = await sb.rpc("content_apply_serp_gap", { p_id: k.id, p_gap: gap, p_notes: notes || null });
        if (applyErr) throw applyErr;
        checked++;
      } catch (_) {
        errors++;
      }
    }

    await sb.rpc("content_match_topics_to_keywords", {});
    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...(settingsRow.settings as any), last_serp_gap_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", checked, errors, considered: keywords.length });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
