/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";
import { BLOG_REVISE_SYSTEM, BLOG_AUDIT_SYSTEM, validateBlogJson, validateAuditJson, applyInternalLinks, validateSources } from "../_shared/blog.ts";
import { fetchProofBlock } from "../_shared/proof.ts";
import { notifyContentEngine } from "../_shared/content-notify.ts";

// content-revise: één schakel in de HERSCHRIJF-TOT-TOPKWALITEIT-keten. Neemt een autoblog-CONCEPT + de auditor-kritiek,
// herschrijft het gericht (Sonnet, GEEN web-search → snel), her-audit (Haiku), en geeft het bij een voldoende
// door aan content-factcheck — DE enige plek die publiceert, ná feitencontrole. Anders < MAX → zichzelf
// re-invoken met de nieuwe kritiek; anders (geplateaud) → factcheck als het boven de vloer zit, anders concept.
// De run zelf draait in de achtergrond (EdgeRuntime.waitUntil): de aanroeper (pg_net) verbreekt na 5s en
// zonder waitUntil kon een iteratie stil sterven — geen blog, geen log, geen mail.
// verify_jwt=false; intern (cron/keten) of admin/marketing.
// Body: { blog_post_id, iteration?, issues?, missing_experience?, factcheck_round?, finalize? }.

