/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { getAnthropicKey, anthropicMessage, extractJson } from "../_shared/anthropic.ts";

// Content-discovery: haalt RSS/nieuws-feeds + concurrent-sitemaps op en zet nieuwe,
// nieuwe (niet-uitgemolken) onderwerpen in content_topics via de RPC content_ingest_source
// (dedup + noviteit in SQL), en scoort de pool daarna op BRAND FIT (laag 1 van de branche-
// poort: een goedkope Haiku-batchcall; onder de drempel → status 'rejected'). No-op zolang
// settings.discovery_enabled=false (tenzij {force:true}).
// Cron-baar via invoke_edge_function (internal-secret). Schrijft NOOIT auto naar gepubliceerd.

// Strikte rubric: de doelgroep van e-Charging is gebouwgebonden laadinfrastructuur. Op 15 juli
// won "heavy duty laadplein" de selectie en op 13 juli een Bentley-persbericht — precies wat
// deze poort tegenhoudt vóórdat er ook maar één dure schrijf-call draait.
const BRAND_FIT_SYSTEM = `Je beoordeelt blogonderwerp-kandidaten voor een Nederlands B2B-bedrijf in laadinfrastructuur (advies, installatie, beheer en facturatie van laadpunten). Beoordeel per kandidaat hoe goed het onderwerp past bij de DOELGROEP.

DOELGROEP (past WEL): VvE's en appartementencomplexen; kantoren en bedrijfspanden; vastgoedeigenaren en verhuurders; parkeerterreinen; plus netcongestie, subsidies, wet- en regelgeving en kosten/terugverdientijd in zo'n gebouwgebonden laadcontext in Nederland.

PAST NIET (score 0.0-0.3): zwaar transport en logistiek (laadpleinen voor vrachtwagens, heavy duty); publieke snellaadcorridors en laden onderweg; autonieuws, EV-modellen en productlanceringen; consumenten-autotests; laadpassen voor particulieren onderweg; algemene duurzaamheid zonder directe laadinfrastructuur-hoek (zonnepanelen, warmtepompen, ESG).

Scoor: 1.0 = kern van de doelgroep; ~0.5 = alleen met een duidelijke herkadering relevant; 0.0-0.3 = buiten de branche. Geef per kandidaat één korte zin als reden.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder tekst eromheen:
{"scores": [{"i": number, "fit": number, "reason": string}]}`;

const cors = CORS_INTERNAL;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "e-charging-content-discovery/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/gi, "'").replace(/&nbsp;/g, " ")
    .trim();
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

