# Generatie-routine — skill-gedreven blog-concepten

De generatie-engine is **geen server-code**: het is een Claude-routine (handmatig, of bij go-live een
geplande cloud-agent) die per goedgekeurd onderwerp de `seo-aeo-*`-skillketen draait en het resultaat
wegschrijft als **concept** via de RPC `content_ingest_draft`. Concepten worden **nooit automatisch
gepubliceerd** — een mens keurt elke blog goed in het Content-werkblad (`/marketing/content`).

## Wanneer draaien
- **Handmatig (nu):** draai de routine op één `content_topics`-rij met `status='approved_for_draft'`.
- **Go-live (Fase 5):** zet `content_engine_settings.generation_enabled=true` en plan de routine
  (geplande cloud-agent / routine). Cadans bv. dagelijks of wekelijks.

## Input
Onderwerpen met `status='approved_for_draft'` (door een mens goedgekeurd op het bord).
Velden: `raw_title`, `raw_summary` (invalshoek), `target_keyword`, `assigned_category`.

## Skillketen (per onderwerp, in deze volgorde)
1. `seo-aeo-keyword-research` — keyword + AEO-vraagvarianten (heuristisch; geen DataForSEO).
2. `seo-aeo-content-cluster` — plaats in pillar/cluster; bepaal interne-link-doelen.
3. `seo-aeo-blog-writer` — long-form concept: TL;DR, definitie-zin, vergelijkingstabel, 5-vraag-FAQ.
4. `seo-authority-builder` — **E-E-A-T + eigen e-charging-data injecteren** (echte ERE-/tarief-/
   rendementscijfers van het platform, klantcontext). Dít is de originaliteit-moat — geen generieke AI-tekst.
5. `seo-keyword-strategist` — dichtheid/LSI, anti-over-optimalisatie.
6. `seo-aeo-content-quality-auditor` — **kwaliteitsscore** (seo_score + fixlijst).
7. `ai-seo` / `seo-geo` — **AEO-score** + AI-citatie-checklist.
8. `seo-snippet-hunter` — featured-snippet-opmaak.
9. `seo-aeo-internal-linking` — `internal_link_suggestions` (+ kannibalisatie-check vs bestaande blogs).
10. `seo-aeo-meta-description-generator` — 3 titel- + 3 omschrijving-varianten → `meta_variants`.
11. `seo-aeo-schema-generator` — valideer dat het schema matcht met wat `blog-public` al uitstuurt
    (`BlogPosting` + `FAQPage`); géén schema-drift.

## Wegschrijven (de enige code-stap)
Roep de RPC aan (service-role, bv. via MCP Supabase) — die handhaaft de gate server-side, maakt een
unieke slug, berekent leestijd, zet `status='concept'` + `review_state` en koppelt het onderwerp:

```sql
select public.content_ingest_draft(
  p_topic_id => '<topic-uuid>',
  p_title => '...', p_content => '<h2>…</h2><p>…</p>', p_excerpt => '...',
  p_category => 'ERE-certificaten', p_tags => array['…'], p_faq => '[{"question":"…","answer":"…"}]'::jsonb,
  p_seo_title => '...', p_seo_description => '...',
  p_seo_score => 84, p_aeo_score => 80, p_quality_score => 82,
  p_meta_variants => '{"titles":["…","…","…"],"descriptions":["…","…","…"]}'::jsonb,
  p_internal_link_suggestions => '[{"anchor":"…","target_slug":"…","reason":"…"}]'::jsonb,
  p_generated_by => 'agent:seo-aeo-chain@v1'
);
```

De gate: ligt `quality/seo/aeo` onder de drempels in `content_engine_settings` → `review_state='changes_requested'`
(mens ziet waarom) i.p.v. `needs_review`. Nooit `gepubliceerd`.

## Daarna (mens)
Het concept verschijnt in `/marketing/content` (kolom "In review") → open het onderwerp → bekijk
concept + SEO/AEO-score + meta-varianten + interne-link-suggesties → **Goedkeuren → publiceren**
(hergebruikt de blog-publish-flow → publieke site herbouwt; en vult `content_distributions` als kanalen aan staan).

## Penalty-veiligheid (hard)
- Mens-gate = enige pad naar `gepubliceerd`.
- Originaliteit via eigen e-charging-data + eerste-hands hoek (stap 4) — geen detectie-omzeiling.
- Dedup/noviteit al bij het idee (discovery + `content_ingest_source`).
- Anti-kannibalisatie via internal-linking-stap.
- Versheid: periodiek `seo-content-refresher` op gepubliceerde blogs → maakt refresh-onderwerpen.

## Externe handoff (www.e-charging.nl SSG)
Nieuwe publieke schema-types (bv. `Person`-auteur voor E-E-A-T), `llms.txt`, sitemap-uitbreidingen
horen in de externe site-repo, niet hier.