const cors = CORS_INTERNAL;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
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
    const blogPostId: string | null = typeof body.blog_post_id === "string" ? body.blog_post_id : null;
    if (!blogPostId) return json({ status: "error", message: "blog_post_id ontbreekt" }, 400);
    // FINALIZE-modus: herschrijf een BESTAANDE (gepubliceerde) post één keer naar de huisstijl + zonder exacte
    // platformcijfers + auto-categoriseren, IN PLACE. Geen keten, geen her-audit, geen publish-flip; status en slug
    // blijven. Gebruikt om alle oude blogs definitief op één lijn te brengen.
    const finalize = body.finalize === true;
    const iteration = Number.isFinite(body.iteration) ? Math.max(1, Math.floor(Number(body.iteration))) : 1;
    const issues: string[] = Array.isArray(body.issues) ? body.issues.filter((x: unknown) => typeof x === "string") : [];
    const missingExp: string[] = Array.isArray(body.missing_experience) ? body.missing_experience.filter((x: unknown) => typeof x === "string") : [];
    // De feitencontrole-ronde reist door de keten mee: een factcheck-bounce start ronde 2, daarna is het einde.
    const factcheckRound = Number.isFinite(body.factcheck_round) ? Math.max(1, Math.floor(Number(body.factcheck_round))) : 1;

    // Alleen autoblog-CONCEPTEN herschrijven (idempotent: een reeds gepubliceerde post door een parallelle schakel = klaar).
    // In FINALIZE-modus mag de post juist wél gepubliceerd zijn (we werken hem in place bij).
    const { data: post } = await sb.from("blog_posts")
      .select("id, slug, title, content, faq, sources, category, category_slug, category_slugs, source_topic_id, status, revise_count, cover_image_url")
      .eq("id", blogPostId).maybeSingle();
    if (!post) return json({ status: "not_found", message: "Post niet gevonden" });
    if (!finalize && post.status === "gepubliceerd") return json({ status: "already_published", blog_post_id: blogPostId });

    const { data: settingsRow } = await sb.from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const model = typeof settings.generation_model === "string" ? settings.generation_model : DEFAULT_MODEL;
    const auditModel = typeof settings.audit_model === "string" ? settings.audit_model : "claude-haiku-4-5-20251001";
    const maxTokens = Number.isFinite(settings.generation_max_tokens) ? settings.generation_max_tokens : 8000;
    const MAX = Number.isFinite(settings.autoblog_max_revise) ? Math.max(1, Number(settings.autoblog_max_revise)) : 4;
    const TARGET_Q = Number.isFinite(settings.autoblog_target_quality) ? Number(settings.autoblog_target_quality) : 82;
    const TARGET_SA = Number.isFinite(settings.autoblog_target_seo_aeo) ? Number(settings.autoblog_target_seo_aeo) : 80;
    const FLOOR = Number.isFinite(settings.min_quality) ? Number(settings.min_quality) : 75;

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      // Keten sterft zonder sleutel: de post blijft anders geruisloos concept.
      if (!finalize) await notifyContentEngine(settings, { kind: "no_key", title: post.title, reason: "Claude-sleutel viel weg tijdens de herschrijf-keten", blogPostId });
      return json({ status: "no_key", message: "Claude-sleutel ontbreekt" });
    }

    const run = async (): Promise<Record<string, unknown>> => {
      // Omslag op KETEN-EINDES zonder factcheck (kept_concept): async kick naar blog-cover (eigen budget).
      // Publicatie-covers regelt content-factcheck zelf. blog-cover skipt als er al een cover staat.
      const kickCoverIfMissing = async () => {
        if (post.cover_image_url) return;
        try {
          await sb.rpc("invoke_edge_function", { fn_name: "blog-cover", body: { blog_post_id: blogPostId } });
        } catch { /* best-effort */ }
      };

      // Zoekvraag + context.
      let zoekvraag = post.title;
      if (post.source_topic_id) {
        const { data: t } = await sb.from("content_topics").select("matched_keyword_id, target_keyword, raw_title").eq("id", post.source_topic_id).maybeSingle();
        if (t) {
          if (t.matched_keyword_id) {
            const { data: k } = await sb.from("content_keywords").select("query").eq("id", t.matched_keyword_id).maybeSingle();
            zoekvraag = k?.query || t.target_keyword || t.raw_title || post.title;
          } else zoekvraag = t.target_keyword || t.raw_title || post.title;
        }
      }

      // Breadcrumbs in content_engine_events: een gestorven isolate laat zo tóch een spoor na.
      const ev = async (step: string, detail: Record<string, unknown> = {}) => {
        try { await sb.from("content_engine_events").insert({ fn: "content-revise", step, detail: { blog_post_id: blogPostId, iteration, finalize, ...detail } }); } catch { /* nooit blokkeren */ }
      };
      await ev("run_start");

      const { data: slugRows } = await sb.from("blog_posts").select("slug, title").eq("status", "gepubliceerd").limit(50);
      const slugs = (slugRows ?? []) as { slug: string; title: string }[];
      const validSlugs = new Set(slugs.map((s) => s.slug));

      // Categorie-taxonomie (bron van waarheid = blog_categories) voor auto-categoriseren, zoals in content-autoblog.
      const { data: catRows } = await sb.from("blog_categories").select("slug, name, description, icon").eq("is_active", true).order("sort_order");
      const taxonomy = (catRows ?? []) as { slug: string; name: string; description: string | null; icon: string | null }[];
      const validCategorySlugs = new Set(taxonomy.map((c) => c.slug));
      const slugToName = new Map(taxonomy.map((c) => [c.slug, c.name] as const));
      const categoryBlock = taxonomy.length
        ? `CATEGORIEEN (kies 1-3 best passende slugs voor category_slugs, meest passende eerst):\n${taxonomy.map((c) => `- ${c.slug} (${c.name})`).join("\n")}`
        : null;
      const slugify = (s: string) =>
        s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      const proof = await fetchProofBlock(sb);
      const authorLine = (settings.author && settings.author.name)
        ? `AUTEUR: ${settings.author.name}${settings.author.role ? `, ${settings.author.role}` : ""}. Schrijf vanuit eigen ervaring en eerste-hands praktijkdata van het team; wees concreet en specifiek (E-E-A-T).`
        : `Schrijf vanuit eigen ervaring en eerste-hands praktijkdata van het team; wees concreet en specifiek (E-E-A-T).`;

      // ── 1) HERSCHRIJVEN (Sonnet, geen tools) ──
      const finalizeDirective = finalize
        ? `DEFINITIEVE HUISSTIJL-RONDE: dit is een bestaande, live blog die je op de vaste huisstijl brengt en definitief maakt. Behoud het onderwerp, de kern-feiten en de structuur, maar (1) VERWIJDER elk exact intern/platformcijfer (aantallen laadpunten, locaties, laadsessies, kWh, euro-opbrengsten, bezettings-/groeipercentages van onszelf) en herschrijf het naar een kwalitatieve formulering zonder getal; (2) breng tekst en toon volledig in de huisstijl (In het kort-blok, vroege definitiezin, answer-first H2's, tabel waar zinvol, FAQ met 5 vragen UITSLUITEND in het faq-veld, "u"-vorm, geen em-dashes, zakelijk-neutraal); (3) verbeter waar mogelijk de information gain met publiek gebronde feiten (bron + jaartal). Geef dezelfde JSON terug.`
        : null;
      const bestaandeFaq = (Array.isArray(post.faq) ? post.faq : [])
        .map((f: any) => `V: ${f?.question}\nA: ${f?.answer}`).join("\n");
      const bestaandeBronnen = validateSources(post.sources);
      const user = [
        finalizeDirective,
        `ZOEKVRAAG: ${zoekvraag}`,
        `HUIDIGE BLOG - TITEL: ${post.title}`,
        `HUIDIGE BLOG - CONTENT (HTML):\n${post.content}`,
        bestaandeFaq ? `HUIDIGE FAQ (verbeteren en teruggeven in het faq-veld):\n${bestaandeFaq}` : null,
        bestaandeBronnen.length
          ? `BRONNEN (overnemen in het sources-veld; alleen aanvullen met bronnen waarvan je de echte url kent):\n${bestaandeBronnen.map((s) => `- ${s.name}: ${s.url}`).join("\n")}`
          : null,
        issues.length ? `KRITIEK (los ELK punt op):\n${issues.map((i) => `- ${i}`).join("\n")}` : null,
        missingExp.length ? `ONTBREKENDE ERVARING (voeg concreet toe):\n${missingExp.map((i) => `- ${i}`).join("\n")}` : null,
        proof.block,
        categoryBlock,
        slugs.length ? `INTERNE LINKS (gebruik ALLEEN deze; behoud bestaande + voeg passend toe):\n${slugs.map((s) => `- /kennisbank/${s.slug} (${s.title})`).join("\n")}` : null,
        `MERKCONTEXT: Het bedrijf levert en beheert laadinfrastructuur voor zakelijke en vastgoedklanten (kantoren, VvE's, bedrijfspanden, parkeerterreinen): advies, installatie, beheer en facturatie van laadpunten.`,
        authorLine,
      ].filter(Boolean).join("\n\n");

      // Markeer de poging meteen (ook een mislukte telt mee voor de cap + houdt de vangnet-cron correct). In
      // FINALIZE-modus niet: dat is een losse huisstijl-pass, geen herschrijf-iteratie.
      if (!finalize) await sb.from("blog_posts").update({ revise_count: iteration }).eq("id", blogPostId);

      // EÉN herschrijf-call. Faalt de JSON, dan proberen we het in een VERSE schakel opnieuw (eigen tijdsbudget).
      let draft: ReturnType<typeof validateBlogJson> | null = null;
      const rwT0 = Date.now();
      await ev("rewrite_start", { model, prompt_chars: user.length });
      try {
        const raw0 = await anthropicMessage({ apiKey, system: BLOG_REVISE_SYSTEM, user, model, maxTokens: Math.max(12000, maxTokens), retries: 1 });
        await ev("rewrite_ok", { ms: Date.now() - rwT0, chars: raw0.length });
        draft = validateBlogJson(extractJson<any>(raw0), validSlugs, validCategorySlugs);
      } catch (e) {
        await ev("rewrite_failed", { ms: Date.now() - rwT0, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
        // FINALIZE: geen keten. Laat de post ongewijzigd en meld de fout (kan opnieuw ge-finalized worden).
        if (finalize) {
          return { status: "ok", action: "finalize_jsonfail", blog_post_id: blogPostId, reason: e instanceof Error ? e.message.slice(0, 140) : "json", ms: Date.now() - runStart };
        }
        if (iteration < MAX) {
          await sb.rpc("invoke_edge_function", { fn_name: "content-revise", body: { blog_post_id: blogPostId, iteration: iteration + 1, issues, missing_experience: missingExp, factcheck_round: factcheckRound } });
          return { status: "ok", action: "retry_json", blog_post_id: blogPostId, iteration, reason: e instanceof Error ? e.message.slice(0, 140) : "json", ms: Date.now() - runStart };
        }
        // Keteneinde zonder publicatie (JSON bleef ongeldig): omslag alsnog + melding.
        await kickCoverIfMissing();
        await notifyContentEngine(settings, {
          kind: "kept_concept",
          title: post.title,
          reason: `Herschrijven bleef ongeldige JSON opleveren na ${iteration} rondes; concept staat ter review`,
          blogPostId,
        });
        return { status: "ok", action: "kept_concept_jsonfail", blog_post_id: blogPostId, iteration, ms: Date.now() - runStart };
      }

      draft.content = applyInternalLinks(draft.content, draft.internal_link_suggestions, validSlugs);

      // AUTO-CATEGORISEREN (zelfde logica als content-autoblog): gekozen slugs + evt. nieuwe categorie; terugval op de
      // bestaande categorie van de post. In FINALIZE zorgt dit dat elke oude blog ook meteen (multi-)gecategoriseerd is.
      let catSlugs: string[] = [...draft.category_slugs];
      if (draft.suggested_category) {
        const sc = draft.suggested_category;
        const newSlug = slugify(sc.name);
        const nameLc = sc.name.trim().toLowerCase();
        const dupSlug = newSlug && validCategorySlugs.has(newSlug);
        const dupName = taxonomy.some((c) => c.name.trim().toLowerCase() === nameLc);
        if (dupSlug || dupName) {
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
          }
        }
      }
      // Terugval: houd de bestaande categorie van de post aan als het model niets bruikbaars koos.
      if (catSlugs.length === 0) {
        const existing = Array.isArray(post.category_slugs) ? (post.category_slugs as string[]).filter((s) => validCategorySlugs.has(s)) : [];
        if (existing.length) catSlugs = existing;
        else if (post.category_slug && validCategorySlugs.has(post.category_slug)) catSlugs = [post.category_slug];
        else if (post.category) {
          const s = slugify(post.category);
          if (validCategorySlugs.has(s)) catSlugs = [s];
        }
      }
      catSlugs = [...new Set(catSlugs)].slice(0, 3);
      const primarySlug = catSlugs[0] ?? post.category_slug ?? null;
      const primaryName = primarySlug ? (slugToName.get(primarySlug) ?? post.category ?? null) : (post.category ?? null);
      const categoryUpdate = catSlugs.length
        ? { category_slugs: catSlugs, category_slug: primarySlug, category: primaryName }
        : {};

      // Verbeterde versie opslaan (slug blijft; categorie wordt (her)berekend). Bronnen: de nieuwe set van het
      // model, of de bestaande als het model er geen teruggaf (bronnen mogen nooit stilletjes verdwijnen).
      await sb.from("blog_posts").update({
        title: draft.title, content: draft.content, excerpt: draft.excerpt,
        seo_title: draft.seo_title, seo_description: draft.seo_description,
        tags: draft.tags, faq: draft.faq, meta_variants: draft.meta_variants,
        internal_link_suggestions: draft.internal_link_suggestions,
        sources: draft.sources.length ? draft.sources : bestaandeBronnen,
        ...categoryUpdate,
      }).eq("id", blogPostId);

      // FINALIZE: klaar. Geen her-audit, geen keten, geen publish-flip. Status + slug + published_at blijven; de
      // content-update triggert de site-rebuild.
      if (finalize) {
        await ev("finalized", { ms: Date.now() - runStart });
        return { status: "ok", action: "finalized", blog_post_id: blogPostId, slug: post.slug, category_slugs: catSlugs, ms: Date.now() - runStart };
      }

      // ── 2) HER-AUDIT (Haiku) ──
      let audit;
      try {
        const faqTekst = draft.faq.map((f) => `V: ${f.question}\nA: ${f.answer}`).join("\n");
        const auditUser = `ZOEKVRAAG: ${zoekvraag}\n\nTITEL: ${draft.title}\n\nBLOG (HTML):\n${draft.content}${faqTekst ? `\n\nFAQ (apart veld):\n${faqTekst}` : ""}`;
        const auditRaw = await anthropicMessage({ apiKey, system: BLOG_AUDIT_SYSTEM, user: auditUser, model: auditModel, maxTokens: 1500 });
        audit = validateAuditJson(extractJson<any>(auditRaw));
      } catch {
        audit = { seo_score: draft.seo_score, aeo_score: draft.aeo_score, quality_score: draft.quality_score, has_information_gain: false, has_first_hand_signal: false, issues: [], missing_experience: [], verdict: "revise" as const };
      }
      await ev("audit_done", { q: audit.quality_score, seo: audit.seo_score, aeo: audit.aeo_score, verdict: audit.verdict });
      // Auditor-scores gezaghebbend op de post + het onderwerp.
      await sb.from("blog_posts").update({ seo_score: audit.seo_score, aeo_score: audit.aeo_score, quality_score: audit.quality_score }).eq("id", blogPostId);
      if (post.source_topic_id) await sb.from("content_topics").update({ quality_score: audit.quality_score }).eq("id", post.source_topic_id);

      const q = audit.quality_score, seo = audit.seo_score, aeo = audit.aeo_score;
      const scored = q !== null && seo !== null && aeo !== null;
      // Publiceer-lat op de (kwantitatieve) auditor-scores + information gain. GEEN harde verdict-eis: het holistische
      // 'verdict' van de kleine auditor is te ruis-gevoelig en zei bijna nooit 'publish', waardoor niets live ging.
      const passesHigh = scored && audit.has_information_gain
        && (q as number) >= TARGET_Q && (seo as number) >= TARGET_SA && (aeo as number) >= TARGET_SA;

      // De kwaliteit is op orde → door naar de laatste poort: de feitencontrole. Die publiceert
      // (of bounct terug met feitencorrecties). Publiceren gebeurt nergens anders meer.
      const naarFactcheck = async (reason: string) => {
        await sb.rpc("invoke_edge_function", {
          fn_name: "content-factcheck",
          body: { blog_post_id: blogPostId, iteration, factcheck_round: factcheckRound },
        });
        await ev("handoff_factcheck", { reason, factcheck_round: factcheckRound });
        return { status: "ok", action: "factchecking", reason, blog_post_id: blogPostId, iteration, factcheck_round: factcheckRound, scores: { q, seo, aeo }, ms: Date.now() - runStart };
      };

      if (passesHigh) return await naarFactcheck("high_bar");

      if (iteration < MAX) {
        // Nog niet goed genoeg → volgende schakel met de VERSE kritiek (async, eigen tijdsbudget).
        await sb.rpc("invoke_edge_function", {
          fn_name: "content-revise",
          body: { blog_post_id: blogPostId, iteration: iteration + 1, issues: audit.issues, missing_experience: audit.missing_experience, factcheck_round: factcheckRound },
        });
        await ev("handoff_revise", { next: iteration + 1 });
        return { status: "ok", action: "revising", blog_post_id: blogPostId, iteration, next: iteration + 1, scores: { q, seo, aeo }, verdict: audit.verdict, ms: Date.now() - runStart };
      }

      // MAX bereikt: de best-mogelijke versie boven de vloer gaat óók langs de feitencontrole.
      if (scored && (q as number) >= FLOOR) return await naarFactcheck("floor_after_max");
      // Keteneinde zonder publicatie: omslag alsnog genereren + melding sturen.
      await kickCoverIfMissing();
      await notifyContentEngine(settings, {
        kind: "kept_concept",
        title: draft.title ?? post.title,
        scores: { quality: q, seo, aeo },
        reason: `Kwaliteit onder de vloer (${FLOOR}) na ${iteration} revisierondes`,
        blogPostId,
      });
      await ev("kept_concept", { q, seo, aeo });
      return { status: "ok", action: "kept_concept", blog_post_id: blogPostId, iteration, scores: { q, seo, aeo }, verdict: audit.verdict, ms: Date.now() - runStart };
    };

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(
        run().catch(async (err) => {
          await sb.from("content_engine_events").insert({ fn: "content-revise", step: "run_crashed", detail: { blog_post_id: blogPostId, iteration, finalize, error: err instanceof Error ? err.message.slice(0, 300) : "onbekende fout" } }).then(undefined, () => {});
          console.error("content-revise achtergrond-run faalde:", err instanceof Error ? err.message : err);
          if (!finalize) {
            await notifyContentEngine(settings, {
              kind: "run_failed",
              title: post.title,
              reason: `Herschrijf-iteratie ${iteration} gecrasht: ${err instanceof Error ? err.message : "onbekende fout"}`,
              blogPostId,
            }).catch(() => {});
          }
        }),
      );
      return json({ status: "started", blog_post_id: blogPostId, iteration, finalize });
    }
    // Fallback zonder waitUntil (lokaal draaien): synchroon, zoals voorheen.
    return json(await run());
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Herschrijven mislukt" }, 500);
  }
});
