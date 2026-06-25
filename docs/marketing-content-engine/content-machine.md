# Contentmachine (Marketing-tab) — overzicht + benodigde integraties

De "contentmachine" uit het marketingplan is gebouwd **bovenop de bestaande content-engine** (niets
gesloopt). De blogs-module (handmatig blogs maken/publiceren) is ongemoeid en blijft de enige bron van
waarheid voor gepubliceerde blogs.

## Onderdelen en waar ze leven
| Plan-onderdeel | Waar |
|---|---|
| Onderwerpen-inbox (team-quick-add, open/besproken) | `content_topics.discussed_at` + sectie in `pages/marketing/ContentPipeline.tsx`; hooks in `hooks/useContentPipeline.ts` |
| AI-nieuwsagent (RSS/sitemap-scan + briefing) | edge `content-discovery` + `content_seen_sources`; bronnen in `content_engine_settings.settings`; "Nieuwsbriefing"-sectie + bronnen-suggesties in `components/marketing/ContentSettingsSheet.tsx` |
| Opname-naar-blog (transcript → concept) | tabel `content_recordings` + edge `recording-to-blog` + "Opname naar blog"-sectie in ContentPipeline |
| Publicatieflow (concept → blogs-module → nieuwsbrief/LinkedIn) | RPC `content_ingest_draft` → `blog_posts` (concept) → handmatig publiceren in de blogs-editor → trigger `tg_blog_enqueue_distributions` → edge `content-distribute` |

Rollen/RLS: alle content_*-tabellen en `content_recordings` = **admin / manager / marketing**; anon heeft niets.

## Integraties die nog keys/wiring nodig hebben
- **Transcriptie (audio → tekst)** — NU: transcript plakken werkt. LATER: audio-upload + automatische
  transcriptie. Stub: `transcribeRecording()` in `supabase/functions/recording-to-blog/index.ts`; te wiren
  met secret **`TRANSCRIPTION_API_KEY`** (nog niet gezet) + een storage-bucket voor audio.
- **Conceptgeneratie uit transcript** — NU: deterministische stub `generateBlogDraftFromTranscript()` (zet
  het transcript om in een ruw concept). LATER: de echte LLM/skill-chain (dezelfde die via
  `content_ingest_draft` de seo-aeo-routine draait). Geen client-secret; de generatie draait server-side/agent.
- **AI-nieuwsagent — vertrouwde bronnen** — RSS/sitemap-scan werkt. De vertrouwde-bronnen-startlijst staat als
  quick-add in Instellingen; **vul per bron de exacte RSS/sitemap-URL in** voordat je "Ontdekking aan" zet.
  "Broader-web/LLM-research" (vrij internet afzoeken) is nog een stub/idee — alleen RSS/sitemap is live.
- **Nieuwsbrief** — werkt via Resend; secret **`RESEND_API_KEY`** is al geconfigureerd. Ontvangers staan in
  `content_engine_settings.settings.newsletter_recipients`.
- **LinkedIn (zakelijk)** — agent-gedreven via Hey_Reach (MCP), geen REST-key in de edge; de
  `content-distribute`-edge laat LinkedIn-rijen op `pending` staan voor de routine.

## Kill-switches
`content_engine_settings.settings.discovery_enabled` / `generation_enabled` (UI: Instellingen). Concepten
gaan **nooit** automatisch live — publiceren is altijd handmatig in de blogs-module.