function parseDate(s: string): Date | null {
  const raw = stripTags(s).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function parseRss(xml: string): Array<{ title: string; link: string; summary: string; published: Date | null }> {
  const items: Array<{ title: string; link: string; summary: string; published: Date | null }> = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = stripTags(tag(b, "title"));
    let link = stripTags(tag(b, "link"));
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      if (m) link = m[1];
    }
    const summary = stripTags(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded")).slice(0, 500);
    const published = parseDate(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    if (title) items.push({ title, link, summary, published });
  }
  return items;
}

function parseSitemap(xml: string): string[] {
  const urls: string[] = [];
  for (const b of xml.match(/<url[\s\S]*?<\/url>/gi) || []) {
    const loc = stripTags(tag(b, "loc"));
    if (loc) urls.push(loc);
  }
  return urls;
}

function titleFromUrl(u: string): string {
  try {
    const seg = new URL(u).pathname.replace(/\/$/, "").split("/").pop() || "";
    return decodeURIComponent(seg).replace(/\.\w+$/, "").replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors);
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch (_) { /* leeg body OK */ }
    const force = body.force === true;

    const { data: settingsRow } = await sb
      .from("content_engine_settings").select("id, settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    if (!settings.discovery_enabled && !force) {
      return json({ status: "disabled", message: "discovery_enabled=false" });
    }

    const feeds: Array<{ url: string; name?: string }> = Array.isArray(settings.feeds) ? settings.feeds : [];
    const competitors: Array<{ url?: string; sitemap?: string; name?: string }> = Array.isArray(settings.competitors) ? settings.competitors : [];
    const threshold = typeof settings.novelty_threshold === "number" ? settings.novelty_threshold : 0.5;

    let fetched = 0, created = 0, skipped = 0, errors = 0;
    const ingest = async (sourceType: string, sourceUrl: string | null, sourceName: string | null, title: string, summary: string | null, publishedAt: string | null) => {
      fetched++;
      const { data, error } = await sb.rpc("content_ingest_source", {
        p_source_type: sourceType, p_source_url: sourceUrl, p_source_name: sourceName,
        p_title: title, p_summary: summary, p_novelty_threshold: threshold, p_published_at: publishedAt,
      });
      if (error) { errors++; return; }
      if (data) created++; else skipped++;
    };

    // Alleen nieuws van de afgelopen 2 weken; items zonder geldige datum of ouder dan dat slaan we over.
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const f of feeds) {
      try {
        const xml = await fetchText(f.url);
        for (const it of parseRss(xml)) {
          if (!it.published || it.published.getTime() < cutoff) { skipped++; continue; }
          await ingest("rss", it.link || f.url, f.name ?? null, it.title, it.summary, it.published.toISOString());
        }
      } catch (_) { errors++; }
    }
    for (const c of competitors) {
      const url = c.sitemap || c.url;
      if (!url) continue;
      try {
        const xml = await fetchText(url);
        for (const loc of parseSitemap(xml).slice(0, 200)) {
          const title = titleFromUrl(loc);
          if (title.length >= 8) await ingest("competitor", loc, c.name ?? null, title, null, null);
        }
      } catch (_) { errors++; }
    }

    // Koppel de nieuwe onderwerpen aan de zoekvragen van de doelgroep (Laag B; gratis, in SQL).
    await sb.rpc("content_match_topics_to_keywords", {});

    // BRAND-FIT-POORT (laag 1): score ongescoorde open onderwerpen in batches van ~25 met één
    // goedkope Haiku-call per batch. Onder de drempel → status 'rejected' (valt daarmee uit de
    // selectie, de brief-flow én het noviteits-corpus). Nieuwste eerst: de batch van vandaag gaat
    // altijd voor; de rest van de pool wordt achterstevoren bijgewerkt (backfill = zelfde codepad).
    // Volledig best-effort: zonder sleutel of bij een mislukte batch blijft brand_fit NULL en
    // herstelt een volgende run het. Handmatig toegevoegde onderwerpen worden nooit auto-afgekeurd.
    let scoredCount = 0, rejectedCount = 0;
    try {
      const apiKey = await getAnthropicKey(sb);
      if (apiKey) {
        const fitThreshold = typeof settings.brand_fit_threshold === "number" ? settings.brand_fit_threshold : 0.4;
        const scoreModel = typeof settings.audit_model === "string" ? settings.audit_model : "claude-haiku-4-5-20251001";
        const { data: unscored } = await sb.from("content_topics")
          .select("id, raw_title, raw_summary, source_name, generated_by, created_by")
          .in("status", ["idea", "approved_for_draft"]).is("blog_post_id", null).is("brand_fit", null)
          .order("created_at", { ascending: false }).limit(120);
        const pool = (unscored ?? []) as any[];
        for (let i = 0; i < pool.length; i += 25) {
          // Tijdbudget-guard: de feeds hierboven kunnen al ~1 min gekost hebben en de edge heeft
          // een harde wandklok. De rest van de pool schuift gewoon naar de volgende run.
          if (Date.now() - t0 > 100_000) break;
          const batch = pool.slice(i, i + 25);
          const user = batch.map((t, j) =>
            `${j}. ${String(t.raw_title ?? "").slice(0, 160)}${t.raw_summary ? ` — ${String(t.raw_summary).slice(0, 200)}` : ""} (bron: ${t.source_name ?? "onbekend"})`,
          ).join("\n");
          let parsed: any;
          try {
            parsed = extractJson<any>(await anthropicMessage({ apiKey, system: BRAND_FIT_SYSTEM, user, model: scoreModel, maxTokens: 4000, retries: 1 }));
          } catch { continue; }
          for (const s of (Array.isArray(parsed?.scores) ? parsed.scores : [])) {
            const t = batch[Number(s?.i)];
            const fit = Number(s?.fit);
            if (!t || !Number.isFinite(fit)) continue;
            const clamped = Math.max(0, Math.min(1, fit));
            const reason = typeof s?.reason === "string" && s.reason.trim() ? s.reason.trim().slice(0, 300) : null;
            const isHuman = t.generated_by === "human" || !!t.created_by;
            const reject = clamped < fitThreshold && !isHuman;
            const { error: updErr } = await sb.from("content_topics").update({
              brand_fit: clamped,
              brand_fit_reason: reason,
              ...(reject ? { status: "rejected", rejected_reason: `Buiten de branche (fit ${clamped.toFixed(2)}): ${reason ?? "past niet bij de doelgroep"}`.slice(0, 300) } : {}),
            }).eq("id", t.id);
            if (updErr) continue;
            scoredCount++;
            if (reject) rejectedCount++;
          }
        }
        if (scoredCount > 0) {
          await sb.from("content_engine_events")
            .insert({ fn: "content-discovery", step: "brand_fit_scored", detail: { scored: scoredCount, rejected: rejectedCount, remaining: Math.max(0, pool.length - scoredCount) } })
            .then(undefined, () => {});
        }
      }
    } catch { /* scoring is best-effort; ingest is al gelukt */ }

    // Leg het tijdstip van deze run vast zodat de UI "Laatst opgehaald" kan tonen (ook bij 0 nieuwe).
    if (settingsRow?.id) {
      await sb.from("content_engine_settings")
        .update({ settings: { ...settings, last_discovery_at: new Date().toISOString() } })
        .eq("id", settingsRow.id);
    }

    return json({ status: "ok", fetched, created, skipped, errors, brand_fit_scored: scoredCount, brand_fit_rejected: rejectedCount, feeds: feeds.length, competitors: competitors.length });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
