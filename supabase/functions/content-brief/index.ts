/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";

// Content-brief (Laag C): maakt per onderwerp een scherpe gespreksvraag + achtergrond, zodat het team een
// opname met hun visie kan maken. Gebruikt Claude. Slaapt netjes (status no_key) als er geen sleutel is.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const INTENT_NL: Record<string, string> = {
  informational: "informatief", commercial: "commercieel", transactional: "transactioneel", navigational: "navigatie",
};

const SYSTEM = `Je bent de contentstrateeg van een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer. De doelgroep is vastgoedeigenaren, VvE-besturen, en bedrijven of installateurs rond laadpalen.

Je krijgt: (1) een nieuwsbron (titel, samenvatting, url), en (2) de zoekvraag waarop dit onderwerp het beste aansluit, met het zoekdoel (informatief, commercieel of transactioneel).

Doel: het team gaat dit onderwerp in een opgenomen gesprek bespreken. Hun antwoord wordt de unieke visie van het bedrijf. Lever daarvoor:
1. EEN scherpe gespreksvraag (conversation_question): concreet, prikkelend, gericht op een mening of keuze waar het bedrijf echt stelling in kan nemen. Geen ja/nee-vraag. Sluit aan op wat de doelgroep googelt.
2. Achtergrond (background): 4 tot 6 bondige bullets die het team genoeg context geven om het gesprek te voeren en op te nemen: de kern van het nieuws, waarom het de doelgroep raakt, het spanningsveld of de keuze, en 1 of 2 feiten of cijfers uit de bron. Schrijf elke bullet op een eigen regel, beginnend met "- ".
3. Een aangescherpte invalshoek (suggested_angle): 1 zin die de hoek van de blog samenvat, gekoppeld aan de zoekvraag.

Regels:
- Schrijf in het Nederlands.
- Gebruik GEEN gedachtestreepjes (em-dashes).
- Verzin geen feiten; baseer je op de aangeleverde bron. Als de bron dun is, houd de bullets algemeen en eerlijk.
- Zakelijk, helder, geen marketingclichés.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder extra tekst:
{"conversation_question": string, "background": string, "suggested_angle": string}`;

type Topic = {
  id: string; raw_title: string; raw_summary: string | null; source_url: string | null;
  source_name: string | null; source_published_at: string | null; matched_keyword_id: string | null;
  target_keyword: string | null;
};
type Kw = { id: string; query: string; intent: string; cluster: string | null; audience: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      return json({ status: "no_key", message: "Stel eerst de Claude-sleutel (ANTHROPIC_API_KEY) in voordat je gespreksvragen genereert." });
    }

    const body = await req.json().catch(() => ({} as any));
    const topicId: string | null = typeof body.topic_id === "string" ? body.topic_id : null;
    const limit: number = Number.isFinite(body.limit) ? Math.min(10, Math.max(1, body.limit)) : 5;

    const { data: settingsRow } = await sb
      .from("content_engine_settings").select("settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const model = typeof settings.generation_model === "string" ? settings.generation_model : DEFAULT_MODEL;

    // Onderwerpen selecteren: of één expliciet, of de top-N met match en zonder briefing.
    let query = sb.from("content_topics")
      .select("id, raw_title, raw_summary, source_url, source_name, source_published_at, matched_keyword_id, target_keyword")
      .eq("status", "idea");
    if (topicId) {
      query = query.eq("id", topicId);
    } else {
      query = query.not("matched_keyword_id", "is", null).is("brief_generated_at", null)
        .order("seo_opportunity", { ascending: false, nullsFirst: false }).limit(limit);
    }
    const { data: topics, error: topicErr } = await query;
    if (topicErr) throw topicErr;
    const list = (topics ?? []) as Topic[];
    if (list.length === 0) return json({ status: "ok", generated: 0, errors: 0, message: "Geen onderwerpen om te briefen." });

    // Gekoppelde zoekwoorden ophalen.
    const kwIds = [...new Set(list.map((t) => t.matched_keyword_id).filter(Boolean))] as string[];
    const kwMap: Record<string, Kw> = {};
    if (kwIds.length > 0) {
      const { data: kws } = await sb.from("content_keywords").select("id, query, intent, cluster, audience").in("id", kwIds);
      for (const k of (kws ?? []) as Kw[]) kwMap[k.id] = k;
    }

    let generated = 0, errors = 0;
    for (const t of list) {
      const kw = (t.matched_keyword_id && kwMap[t.matched_keyword_id]) || null;
      const zoekvraag = kw?.query || t.target_keyword || t.raw_title;
      const user = `Bron-titel: ${t.raw_title}
Bron-samenvatting: ${t.raw_summary ?? "(geen samenvatting)"}
Bron-url: ${t.source_url ?? "(geen)"}
Bron: ${t.source_name ?? "onbekend"}${t.source_published_at ? `, gepubliceerd ${t.source_published_at.slice(0, 10)}` : ""}

Zoekvraag: ${zoekvraag}
Zoekdoel: ${INTENT_NL[kw?.intent ?? "informational"] ?? "informatief"}
Cluster: ${kw?.cluster ?? "-"}
Doelgroep: ${kw?.audience ?? "-"}`;
      try {
        const raw = await anthropicMessage({ apiKey, system: SYSTEM, user, model, maxTokens: 2000 });
        const parsed = extractJson<{ conversation_question?: string; background?: string; suggested_angle?: string }>(raw);
        if (!parsed.conversation_question) throw new Error("Geen gespreksvraag in respons");
        await sb.from("content_topics").update({
          conversation_question: parsed.conversation_question,
          background: parsed.background ?? null,
          suggested_angle: parsed.suggested_angle ?? null,
          brief_generated_at: new Date().toISOString(),
        }).eq("id", t.id);
        generated++;
      } catch (_) {
        errors++;
      }
    }

    return json({ status: "ok", generated, errors, considered: list.length });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
