/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson } from "../_shared/anthropic.ts";
import { FACTCHECK_SYSTEM, factcheckIssues, validateFactcheckJson } from "../_shared/factcheck.ts";
import { validateSources, type BlogSource } from "../_shared/blog.ts";
import { notifyContentEngine } from "../_shared/content-notify.ts";

// content-factcheck: de laatste poort vóór publicatie. Elke blog die de kwaliteitsketen
// wil publiceren komt HIER langs; deze functie is de enige plek die status op
// "gepubliceerd" zet. Een onafhankelijke Claude-call mét web-search verifieert cijfers,
// bronnen, data en juridische claims:
//   PASS                        → publiceren (+rapport in blog_posts.factcheck)
//   FAIL, factcheck_round < 2   → terug naar content-revise met concrete correcties
//   FAIL, terminaal             → concept + rapport-mail naar het notificatie-adres
// Body: { blog_post_id, factcheck_round?, iteration?, backfill? }
//   backfill=true: alleen rapporteren + bronnen aanvullen, NOOIT status wijzigen
//   (voor bestaande, al gepubliceerde blogs). Mail alleen bij critical-punten.
// Aangeroepen door content-autoblog/content-revise via invoke_edge_function
// (x-internal-secret) of door een beheerder. verify_jwt = false.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_FACTCHECK_ROUNDS = 2;

