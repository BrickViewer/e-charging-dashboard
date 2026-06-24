# Distributie — één bron, meerdere kanalen

Bij publiceren van een blog vult de trigger `tg_blog_enqueue_distributions` één `content_distributions`-rij
(`status='pending'`) per **ingeschakeld** kanaal (`content_engine_settings.channels`). Daarna drainen
kanaal-workers die wachtrij. Zo distribueert één bron (de blog) naar meerdere kanalen met minimale handelingen.

Kanalen staan default **uit**. Aanzetten in het Content-werkblad → Instellingen, of in
`content_engine_settings.settings.channels`.

## Nieuwsbrief (edge `content-distribute`, Resend) — gebouwd
- Drukt pending `channel='newsletter'`-rijen af: rendert een mail (titel + excerpt + link naar
  `https://e-charging.nl/kennisbank/<slug>`) en stuurt via `_shared/email.ts` (Resend) naar
  `content_engine_settings.settings.newsletter_recipients` (array e-mailadressen).
- No-op zonder pending of zonder ontvangers. Markeert rijen `sent`/`failed`/`skipped` + `external_id` (Resend-id).
- **Aanzetten:** `channels.newsletter=true` + `newsletter_recipients` invullen. Cron bij go-live:
  `select public.invoke_edge_function('content-distribute','{}'::jsonb);` (bv. elk uur).
- **Later:** een echte abonnees-tabel i.p.v. een vaste lijst (nu een input voor go-live).

## LinkedIn (Hey_Reach MCP) — agent-gedreven routine
LinkedIn loopt via de Hey_Reach-MCP (geen server-secret/REST), dus via een Claude-routine, niet een edge:
1. Lees pending `channel='linkedin'`-rijen (`content_distributions`).
2. Render per blog een post (hergebruik de `linkedin-content-generator`-skill; hook + waarde + link).
3. Maak/start een campagne via Hey_Reach (`create_campaign` → `add_leads_to_campaign` → `start_campaign`),
   of plaats de post volgens de gekozen Hey_Reach-flow.
4. Schrijf terug: `status='sent'`, `external_id=<campagne-id>`.

De edge `content-distribute` laat `linkedin`-rijen bewust op `pending` staan (de routine pakt ze op).

## Penalty-/spam-veiligheid
- Distributie gebeurt pas **na** menselijke publicatie-goedkeuring van de blog.
- Geen dubbele enqueue (trigger-guard op bestaande rij per kanaal).
- Kanalen + ontvangers expliciet instelbaar; alles default uit.
