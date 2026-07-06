/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";
import { BLOG_SYSTEM, INTENT_NL, validateBlogJson } from "../_shared/blog.ts";

// Opname-naar-blog (Laag D): smeedt de BRON (nieuws), de ZOEKVRAAG (waar de doelgroep op googelt), de
// GESPREKSVRAAG en de VISIE (transcript van de opname) samen tot een publicatieklaar blog-CONCEPT, geschreven
// door Claude. Zonder Claude-sleutel valt hij terug op de bestaande deterministische stub (gedrag = als vroeger).
// Publiceren blijft handmatig in de blogs-module (via content_ingest_draft -> status concept).

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "opname";
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// BLOG_SYSTEM, INTENT_NL en validateBlogJson zijn gedeeld met content-autoblog (zie ../_shared/blog.ts).

// STUB - transcriptie. Bij een geplakt transcript een no-op. Audio-pad later (secret TRANSCRIPTION_API_KEY).
async function transcribeRecording(input: { transcript?: string; audioPath?: string }): Promise<string> {
  if (input.transcript && input.transcript.trim()) return input.transcript.trim();
  throw new Error("Geen transcript opgegeven (audio-transcriptie is nog niet gewired).");
}

// STUB - conceptgeneratie zonder sleutel (deterministisch). Gedrag identiek aan voorheen.
function stubDraft(transcript: string, title: string): { title: string; content: string; excerpt: string } {
  const paras = transcript.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const body = (paras.length ? paras : [transcript]).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const content = `<p><em>Concept gegenereerd uit een opname; nog te redigeren en te optimaliseren voor SEO/GEO.</em></p>${body}`;
  const excerpt = (paras[0] ?? transcript).replace(/\s+/g, " ").slice(0, 180);
  return { title, content, excerpt };
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
    const reqTitle = (typeof body.title === "string" ? body.title : "").trim();
    const recordedOn = typeof body.recorded_on === "string" && body.recorded_on ? body.recorded_on : null;
    const rawTranscript = typeof body.transcript === "string" ? body.transcript : "";
    const linkTopicId: string | null = typeof body.topic_id === "string" ? body.topic_id : null;

    const transcript = await transcribeRecording({ transcript: rawTranscript });

    // Optionele onderwerp-context (bron + zoekvraag + gespreksvraag) om mee te fuseren.
    let topicCtx: any = null;
    if (linkTopicId) {
      const { data: tc } = await sb.from("content_topics")
        .select("id, raw_title, raw_summary, source_url, source_name, target_keyword, matched_keyword_id, conversation_question, assigned_category")
        .eq("id", linkTopicId).maybeSingle();
      topicCtx = tc;
    }
    const title = reqTitle || topicCtx?.raw_title || "Concept uit opname";

    // 1) Opname vastleggen.
    const { data: rec, error: recErr } = await sb
      .from("content_recordings")
      .insert({ title, recorded_on: recordedOn, transcript, status: "nieuw", topic_id: linkTopicId, created_by: auth.userId ?? null })
      .select("id").single();
    if (recErr) throw recErr;

    // 2) Doel-onderwerp bepalen: bestaand (uit de agenda) of een nieuw recording-onderwerp.
    let topicId = linkTopicId;
    if (!topicId) {
      const { data: topic, error: topicErr } = await sb
        .from("content_topics")
        .insert({
          source_type: "recording", raw_title: title, raw_summary: transcript.slice(0, 500),
          novelty_key: `rec-${slugify(title)}-${Date.now()}`, status: "drafting",
          generated_by: "recording", created_by: auth.userId ?? null,
        })
        .select("id").single();
      if (topicErr) throw topicErr;
      topicId = topic.id;
    }

    // 3) Concept genereren: met sleutel via Claude (fusie), anders de deterministische stub.
    const apiKey = await getAnthropicKey(sb);
    const { data: settingsRow } = await sb
      .from("content_engine_settings").select("settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;

    let ingestArgs: Record<string, unknown>;
    let usedClaude = false;

    if (apiKey) {
      // Zoekwoord-context ophalen voor de prompt.
      let kw: any = null;
      if (topicCtx?.matched_keyword_id) {
        const { data: k } = await sb.from("content_keywords").select("query, intent, cluster, audience").eq("id", topicCtx.matched_keyword_id).maybeSingle();
        kw = k;
      }
      const { data: slugRows } = await sb.from("blog_posts").select("slug, title").eq("status", "gepubliceerd").limit(50);
      const slugs = (slugRows ?? []) as { slug: string; title: string }[];
      const validSlugs = new Set(slugs.map((s) => s.slug));

      const zoekvraag = kw?.query || topicCtx?.target_keyword || "";
      const user = [
        topicCtx ? `BRON-titel: ${topicCtx.raw_title}` : null,
        topicCtx?.raw_summary ? `BRON-samenvatting: ${topicCtx.raw_summary}` : null,
        topicCtx?.source_url ? `BRON-url: ${topicCtx.source_url}` : null,
        zoekvraag ? `ZOEKVRAAG: ${zoekvraag}${kw?.intent ? ` (zoekdoel: ${INTENT_NL[kw.intent] ?? kw.intent})` : ""}` : null,
        topicCtx?.conversation_question ? `GESPREKSVRAAG: ${topicCtx.conversation_question}` : null,
        `VISIE (transcript van de opname):\n${transcript}`,
        slugs.length ? `INTERNE LINKS (alleen deze slugs gebruiken):\n${slugs.map((s) => `- ${s.slug} (${s.title})`).join("\n")}` : null,
        `MERKCONTEXT: Het bedrijf levert en beheert laadinfrastructuur voor zakelijke en vastgoedklanten (kantoren, VvE's, bedrijfspanden, parkeerterreinen): advies, installatie, beheer en facturatie van laadpunten.`,
        (settings.author && settings.author.name)
          ? `AUTEUR: ${settings.author.name}${settings.author.role ? `, ${settings.author.role}` : ""}. Schrijf vanuit eigen ervaring en eerste-hands data van het team; benoem concrete praktijkvoorbeelden uit de visie en wees specifiek (E-E-A-T).`
          : `Schrijf vanuit eigen ervaring en eerste-hands data van het team; benoem concrete praktijkvoorbeelden uit de visie en wees specifiek (E-E-A-T).`,
        topicCtx?.assigned_category ? `CATEGORIE: ${topicCtx.assigned_category}` : null,
        `Titel-suggestie: ${title}`,
      ].filter(Boolean).join("\n\n");

      const model = typeof settings.generation_model === "string" ? settings.generation_model : DEFAULT_MODEL;
      const maxTokens = Number.isFinite(settings.generation_max_tokens) ? settings.generation_max_tokens : 8000;
      const raw = await anthropicMessage({ apiKey, system: BLOG_SYSTEM, user, model, maxTokens });
      const draft = validateBlogJson(extractJson<any>(raw), validSlugs);
      usedClaude = true;
      ingestArgs = {
        p_topic_id: topicId, p_title: draft.title, p_content: draft.content, p_excerpt: draft.excerpt,
        p_category: topicCtx?.assigned_category ?? null,
        p_tags: draft.tags, p_faq: draft.faq,
        p_seo_title: draft.seo_title, p_seo_description: draft.seo_description,
        p_seo_score: draft.seo_score, p_aeo_score: draft.aeo_score, p_quality_score: draft.quality_score,
        p_meta_variants: draft.meta_variants, p_internal_link_suggestions: draft.internal_link_suggestions,
        p_author_name: (settings.author && settings.author.name) ? settings.author.name : null,
        p_generated_by: "agent:claude-blog@v1",
      };
    } else {
      const draft = stubDraft(transcript, title);
      ingestArgs = {
        p_topic_id: topicId, p_title: draft.title, p_content: draft.content, p_excerpt: draft.excerpt,
        p_generated_by: "recording",
      };
    }

    const { data: ingest, error: ingestErr } = await sb.rpc("content_ingest_draft", ingestArgs);
    if (ingestErr) throw ingestErr;
    const result = ingest as { blog_post_id: string; slug: string; review_state: string };

    // 4) Opname koppelen aan onderwerp + concept.
    await sb.from("content_recordings")
      .update({ topic_id: topicId, blog_post_id: result.blog_post_id, status: "verwerkt" })
      .eq("id", rec.id);

    return json({ status: "ok", blog_post_id: result.blog_post_id, slug: result.slug, engine: usedClaude ? "claude" : "stub" });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwerken mislukt" }, 500);
  }
});