Deno.serve(async (req) => {
  const runStart = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true, allowMarketing: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as any));
    const blogPostId = typeof body.blog_post_id === "string" ? body.blog_post_id : "";
    if (!blogPostId) return json({ status: "error", message: "blog_post_id ontbreekt" }, 400);
    const factcheckRound = Number.isFinite(body.factcheck_round) ? Math.max(1, Math.floor(Number(body.factcheck_round))) : 1;
    const iteration = Number.isFinite(body.iteration) ? Math.max(1, Math.floor(Number(body.iteration))) : 1;
    const backfill = body.backfill === true;
    // Slot-garantie: alleen aanwezig als de keten uit een autoblog-run komt (zie content-revise).
    const slotRetry = Number.isFinite(body.slot_retry) ? Math.max(0, Math.floor(Number(body.slot_retry))) : null;

    const { data: post } = await sb.from("blog_posts")
      .select("id, slug, title, content, faq, sources, status, source_topic_id, cover_image_url")
      .eq("id", blogPostId).maybeSingle();
    if (!post) return json({ status: "not_found", message: "Post niet gevonden" });
    // Idempotent: al gepubliceerd en geen backfill → klaar (parallelle schakel was eerder).
    if (!backfill && post.status === "gepubliceerd") return json({ status: "already_published", blog_post_id: blogPostId });

    const { data: settingsRow } = await sb.from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const model = typeof settings.factcheck_model === "string" ? settings.factcheck_model : "claude-sonnet-5";

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) return json({ status: "no_key", message: "ANTHROPIC_API_KEY ontbreekt" });

    // De check zelf duurt minuten (web-search). Antwoord meteen; de run maakt zichzelf
    // af in de achtergrond — de aanroeper (pg_net) verbreekt toch na 5s.
    // Breadcrumbs in content_engine_events: een gestorven isolate laat zo tóch een spoor na.
    const ev = async (step: string, detail: Record<string, unknown> = {}) => {
      try { await sb.from("content_engine_events").insert({ fn: "content-factcheck", step, detail: { blog_post_id: blogPostId, round: factcheckRound, backfill, ...detail } }); } catch { /* nooit blokkeren */ }
    };

    const run = async () => {
      await ev("run_start");
      const vandaag = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
      const bronnen = validateSources(post.sources);
      const faqTekst = (Array.isArray(post.faq) ? post.faq : [])
        .map((f: any) => `V: ${f.question}\nA: ${f.answer}`).join("\n");
      const user = [
        `DATUM VAN VANDAAG: ${vandaag}`,
        `TITEL: ${post.title}`,
        `CONTENT (HTML):\n${post.content ?? ""}`,
        faqTekst ? `FAQ:\n${faqTekst}` : null,
        bronnen.length
          ? `OPGEGEVEN BRONNEN:\n${bronnen.map((s) => `- ${s.name}: ${s.url}`).join("\n")}`
          : "OPGEGEVEN BRONNEN: geen (controleer de bronvermeldingen in de tekst en lever gevonden urls aan in verified_sources)",
      ].filter(Boolean).join("\n\n");

      const fcT0 = Date.now();
      await ev("check_start", { model });
      const raw = await anthropicMessage({
        apiKey, system: FACTCHECK_SYSTEM, user, model, maxTokens: 8000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        retries: 1,
      });
      const report = validateFactcheckJson(extractJson<any>(raw));
      await ev("check_ok", { ms: Date.now() - fcT0, verdict: report.verdict, critical: report.critical_count });

      // Rapport altijd vastleggen + geverifieerde bronnen mergen (dedup op url).
      const bestaandeUrls = new Set(bronnen.map((s) => s.url));
      const nieuweBronnen: BlogSource[] = report.verified_sources.filter((s) => !bestaandeUrls.has(s.url));
      const sources = [...bronnen, ...nieuweBronnen].slice(0, 12);
      await sb.from("blog_posts").update({
        factcheck: { ...report, round: factcheckRound, model, checked_at: new Date().toISOString() },
        factchecked_at: new Date().toISOString(),
        sources,
      }).eq("id", blogPostId);

      if (backfill) {
        // Bestaande (gepubliceerde) blog: nooit de status aanraken; wel waarschuwen bij echte fouten.
        if (report.critical_count > 0) {
          await notifyContentEngine(settings, {
            kind: "run_failed",
            title: post.title,
            reason: `Feitencontrole van een REEDS GEPUBLICEERDE blog vond ${report.critical_count} kritiek punt(en)`,
            details: factcheckIssues(report),
            blogPostId,
          }).catch(() => {});
        }
        return { status: "ok", action: "backfill", verdict: report.verdict, critical: report.critical_count, sources: sources.length };
      }

      if (report.verdict === "pass") {
        await sb.from("blog_posts").update({
          status: "gepubliceerd", published_at: new Date().toISOString(), review_state: "approved",
        }).eq("id", blogPostId);
        if (post.source_topic_id) await sb.from("content_topics").update({ status: "published" }).eq("id", post.source_topic_id);
        if (!post.cover_image_url) {
          await sb.rpc("invoke_edge_function", { fn_name: "blog-cover", body: { blog_post_id: blogPostId } }).catch(() => {});
        }
        await ev("published");
        return { status: "ok", action: "published", critical: 0, ms: Date.now() - runStart };
      }

      if (factcheckRound < MAX_FACTCHECK_ROUNDS) {
        // Corrigeerbaar: terug de herschrijf-keten in, met de feitenfouten als verplichte punten.
        await sb.rpc("invoke_edge_function", {
          fn_name: "content-revise",
          body: {
            blog_post_id: blogPostId,
            iteration,
            issues: factcheckIssues(report),
            factcheck_round: factcheckRound + 1,
            ...(slotRetry !== null ? { slot_retry: slotRetry } : {}),
          },
        });
        await ev("bounce_to_revise", { critical: report.critical_count });
        return { status: "ok", action: "revising_facts", round: factcheckRound, critical: report.critical_count };
      }

      // Terminaal: niet publiceren, mens waarschuwen met het volledige rapport. Slot-garantie:
      // uit een autoblog-run proberen we (max 2×) automatisch een volgend onderwerp voor dit slot;
      // het gefaalde onderwerp is via zijn blog_post_id al uitgesloten van de selectie.
      await sb.from("blog_posts").update({ review_state: "changes_requested" }).eq("id", blogPostId);
      let slotRetrying = false;
      if (slotRetry !== null && slotRetry < 2) {
        try {
          await sb.rpc("invoke_edge_function", { fn_name: "content-autoblog", body: { slot_retry: slotRetry + 1 } });
          await ev("slot_retry_next_topic", { next: slotRetry + 1 });
          slotRetrying = true;
        } catch { /* best-effort */ }
      }
      await notifyContentEngine(settings, {
        kind: "kept_concept",
        title: post.title,
        reason: `Feitencontrole blokkeert publicatie na ${factcheckRound} ronde(s): ${report.critical_count} kritiek punt(en)${slotRetrying ? " — de machine pakt automatisch een volgend onderwerp voor dit slot" : ""}`,
        details: factcheckIssues(report),
        blogPostId,
      }).catch(() => {});
      await ev("blocked_terminal", { critical: report.critical_count, slot_retrying: slotRetrying });
      return { status: "ok", action: "blocked_by_factcheck", critical: report.critical_count, slot_retrying: slotRetrying };
    };

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(
        run().catch(async (err) => {
          console.error("content-factcheck faalde:", err instanceof Error ? err.message : err);
          await sb.from("content_engine_events").insert({ fn: "content-factcheck", step: "run_crashed", detail: { blog_post_id: blogPostId, round: factcheckRound, error: err instanceof Error ? err.message.slice(0, 300) : "onbekende fout" } }).then(undefined, () => {});
          // Een gecrashte check mag een blog niet stil laten hangen: melden.
          await notifyContentEngine(settings, {
            kind: "run_failed",
            title: post.title,
            reason: `Feitencontrole gecrasht: ${err instanceof Error ? err.message : "onbekende fout"}`,
            blogPostId,
          }).catch(() => {});
        }),
      );
      return json({ status: "started", blog_post_id: blogPostId, round: factcheckRound, backfill });
    }
    return json(await run());
  } catch (err) {
    console.error("content-factcheck error:", err instanceof Error ? err.message : err);
    return json({ status: "error", message: err instanceof Error ? err.message : "Feitencontrole mislukt" }, 500);
  }
});
