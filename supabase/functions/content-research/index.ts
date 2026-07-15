/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";

// Content-research (collector van stap 1): laat Claude met de web-search-tool ECHT internet-research doen naar
// waar de doelgroep op googelt, gecombineerd met het actuele nieuws + de bekende zoekwoorden, en levert ~10
// scherpe VRAGEN met toelichting die als onderwerpen onder stap 1 belanden. Slaapt netjes zonder Claude-sleutel.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Je bent de contentstrateeg van een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer. De doelgroep is vastgoedeigenaren, VvE-besturen, bedrijven en installateurs rond laadpalen.

Je taak: bepaal de beste blogonderwerpen door te achterhalen waar deze doelgroep echt naar zoekt (Google) en dit te combineren met actueel nieuws. Gebruik de web-search-tool om te VERIFIEREN wat er nu speelt en waar de doelgroep naar zoekt; vertrouw niet alleen op de meegegeven context.

Lever ongeveer 10 sterke onderwerpen, elk als een concrete VRAAG die de doelgroep zou googelen of in een gesprek zou stellen. Per onderwerp:
- question: de vraag, in het Nederlands, concreet en zoals de doelgroep het zou typen of vragen.
- toelichting: 3 tot 5 zinnen die het team genoeg context geven om er een gesprek over te voeren: waarom het nu speelt, waarom het de doelgroep raakt, en de invalshoek voor een blog.
- target_keyword: het zoekwoord waarop de blog zou moeten ranken.
- source_url: optioneel, een relevante bron-url als je die vond.

Regels:
- Schrijf in het Nederlands. Gebruik GEEN gedachtestreepjes (em-dashes).
- Verzin geen feiten; baseer je op wat je vindt en op de context.
- Zakelijk en concreet. Kies onderwerpen met echte zoekvraag-potentie (informatief of commercieel), niet te algemeen.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder extra tekst:
{"questions": [{"question": string, "toelichting": string, "target_keyword": string, "source_url": string}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      return json({ status: "no_key", message: "Stel eerst de Claude-sleutel (ANTHROPIC_API_KEY) in om onderwerpen te verzamelen." });
    }

    const { data: settingsRow } = await sb
      .from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const model = typeof settings.generation_model === "string" ? settings.generation_model : DEFAULT_MODEL;

    // Grondingscontext: recent nieuws + bekende zoekwoorden.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newsRows } = await sb.from("content_topics")
      .select("raw_title, raw_summary, source_name, seo_opportunity, created_at")
      .in("source_type", ["rss", "competitor"])
      .neq("status", "rejected") // off-brand afgekeurd nieuws (brand-fit-poort) niet als grondslag
      .gte("created_at", since)
      .order("seo_opportunity", { ascending: false, nullsFirst: false })
      .limit(20);
    const { data: kwRows } = await sb.from("content_keywords")
      .select("query, intent").eq("status", "active")
      .order("opportunity", { ascending: false, nullsFirst: false })
      .order("priority", { ascending: false }).limit(25);

    const news = (newsRows ?? []) as { raw_title: string; raw_summary: string | null; source_name: string | null }[];
    const kws = (kwRows ?? []) as { query: string; intent: string }[];

    const user = [
      "Doelgroep: vastgoedeigenaren, VvE-besturen, bedrijven en installateurs rond laadinfrastructuur in Nederland.",
      news.length ? `ACTUEEL NIEUWS (uit onze bronnen, laatste 2 weken):\n${news.map((n) => `- ${n.raw_title}${n.source_name ? ` (${n.source_name})` : ""}`).join("\n")}` : "ACTUEEL NIEUWS: (geen recent nieuws beschikbaar; gebruik web-search)",
      kws.length ? `ZOEKWOORDEN die we al zagen:\n${kws.map((k) => `- ${k.query} (${k.intent})`).join("\n")}` : "",
      "Onderzoek met web-search wat deze doelgroep nu echt googelt en wat actueel is, en lever de onderwerpen als JSON volgens het schema.",
    ].filter(Boolean).join("\n\n");

    let raw: string;
    try {
      raw = await anthropicMessage({
        apiKey, system: SYSTEM, user, model, maxTokens: 6000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      });
    } catch (e) {
      return json({ status: "error", message: `Research mislukt: ${(e as Error).message}` }, 502);
    }

    let questions: Array<{ question?: string; toelichting?: string; target_keyword?: string; source_url?: string }> = [];
    try {
      const parsed = extractJson<{ questions?: typeof questions }>(raw);
      questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch (_) {
      return json({ status: "error", message: "Kon het antwoord van Claude niet lezen (geen geldige JSON)." }, 502);
    }

    let created = 0, skipped = 0, errors = 0;
    for (const q of questions) {
      if (!q.question || !q.question.trim()) { errors++; continue; }
      const { data, error } = await sb.rpc("content_ingest_research", {
        p_question: q.question.trim(),
        p_toelichting: q.toelichting ?? null,
        p_target_keyword: q.target_keyword ?? null,
        p_source_url: q.source_url ?? null,
      });
      if (error) errors++; else if (data) created++; else skipped++;
    }

    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...settings, last_research_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", found: questions.length, created, skipped, errors });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
