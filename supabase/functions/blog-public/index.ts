import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";

// Publiek, read-only leespad voor de website (verify_jwt = false).
//   GET            → lijst gepubliceerde blogs (zonder volledige inhoud)
//   GET ?slug=...  → één gepubliceerde blog (incl. inhoud + SEO + json_ld + faq)
// De statische site rendert volledig uit deze JSON; maximaal SEO-geoptimaliseerd.

const SITE = "https://e-charging.nl";           // canonieke host
const BLOG_PATH = "/kennisbank";
const PUBLISHER = { "@type": "Organization", name: "E-Charging", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/og-image.png` } };

const ALLOWED_ORIGINS = ["https://www.e-charging.nl", "https://e-charging.nl"];
function corsHeaders(origin: string) {
  const ok = ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  return buildCors({
    origin: ok ? origin : ALLOWED_ORIGINS[0],
    headers: "content-type",
    methods: "GET, OPTIONS",
    vary: true,
    cacheControl: "public, max-age=60",
  });
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

// Knip op woordgrens tot maximaal n tekens (geen ellipsis — schone meta-waarde).
function clampWords(s: string | null | undefined, n: number): string | null {
  if (!s) return s ?? null;
  const t = s.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}
function wordCount(html: string | null | undefined): number {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

// hero_image_url/-alt zitten óók in de lijst zodat de kennisbank-index een foto-forward hero kan tonen
// (de schone hero-foto zonder ingebakken tekst; valt terug op de cover).
const LIST_COLS = "slug, title, excerpt, category, category_slug, category_slugs, tags, featured, author_name, reading_minutes, published_at, updated_at, cover_image_url, cover_image_alt, cover_image_width, cover_image_height, hero_image_url, hero_image_alt";
const FULL_COLS = `${LIST_COLS}, content, seo_title, seo_description, noindex, canonical_url, faq, sources`;

type AuthorEntity = { name?: string; role?: string; url?: string; sameAs?: string[]; bio?: string };
// deno-lint-ignore no-explicit-any
function buildDetail(p: any, author?: AuthorEntity | null) {
  const canonical = (typeof p.canonical_url === "string" && p.canonical_url) || `${SITE}${BLOG_PATH}/${p.slug}`;
  const seo_title = clampWords(p.seo_title || p.title, 60);
  const seo_description = clampWords(p.seo_description || p.excerpt, 155);
  const faq = Array.isArray(p.faq) ? p.faq : [];
  // Bronnen: alleen goedgevormde items met een echte url doorlaten (defensief; de site rendert ze als links).
  const sources = (Array.isArray(p.sources) ? p.sources : []).filter(
    (s: { name?: unknown; url?: unknown }) => s && typeof s.name === "string" && typeof s.url === "string" && /^https?:\/\//.test(s.url),
  );
  const image = p.cover_image_url
    ? { "@type": "ImageObject", url: p.cover_image_url, ...(p.cover_image_width ? { width: p.cover_image_width } : {}), ...(p.cover_image_height ? { height: p.cover_image_height } : {}) }
    : undefined;
  const blogPosting = {
    "@type": "BlogPosting",
    headline: p.title,
    description: seo_description || undefined,
    image,
    datePublished: p.published_at || undefined,
    dateModified: p.updated_at || undefined,
    author: (author && author.name)
      ? { "@type": "Person", name: author.name, ...(author.role ? { jobTitle: author.role } : {}), ...(author.url ? { url: author.url } : {}), ...(Array.isArray(author.sameAs) && author.sameAs.length ? { sameAs: author.sameAs } : {}), worksFor: PUBLISHER }
      : { "@type": "Organization", name: p.author_name || "E-Charging", url: SITE },
    publisher: PUBLISHER,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: p.category || undefined,
    keywords: (p.tags && p.tags.length) ? p.tags.join(", ") : undefined,
    wordCount: wordCount(p.content),
    // Geverifieerde bronnen als citaties (E-E-A-T-signaal voor zoekmachines en AI-antwoordmachines).
    ...(sources.length ? { citation: sources.map((s: { name: string; url: string }) => ({ "@type": "CreativeWork", name: s.name, url: s.url })) } : {}),
  };
  const graph: unknown[] = [blogPosting];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f: { question: string; answer: string }) => ({
        "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }
  // Top-level auteur-object voor het auteur-blok op de site (E-E-A-T). Alleen als er een naam is.
  const authorCard = (author && author.name)
    ? { name: author.name, role: author.role ?? null, url: author.url ?? null, bio: author.bio ?? null, sameAs: Array.isArray(author.sameAs) ? author.sameAs : [] }
    : null;
  return { ...p, seo_title, seo_description, canonical_url: canonical, faq, sources, author: authorCard, json_ld: { "@context": "https://schema.org", "@graph": graph } };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "GET") return json({ status: "error", message: "Method not allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500, origin);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (slug) {
      const { data, error } = await sb.from("blog_posts").select(FULL_COLS)
        .eq("slug", slug).eq("status", "gepubliceerd").maybeSingle();
      if (error) throw error;
      if (!data) return json({ status: "not_found" }, 404, origin);
      const { data: sRow } = await sb.from("content_engine_settings").select("settings").eq("is_active", true).limit(1).maybeSingle();
      const author = (sRow?.settings as { author?: AuthorEntity } | null)?.author ?? null;
      return json({ status: "ok", post: buildDetail(data, author) }, 200, origin);
    }
    const { data, error } = await sb.from("blog_posts").select(LIST_COLS)
      .eq("status", "gepubliceerd").order("published_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    // Categorie-taxonomie meesturen zodat de site de kennisbank + hubs DB-gedreven kan opbouwen (naam, omschrijving,
    // icoon, volgorde) en alleen categorieën toont die daadwerkelijk gepubliceerde blogs hebben.
    const { data: cats } = await sb.from("blog_categories")
      .select("slug, name, description, icon, sort_order").eq("is_active", true).order("sort_order");
    return json({ status: "ok", posts: data ?? [], categories: cats ?? [] }, 200, origin);
  } catch (err) {
    console.error("blog-public failed:", err instanceof Error ? err.message : err);
    return json({ status: "error", message: "Ophalen mislukt" }, 500, origin);
  }
});
