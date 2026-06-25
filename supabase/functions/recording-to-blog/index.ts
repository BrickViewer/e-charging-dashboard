/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// Opname-naar-blog: neemt een transcript van de wekelijkse sessie en zet er een blog-CONCEPT van klaar
// in de bestaande blogs-module (via RPC content_ingest_draft → blog_posts status='concept'). Publiceren
// blijft handmatig in de blogs-editor. Twee externe stappen zitten achter benoemde stubs zodat ze later
// makkelijk te wiren zijn: transcribeRecording (audio→tekst) en generateBlogDraftFromTranscript (LLM).

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "opname";
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// STUB — transcriptie. Bij een geplakt transcript een no-op (geeft de tekst terug). Audio-pad later:
// download audio_path uit storage + roep een transcriptie-API aan (secret TRANSCRIPTION_API_KEY).
async function transcribeRecording(input: { transcript?: string; audioPath?: string }): Promise<string> {
  if (input.transcript && input.transcript.trim()) return input.transcript.trim();
  throw new Error("Geen transcript opgegeven (audio-transcriptie is nog niet gewired).");
}

// STUB — conceptgeneratie. Nu deterministisch (transcript → nette alinea's met een redactie-notitie);
// later vervangen door de echte LLM/skill-chain (zelfde return-vorm: title/content/excerpt).
function generateBlogDraftFromTranscript(transcript: string, title: string): { title: string; content: string; excerpt: string } {
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

    const body = await req.json().catch(() => ({}));
    const title = (typeof body.title === "string" ? body.title : "").trim();
    const recordedOn = typeof body.recorded_on === "string" && body.recorded_on ? body.recorded_on : null;
    const rawTranscript = typeof body.transcript === "string" ? body.transcript : "";
    if (!title) return json({ status: "error", message: "Titel ontbreekt" }, 400);

    const transcript = await transcribeRecording({ transcript: rawTranscript });

    // 1) Opname vastleggen (bron-van-waarheid + plek voor latere audio).
    const { data: rec, error: recErr } = await sb
      .from("content_recordings")
      .insert({ title, recorded_on: recordedOn, transcript, status: "nieuw", created_by: auth.userId ?? null })
      .select("id")
      .single();
    if (recErr) throw recErr;

    // 2) Onderwerp aanmaken (source_type='recording') zodat het in de pijplijn zichtbaar is.
    const { data: topic, error: topicErr } = await sb
      .from("content_topics")
      .insert({
        source_type: "recording",
        raw_title: title,
        raw_summary: transcript.slice(0, 500),
        novelty_key: `rec-${slugify(title)}-${Date.now()}`,
        status: "drafting",
        generated_by: "recording",
        created_by: auth.userId ?? null,
      })
      .select("id")
      .single();
    if (topicErr) throw topicErr;

    // 3) Concept genereren (stub) en als blog_posts-concept wegschrijven via de bestaande RPC.
    const draft = generateBlogDraftFromTranscript(transcript, title);
    const { data: ingest, error: ingestErr } = await sb.rpc("content_ingest_draft", {
      p_topic_id: topic.id,
      p_title: draft.title,
      p_content: draft.content,
      p_excerpt: draft.excerpt,
      p_generated_by: "recording",
    });
    if (ingestErr) throw ingestErr;
    const result = ingest as { blog_post_id: string; slug: string; review_state: string };

    // 4) Opname koppelen aan onderwerp + concept.
    await sb.from("content_recordings")
      .update({ topic_id: topic.id, blog_post_id: result.blog_post_id, status: "verwerkt" })
      .eq("id", rec.id);

    return json({ status: "ok", blog_post_id: result.blog_post_id, slug: result.slug });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwerken mislukt" }, 500);
  }
});
