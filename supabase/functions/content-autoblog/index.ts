/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";
import { BLOG_SYSTEM, BLOG_AUDIT_SYSTEM, INTENT_NL, validateBlogJson, validateAuditJson, applyInternalLinks, BLOG_RESEARCH_SYSTEM } from "../_shared/blog.ts";
import { buildBlogCover } from "../_shared/cover.ts";
import { fetchProofBlock } from "../_shared/proof.ts";
import { notifyContentEngine } from "../_shared/content-notify.ts";

// Content-autoblog: de AUTONOME blog-tak naast de opname/podcast-machine. Pakt zelf de best-scorende
// SEO-onderwerpen (content_topics.seo_opportunity), laat Claude met web-search een publicatieklaar
// blog-CONCEPT schrijven (de web-research vervangt de menselijke visie/transcript), schrijft weg via de
// poort-RPC content_ingest_draft (altijd status='concept' + kwaliteitspoort), en publiceert ALLEEN
// automatisch als de blog door de poort komt (review_state='needs_review') EN auto-publiceren aan staat.
// Zakt-ie onder de drempel, dan blijft het een concept in de review-wachtrij. No-op zolang
// settings.autoblog_enabled=false (tenzij {force:true}). Cron-baar via invoke_edge_function. De opname-tak
// en het handmatige publiceer-pad blijven volledig ongemoeid.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  // Wandklok voor de 150s-edgelimiet: dure best-effort-stappen (omslag) slaan we over als de tijd krap wordt,
  // zodat een run altijd een concept/post oplevert i.p.v. een 504 (= totaal verlies).
  const runStart = Date.now();
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
    const force = body.force === true;
    const pinnedTopicId: string | null = typeof body.topic_id === "string" ? body.topic_id : null;

    // 1) Instellingen + kill-switch.
    const { data: settingsRow, error: settingsErr } = await sb
      .from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    if (settingsErr) throw settingsErr;
    const settings = (settingsRow?.settings ?? {}) as any;

    // Testhaakje voor het notificatie-vangnet: stuurt alleen de voorbeeldmail en stopt (geen generatie).
    if (body.notify_test === true) {
      await notifyContentEngine(settings, {
        kind: "kept_concept",
        title: "Testmelding — voorbeeldblog",
        scores: { quality: 71, seo: 78, aeo: 82 },
        reason: "Dit is een testmelding (notify_test); er is niets gegenereerd",
      });
      return json({ status: "ok", action: "notify_test", notify_email: settings.notify_email ?? null });
    }

    if (!settings.autoblog_enabled && !force) {
      return json({ status: "disabled", message: "autoblog_enabled=false" });
    }

    // 2) Effectieve auto-publiceer-beslissing. body.publish===false forceert concept (testmodus).
    // Vóór de sleutel-check: autopublish bepaalt ook of een mislukte run een vangnet-mail verdient
    // (testmodus/handmatige conceptruns melden niet — de uitkomst is dan al zichtbaar in de UI).
    const autopublish = body.publish === true ? true
      : body.publish === false ? false
      : settings.autoblog_autopublish === true;
    // Verse-isolate-herkansing: een gefaalde run (opgeknipte API-beurt, netwerkfout) krijgt
    // maximaal 2 herkansingen in een NIEUW isolate met een vol tijdsbudget.
    const runRetry = Number.isFinite(body.retry) ? Math.max(0, Math.floor(Number(body.retry))) : 0;

    // 3) Claude-sleutel (zonder sleutel netjes slapen, geen crash).
    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      if (autopublish) await notifyContentEngine(settings, { kind: "no_key", reason: "ANTHROPIC_API_KEY ontbreekt in de Vault" });
      return json({ status: "no_key", message: "Stel eerst de Claude-sleutel (ANTHROPIC_API_KEY) in om blogs te genereren." });
    }

    // 4) Onderwerpen selecteren: gepind of top-N op SEO-kans, nog niet in een blog verwerkt.
    const perRun = Number.isFinite(body.limit) ? Math.max(1, Math.min(5, Number(body.limit)))
      : Number.isFinite(settings.autoblog_per_run) ? Math.max(1, Math.min(5, Number(settings.autoblog_per_run)))
      : 1;
    const topicCols = "id, raw_title, raw_summary, source_url, source_name, target_keyword, matched_keyword_id, conversation_question, background, suggested_angle, assigned_category, seo_opportunity";
    let topics: any[] = [];
    if (pinnedTopicId) {
      const { data, error } = await sb.from("content_topics").select(topicCols).eq("id", pinnedTopicId).maybeSingle();
      if (error) throw error;
      if (data) topics = [data];
    } else {
      // Dedup per zoekwoord (anti-kannibalisatie): max 1 onderwerp per keyword, en keywords die al door een
      // bestaande blog gedekt zijn worden overgeslagen. Zo levert 3x/week elke keer een DISTINCT zoekwoord.
      const { data, error } = await sb.rpc("content_select_autoblog_topics", { p_limit: perRun });
      if (error) throw error;
      topics = (data ?? []) as any[];
    }
    if (topics.length === 0) {
      if (autopublish) await notifyContentEngine(settings, { kind: "empty_pool" });
      return json({ status: "ok", generated: 0, published: 0, concepts: 0, errors: 0, results: [], message: "Geen onderwerpen in de pool." });
    }

    // 5+) Het echte werk duurt minuten, maar de cron-aanroeper (pg_net) verbreekt de
    // verbinding al na 5 s. Of een isolate zo'n disconnect overleeft is zonder
    // waitUntil een gok: de runs van 6 en 10 juli stierven stil — geen blog, geen
    // logregel, geen mail. Daarom: heartbeat vastleggen, meteen antwoorden en de run
    // in de achtergrond afmaken; EdgeRuntime.waitUntil houdt de isolate in leven.
    if (settingsRow?.id) {
      const { data: fresh } = await sb.from("content_engine_settings").select("settings").eq("id", settingsRow.id).maybeSingle();
      const beat = (fresh?.settings ?? settings) as any;
      await sb.from("content_engine_settings")
        .update({ settings: { ...beat, last_autoblog_started_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    // Breadcrumbs in content_engine_events: een gestorven isolate laat zo tóch een spoor na.
    // Bewust ge-await op sleutelmomenten (~ms) zodat de laatste stap vóór een dood altijd vastligt.
    const ev = async (step: string, detail: Record<string, unknown> = {}) => {
      try { await sb.from("content_engine_events").insert({ fn: "content-autoblog", step, detail }); } catch { /* nooit blokkeren */ }
    };

    const run = async (): Promise<Record<string, unknown>> => {
      await ev("run_start", { topics: topics.length });
      // 5) Grondslag die voor alle onderwerpen gelijk is: gepubliceerde slugs (interne links) + model/tokens.
      const { data: slugRows } = await sb.from("blog_posts").select("slug, title").eq("status", "gepubliceerd").limit(50);
      const slugs = (slugRows ?? []) as { slug: string; title: string }[];
      const validSlugs = new Set(slugs.map((s) => s.slug));

      // Categorie-taxonomie (bron van waarheid = blog_categories). De schrijver kiest 1-3 slugs uit deze lijst; de
      // primaire (eerste) categorie vult category/category_slug, de rest komt in category_slugs. Het model mag een
      // NIEUWE categorie voorstellen (suggested_category) bij een terugkerend thema dat nergens past -> die INSERTen we.
      const { data: catRows } = await sb.from("blog_categories").select("slug, name, description, icon").eq("is_active", true).order("sort_order");
      const taxonomy = (catRows ?? []) as { slug: string; name: string; description: string | null; icon: string | null }[];
      const validCategorySlugs = new Set(taxonomy.map((c) => c.slug));
      const slugToName = new Map(taxonomy.map((c) => [c.slug, c.name] as const));
      const categoryBlock = taxonomy.length
        ? `CATEGORIEEN (kies 1-3 best passende slugs voor category_slugs, meest passende eerst):\n${taxonomy.map((c) => `- ${c.slug} (${c.name})`).join("\n")}`
        : null;
      // Slugificatie identiek aan content_ingest_draft (lower, niet-alfanumeriek -> '-', trim).
      const slugify = (s: string) =>
        s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      // Eigen, geanonimiseerde praktijkcijfers (E-E-A-T / information gain) - één keer per run; gelijk voor alle onderwerpen.
      // Faalt zacht (block=null) zodat generatie doorloopt; is de datalaag te dun, dan levert de post information gain
      // uit web-research + praktijkexpertise en beslist de auditor.
      const proof = await fetchProofBlock(sb);
      const model = typeof settings.generation_model === "string" ? settings.generation_model : DEFAULT_MODEL;
      const maxTokens = Number.isFinite(settings.generation_max_tokens) ? settings.generation_max_tokens : 8000;
      // De onafhankelijke kwaliteitspoort draait op een SNEL model (Haiku): scoren is een begrensde taak en de
      // edge heeft een harde 150s-wandkloklimiet. Een trage auditor zou de hele run over de time-out duwen (504 =
      // geen concept). Instelbaar via settings.audit_model.
      const auditModel = typeof settings.audit_model === "string" ? settings.audit_model : "claude-haiku-4-5-20251001";
      // HOGE publiceer-lat (zelfde als content-revise): alleen een echt sterke eerste draft gaat direct live; de rest
      // gaat de herschrijf-tot-topkwaliteit-keten in.
      const TARGET_Q = Number.isFinite(settings.autoblog_target_quality) ? Number(settings.autoblog_target_quality) : 82;
      const TARGET_SA = Number.isFinite(settings.autoblog_target_seo_aeo) ? Number(settings.autoblog_target_seo_aeo) : 80;
      const authorLine = (settings.author && settings.author.name)
        ? `AUTEUR: ${settings.author.name}${settings.author.role ? `, ${settings.author.role}` : ""}. Schrijf vanuit eigen ervaring en eerste-hands praktijkdata van het team; benoem concrete praktijkvoorbeelden en wees specifiek (E-E-A-T).`
        : `Schrijf vanuit eigen ervaring en eerste-hands praktijkdata van het team; benoem concrete praktijkvoorbeelden en wees specifiek (E-E-A-T).`;

      let generated = 0, published = 0, concepts = 0, errors = 0;
      const results: any[] = [];

      // 6) Per onderwerp: onderzoek + schrijf + poort + (eventueel) publiceer. Fouten isoleren per onderwerp.
      for (const t of topics) {
        try {
          // Zoekwoord-context voor de zoekvraag.
          let kw: any = null;
          if (t.matched_keyword_id) {
            const { data: k } = await sb.from("content_keywords").select("query, intent, cluster, audience").eq("id", t.matched_keyword_id).maybeSingle();
            kw = k;
          }
          const zoekvraag = kw?.query || t.target_keyword || t.raw_title;

          // STAP 1 - RESEARCH (kort, mét web-search). Bewust gescheiden van het schrijven: een lange
          // zoek-plus-schrijf-beurt knipt de API op (stop_reason=pause_turn/tool_use) en dat overleeft
          // een isolate niet. Kort feitenrapport in, volledige blog eruit in een tool-loze tweede stap.
          const resT0 = Date.now();
          await ev("research_start", { topic: t.id });
          const research = await anthropicMessage({
            apiKey,
            system: BLOG_RESEARCH_SYSTEM,
            user: [
              `DATUM VAN VANDAAG: ${new Date().toISOString().slice(0, 10)}`,
              t.raw_title ? `ONDERWERP: ${t.raw_title}` : null,
              t.raw_summary ? `CONTEXT: ${t.raw_summary}` : null,
              zoekvraag ? `ZOEKVRAAG: ${zoekvraag}` : null,
              t.suggested_angle ? `INVALSHOEK: ${t.suggested_angle}` : null,
            ].filter(Boolean).join("\n"),
            model,
            // Ruim budget: bij web-search tellen de zoekresultaat-blokken mee als output-tokens
            // (zelfde maat als de feitencontrole, die stabiel draait met 8 searches).
            maxTokens: 8000,
            retries: 1,
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          });
          await ev("research_ok", { topic: t.id, ms: Date.now() - resT0, chars: research.length });

          // STAP 2 - SCHRIJVEN (geen tools; pure emissie, kan niet worden opgeknipt). De onderscheidende
          // invalshoek is de praktijkexpertise van het bedrijf (installatie/beheer/facturatie) + de brief.
          const user = [
            t.raw_title ? `BRON-titel: ${t.raw_title}` : null,
            t.raw_summary ? `BRON-samenvatting: ${t.raw_summary}` : null,
            t.source_url ? `BRON-url: ${t.source_url}` : null,
            zoekvraag ? `ZOEKVRAAG: ${zoekvraag}${kw?.intent ? ` (zoekdoel: ${INTENT_NL[kw.intent] ?? kw.intent})` : ""}` : null,
            t.conversation_question ? `GESPREKSVRAAG: ${t.conversation_question}` : null,
            t.background ? `ACHTERGROND: ${t.background}` : null,
            t.suggested_angle ? `INVALSHOEK: ${t.suggested_angle}` : null,
            `VANDAAG IS ${new Date().toISOString().slice(0, 10)}. Behandel dit als peildatum: geef voorrang aan de meest recente feiten, cijfers en regelgeving, en maak in de tekst duidelijk hoe actueel iets is (bv. "per 2026" / "sinds medio 2026").`,
            `ONDERZOEKSRESULTATEN (zojuist met web-research geverifieerd; baseer de blog HIEROP, verzin geen feiten; als iets onbekend blijft, schrijf het algemeen):\n${research}`,
            `VISIE: Er is geen opgenomen teamgesprek. Lever de originaliteit en E-E-A-T daarom uit de praktijkexpertise van het bedrijf als leverancier EN beheerder van laadinfrastructuur (advies, installatie, beheer en facturatie voor kantoren, VvE's, bedrijfspanden en parkeerterreinen): geef concrete, praktijkgerichte inzichten en afwegingen die alleen een ervaren partij kan geven. Combineer dit met de INVALSHOEK en de geverifieerde feiten uit je web-research.`,
            slugs.length ? `INTERNE LINKS (gebruik ALLEEN deze; plaats er 3-5 als inline <a href="/kennisbank/<slug>">-links in de lopende tekst):\n${slugs.map((s) => `- /kennisbank/${s.slug} (${s.title})`).join("\n")}` : null,
            `MERKCONTEXT: Het bedrijf levert en beheert laadinfrastructuur voor zakelijke en vastgoedklanten (kantoren, VvE's, bedrijfspanden, parkeerterreinen): advies, installatie, beheer en facturatie van laadpunten.`,
            authorLine,
            proof.block,
            categoryBlock,
            `Titel-suggestie: ${t.raw_title}`,
          ].filter(Boolean).join("\n\n");

          // EEN web-search-gegronde schrijf-poging (de dure stap: web_search-round-trips domineren de looptijd).
          // Faalt de JSON-validatie, dan NIET opnieuw zoeken (een tweede volledige web-search-write verdubbelt de tijd
          // en veroorzaakt 504s op de 150s-edgelimiet) maar een SNELLE repair-call ZONDER tools die de ruwe output
          // naar geldige JSON herstelt (de fout is vrijwel altijd JSON-escaping in de lange HTML-string).
          let draft: ReturnType<typeof validateBlogJson> | null = null;
          let genErr: unknown = null;
          let raw0: string | null = null;
          const genT0 = Date.now();
          await ev("generate_start", { topic: t.id, title: String(t.raw_title ?? "").slice(0, 80) });
          try {
            raw0 = await anthropicMessage({
              apiKey, system: BLOG_SYSTEM, user, model,
              maxTokens: Math.max(12000, maxTokens),
              retries: 1,
            });
            await ev("generate_ok", { topic: t.id, ms: Date.now() - genT0, chars: raw0.length });
            draft = validateBlogJson(extractJson<any>(raw0), validSlugs, validCategorySlugs);
          } catch (e) {
            genErr = e;
            await ev("generate_or_json_failed", { topic: t.id, ms: Date.now() - genT0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
          }
          if (!draft && raw0) {
            try {
              const repaired = await anthropicMessage({
                apiKey, model, maxTokens,
                system: "Je krijgt tekst die geldige JSON had moeten zijn maar dat niet is (meestal een niet-ge-escapet teken in een lange HTML-string). Geef UITSLUITEND de gecorrigeerde, geldige JSON terug: exact dezelfde velden en inhoud, alleen hersteld naar geldige JSON. Geen uitleg, geen extra tekst.",
                user: raw0,
              });
              draft = validateBlogJson(extractJson<any>(repaired), validSlugs, validCategorySlugs);
              await ev("repair_ok", { topic: t.id });
            } catch (e) {
              genErr = e;
              await ev("repair_failed", { topic: t.id, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
            }
          }
          if (!draft) throw genErr instanceof Error ? genErr : new Error("Generatie mislukt (ongeldige JSON)");

          // Vangnet: gevalideerde interne links écht in de HTML plaatsen (topical authority + crawl-diepte).
          draft.content = applyInternalLinks(draft.content, draft.internal_link_suggestions, validSlugs);

          // AUTO-CATEGORISEREN: gebruik de door de schrijver gekozen (al tegen de taxonomie gevalideerde) slugs.
          // Een voorgestelde NIEUWE categorie (suggested_category) INSERTen we -- mits geen bijna-duplicaat -- en
          // nemen we mee (vrijheid om categorieen toe te voegen bij terugkerende thema's). Valt alles weg, dan de
          // door de onderwerp-brief toegewezen categorie als terugval.
          let catSlugs: string[] = [...draft.category_slugs];
          if (draft.suggested_category) {
            const sc = draft.suggested_category;
            const newSlug = slugify(sc.name);
            const nameLc = sc.name.trim().toLowerCase();
            const dupSlug = newSlug && validCategorySlugs.has(newSlug);
            const dupName = taxonomy.some((c) => c.name.trim().toLowerCase() === nameLc);
            if (dupSlug || dupName) {
              // Bijna-duplicaat: gebruik de bestaande categorie i.p.v. een nieuwe aan te maken.
              const existing = taxonomy.find((c) => c.slug === newSlug || c.name.trim().toLowerCase() === nameLc);
              if (existing && !catSlugs.includes(existing.slug)) catSlugs.unshift(existing.slug);
            } else if (newSlug) {
              const { error: catErr } = await sb.from("blog_categories").insert({
                slug: newSlug, name: sc.name.trim(), description: sc.description, icon: sc.icon ?? "BookOpen", sort_order: 100, is_active: true,
              });
              if (!catErr) {
                validCategorySlugs.add(newSlug);
                slugToName.set(newSlug, sc.name.trim());
                taxonomy.push({ slug: newSlug, name: sc.name.trim(), description: sc.description, icon: sc.icon ?? "BookOpen" });
                if (!catSlugs.includes(newSlug)) catSlugs.push(newSlug);
              } else {
                console.error("Nieuwe categorie aanmaken mislukt:", catErr.message);
              }
            }
          }
          // Terugval op de brief-categorie als het model niets bruikbaars koos.
          if (catSlugs.length === 0 && t.assigned_category) {
            const s = slugify(t.assigned_category);
            if (validCategorySlugs.has(s)) catSlugs = [s];
          }
          catSlugs = [...new Set(catSlugs)].slice(0, 3);
          const primarySlug = catSlugs[0] ?? null;
          const primaryName = primarySlug ? (slugToName.get(primarySlug) ?? t.assigned_category ?? null) : (t.assigned_category ?? null);

          // ONAFHANKELIJKE KWALITEITSPOORT: een aparte Claude-call (auditor, geen web-search) beoordeelt het
          // concept. De schrijver scoort zichzelf te mild; deze scores zijn gezaghebbend en voeden de SQL-poort.
          // Faalt de audit-call, dan vallen we terug op de zelf-scores maar forceren we 'revise' (nooit auto-publiceren
          // zonder onafhankelijke keuring).
          let audit;
          try {
            const faqTekst = draft.faq.map((f) => `V: ${f.question}\nA: ${f.answer}`).join("\n");
            const auditUser = [
              `ZOEKVRAAG: ${zoekvraag}`,
              `TITEL: ${draft.title}`,
              `BLOG (HTML):\n${draft.content}`,
              faqTekst ? `FAQ (apart veld):\n${faqTekst}` : null,
            ].filter(Boolean).join("\n\n");
            const auditRaw = await anthropicMessage({ apiKey, system: BLOG_AUDIT_SYSTEM, user: auditUser, model: auditModel, maxTokens: 1500 });
            audit = validateAuditJson(extractJson<any>(auditRaw));
          } catch (auditErr) {
            console.error("Kwaliteitsaudit mislukt, terugval op zelf-scores + revise:", auditErr instanceof Error ? auditErr.message : auditErr);
            audit = { seo_score: draft.seo_score, aeo_score: draft.aeo_score, quality_score: draft.quality_score, has_information_gain: false, has_first_hand_signal: false, issues: [], missing_experience: [], verdict: "revise" as const };
          }

          await ev("audit_done", { topic: t.id, q: audit.quality_score, seo: audit.seo_score, aeo: audit.aeo_score, verdict: audit.verdict });

          // Wegschrijven via de poort-RPC: altijd status='concept', poort bepaalt review_state o.b.v. de AUDITOR-scores.
          const { data: ingest, error: ingestErr } = await sb.rpc("content_ingest_draft", {
            p_topic_id: t.id, p_title: draft.title, p_content: draft.content, p_excerpt: draft.excerpt,
            p_category: primaryName,
            p_tags: draft.tags, p_faq: draft.faq,
            p_seo_title: draft.seo_title, p_seo_description: draft.seo_description,
            p_seo_score: audit.seo_score, p_aeo_score: audit.aeo_score, p_quality_score: audit.quality_score,
            p_meta_variants: draft.meta_variants, p_internal_link_suggestions: draft.internal_link_suggestions,
            p_author_name: (settings.author && settings.author.name) ? settings.author.name : null,
            p_generated_by: "agent:claude-autoblog@v6",
            p_sources: draft.sources,
          });
          if (ingestErr) throw ingestErr;
          const result = ingest as { blog_post_id: string; slug: string; review_state: string };
          generated++;
          await ev("ingest_ok", { topic: t.id, blog_post_id: result.blog_post_id, slug: result.slug, review_state: result.review_state });

          // Multi-categorie + exacte primaire slug wegschrijven (de RPC kent alleen de enkele category/category_slug).
          if (catSlugs.length) {
            await sb.from("blog_posts")
              .update({ category_slugs: catSlugs, category_slug: primarySlug })
              .eq("id", result.blog_post_id);
          }

          // Omslag genereren (Imagen-foto + kop-overlay; valt terug op de vlakke kaart) + de 4 cover-velden
          // zetten VOOR een eventuele publicatie (zodat de SSG og:image/hero toont). BEST-EFFORT: overslaan als het
          // tijdsbudget krap is (150s edge-limiet), zodat de post nooit door de omslag verloren gaat (backfill later).
          if (Date.now() - runStart < 110000) {
          try {
            const cover = await buildBlogCover(sb, { title: draft.title, category: primaryName ?? undefined, keyword: zoekvraag });
            const coverPath = `covers/${result.slug}-${crypto.randomUUID().slice(0, 8)}.png`;
            const { error: upErr } = await sb.storage.from("blog-media")
              .upload(coverPath, cover.bytes, { contentType: "image/png", cacheControl: "31536000", upsert: true });
            if (upErr) throw upErr;
            const coverUrl = sb.storage.from("blog-media").getPublicUrl(coverPath).data.publicUrl;
            // Rauwe hero-foto (zonder tekst) voor de artikel-hero op de site.
            let heroUpdate: Record<string, unknown> = {};
            if (cover.heroBytes) {
              const heroExt = cover.heroMime && cover.heroMime.includes("jpeg") ? "jpg" : "png";
              const heroPath = `heroes/${result.slug}-${crypto.randomUUID().slice(0, 8)}.${heroExt}`;
              const { error: hErr } = await sb.storage.from("blog-media")
                .upload(heroPath, cover.heroBytes, { contentType: cover.heroMime || "image/png", cacheControl: "31536000", upsert: true });
              if (hErr) console.error("Hero-upload mislukt:", hErr.message);
              else heroUpdate = { hero_image_url: sb.storage.from("blog-media").getPublicUrl(heroPath).data.publicUrl, hero_image_alt: cover.alt };
            }
            await sb.from("blog_posts").update({
              cover_image_url: coverUrl, cover_image_alt: cover.alt,
              cover_image_width: cover.width, cover_image_height: cover.height,
              ...heroUpdate,
            }).eq("id", result.blog_post_id);
          } catch (coverErr) {
            console.error("Omslag genereren mislukt:", coverErr instanceof Error ? coverErr.message : coverErr);
          }
          } else {
            console.warn("Omslag overgeslagen: tijdsbudget te krap voor de 150s-limiet; wordt later gebackfilld.");
          }

          // De poort is ALLEEN geslaagd als review_state='needs_review' (auditor-scores boven de drempels),
          // alle drie de auditor-scores echt gemeten zijn, EN de auditor 'publish' zegt. Een 'revise'-verdict
          // blokkeert auto-publiceren ongeacht de cijfers: het concept blijft ter review in de wachtrij.
          // Verhard-automatisch: auto-publiceren vereist review_state='needs_review', alle drie scores gemeten, verdict
          // 'publish', EN de auditor moet zowel information-gain als een eerste-hands-signaal hebben bevestigd. Zo mag
          // alleen echt onderscheidende content vanzelf live; generieke posts blijven concept ter review (geen firehose).
          const scored = audit.seo_score !== null && audit.aeo_score !== null && audit.quality_score !== null;
          // HOGE lat: alleen een echt sterke eerste draft publiceert direct. Anders start de herschrijf-keten (content-revise).
          const passed = scored
            && (audit.quality_score as number) >= TARGET_Q
            && (audit.seo_score as number) >= TARGET_SA && (audit.aeo_score as number) >= TARGET_SA;
          // Auditsamenvatting voor het runrapport (auditor-scores + poort-signalen + zelf-scores + gebreken + gebruikte eigen data).
          const auditInfo = {
            verdict: audit.verdict,
            information_gain: audit.has_information_gain,
            first_hand: audit.has_first_hand_signal,
            audit_scores: { seo: audit.seo_score, aeo: audit.aeo_score, quality: audit.quality_score },
            writer_scores: { seo: draft.seo_score, aeo: draft.aeo_score, quality: draft.quality_score },
            proof_stats: proof.stats,
            issues: audit.issues,
            missing_experience: audit.missing_experience,
          };
          if (autopublish && passed) {
            // Kwaliteit direct op orde → door naar de laatste poort: de feitencontrole. Die publiceert
            // (na verificatie van cijfers, bronnen en data) of bounct terug met correcties. Er wordt
            // nergens anders meer gepubliceerd.
            await sb.rpc("invoke_edge_function", {
              fn_name: "content-factcheck",
              body: { blog_post_id: result.blog_post_id, iteration: 1, factcheck_round: 1 },
            });
            concepts++;
            results.push({ topic_id: t.id, blog_post_id: result.blog_post_id, slug: result.slug, review_state: result.review_state, action: "factchecking", ...auditInfo });
          } else if (autopublish) {
            // Zakt de HOGE lat maar auto-publiceren staat aan: start de herschrijf-tot-topkwaliteit-keten (async, eigen
            // tijdsbudget) i.p.v. het concept te laten liggen. De keten verbetert de post tot 'ie de lat haalt en publiceert dan.
            await sb.rpc("invoke_edge_function", {
              fn_name: "content-revise",
              body: { blog_post_id: result.blog_post_id, iteration: 1, issues: audit.issues, missing_experience: audit.missing_experience, factcheck_round: 1 },
            });
            concepts++;
            results.push({ topic_id: t.id, blog_post_id: result.blog_post_id, slug: result.slug, review_state: result.review_state, action: "revising", ...auditInfo });
          } else {
            // Auto-publiceren uit of testmodus: blijft concept ter review.
            concepts++;
            results.push({ topic_id: t.id, blog_post_id: result.blog_post_id, slug: result.slug, review_state: result.review_state, action: "concept", ...auditInfo });
          }
        } catch (err) {
          errors++;
          results.push({ topic_id: t.id, action: "failed", reason: err instanceof Error ? err.message : "onbekende fout" });
          await ev("topic_failed", { topic: t.id, error: err instanceof Error ? err.message.slice(0, 300) : "onbekende fout" });
        }
      }

      // 7) Tijdstip van deze run vastleggen. Herlees eerst zodat een instelling die tijdens de (minuten-
      // lange) run door een beheerder is aangepast niet wordt overschreven; we voegen alleen last_autoblog_at toe.
      if (settingsRow?.id) {
        const { data: fresh } = await sb.from("content_engine_settings").select("settings").eq("id", settingsRow.id).maybeSingle();
        const base = (fresh?.settings ?? settings) as any;
        await sb.from("content_engine_settings")
          .update({ settings: { ...base, last_autoblog_at: new Date().toISOString() } })
          .eq("id", settingsRow.id);
      }

      // Vangnet 1: er is niets gegenereerd en er waren fouten (opgeknipte API-beurt, netwerk) —
      // probeer het opnieuw in een VERS isolate met een vol tijdsbudget (max 2 herkansingen).
      if (generated === 0 && errors > 0 && runRetry < 2) {
        await ev("run_retry", { next: runRetry + 1 });
        await sb.rpc("invoke_edge_function", {
          fn_name: "content-autoblog",
          body: { retry: runRetry + 1, ...(typeof body.publish === "boolean" ? { publish: body.publish } : {}) },
        });
        return { status: "ok", retrying: runRetry + 1, generated, published, concepts, errors, results };
      }

      // Vangnet 2: productie-run eindigde zonder publicatie én zonder lopende keten (revise/factcheck
      // melden hun eigen keteneinde via kept_concept of het factcheck-rapport). Zonder mail blijft
      // zo'n uitkomst onzichtbaar.
      if (autopublish && published === 0 && !results.some((r) => r.action === "revising" || r.action === "factchecking")) {
        await notifyContentEngine(settings, {
          kind: "run_failed",
          reason: `Run afgerond: ${generated} gegenereerd, ${concepts} concept, ${errors} fout — geen publicatie${runRetry ? ` (na ${runRetry} herkansing(en))` : ""}`,
          details: results.map((r) => r.reason ?? r.publish_error).filter((d): d is string => typeof d === "string"),
        });
      }

      await ev("run_done", { generated, published, concepts, errors, actions: results.map((r) => r.action) });
      return { status: "ok", generated, published, concepts, errors, results };
    };

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(
        run().catch(async (err) => {
          // Een fout in de achtergrond heeft geen respons meer om in te belanden;
          // zonder deze catch zou hij opnieuw onzichtbaar zijn.
          console.error("content-autoblog achtergrond-run faalde:", err instanceof Error ? err.message : err);
          await sb.from("content_engine_events").insert({ fn: "content-autoblog", step: "run_crashed", detail: { error: err instanceof Error ? err.message.slice(0, 300) : "onbekende fout" } }).then(undefined, () => {});
          if (autopublish) {
            await notifyContentEngine(settings, {
              kind: "run_failed",
              reason: `Achtergrond-run gecrasht: ${err instanceof Error ? err.message : "onbekende fout"}`,
            }).catch(() => {});
          }
        }),
      );
      return json({ status: "started", topics: topics.length, autopublish });
    }
    // Fallback zonder waitUntil (lokaal draaien): synchroon, zoals voorheen.
    return json(await run());
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Autoblog mislukt" }, 500);
  }
});
