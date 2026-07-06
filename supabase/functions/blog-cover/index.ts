/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { buildBlogCover, renderCoverWithPhoto, type Cover } from "../_shared/cover.ts";

// Blog-cover: genereert (of vernieuwt) een merk-titelkaart als omslag voor één blog_post en zet de vier
// cover-velden (url + alt + 1200 + 630) zodat de externe SSG og:image/hero toont. Herbruikbaar vanuit de
// autoblog-pijplijn (inline via _shared/cover.ts), de BlogEditor-knop, en voor backfill. verify_jwt=false;
// admin/manager/marketing of interne cron-secret.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "blog-media";

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
    const blogPostId: string | null = typeof body.blog_post_id === "string" ? body.blog_post_id : null;
    const photoUrl: string | null = typeof body.photo_url === "string" ? body.photo_url : null;
    if (!blogPostId) return json({ status: "error", message: "blog_post_id ontbreekt" }, 400);

    const { data: post, error: postErr } = await sb
      .from("blog_posts").select("id, slug, title, category, source_topic_id").eq("id", blogPostId).maybeSingle();
    if (postErr) throw postErr;
    if (!post) return json({ status: "error", message: "Blog niet gevonden" }, 404);

    // Zoekwoord (voor de beeld-brief) via het gekoppelde onderwerp, indien aanwezig.
    let keyword: string | null = null;
    if (post.source_topic_id) {
      const { data: topic } = await sb.from("content_topics")
        .select("target_keyword, matched_keyword_id").eq("id", post.source_topic_id).maybeSingle();
      if (topic?.matched_keyword_id) {
        const { data: kw } = await sb.from("content_keywords").select("query").eq("id", topic.matched_keyword_id).maybeSingle();
        keyword = kw?.query ?? topic?.target_keyword ?? null;
      } else {
        keyword = topic?.target_keyword ?? null;
      }
    }

    let cover: Cover;
    if (photoUrl) {
      // Handmatig/test: gebruik een meegegeven foto-URL i.p.v. Imagen.
      const pres = await fetch(photoUrl);
      if (!pres.ok) throw new Error(`Foto-fetch mislukt: HTTP ${pres.status}`);
      const photoBytes = new Uint8Array(await pres.arrayBuffer());
      const r = await renderCoverWithPhoto({ title: post.title, category: post.category, photoBytes, mime: pres.headers.get("content-type") ?? "image/jpeg" });
      cover = { ...r, alt: post.title };
    } else {
      cover = await buildBlogCover(sb, { title: post.title, category: post.category, keyword });
    }

    const path = `covers/${post.slug || post.id}-${crypto.randomUUID().slice(0, 8)}.png`;
    const { error: upErr } = await sb.storage.from(BUCKET)
      .upload(path, cover.bytes, { contentType: "image/png", cacheControl: "31536000", upsert: true });
    if (upErr) throw upErr;
    const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // Optioneel: rauwe hero-foto (zonder tekst) voor de artikel-hero op de site.
    let heroUpdate: Record<string, unknown> = {};
    if (cover.heroBytes) {
      const heroExt = cover.heroMime && cover.heroMime.includes("jpeg") ? "jpg" : "png";
      const heroPath = `heroes/${post.slug || post.id}-${crypto.randomUUID().slice(0, 8)}.${heroExt}`;
      const { error: hErr } = await sb.storage.from(BUCKET)
        .upload(heroPath, cover.heroBytes, { contentType: cover.heroMime || "image/png", cacheControl: "31536000", upsert: true });
      if (hErr) console.error("Hero-upload mislukt:", hErr.message);
      else heroUpdate = { hero_image_url: sb.storage.from(BUCKET).getPublicUrl(heroPath).data.publicUrl, hero_image_alt: cover.alt };
    }

    const { error: updErr } = await sb.from("blog_posts")
      .update({
        cover_image_url: publicUrl,
        cover_image_alt: cover.alt,
        cover_image_width: cover.width,
        cover_image_height: cover.height,
        ...heroUpdate,
      })
      .eq("id", blogPostId);
    if (updErr) throw updErr;

    return json({ status: "ok", url: publicUrl, width: cover.width, height: cover.height, hero: (heroUpdate as { hero_image_url?: string }).hero_image_url ?? null });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Omslag genereren mislukt" }, 500);
  }
});
