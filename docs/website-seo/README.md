# SEO-verbeterpunten www.e-charging.nl (audit 2026-07-14)

**Voor de websitebouwer.** Volledige technische audit van de publieke site uitgevoerd; de basis is
gezond — alles is server-side gerenderd (geen JS-shell), robots.txt en sitemap kloppen, metadata en
canonicals staan goed, de IndexNow-keyfile werkt. Het trage indexeren is Google-zijdig (jong domein);
onderstaande punten versnellen het en zijn de enige echte technische gaten.

## 1. Apex-redirect verliest het pad (belangrijkste fix)

`https://e-charging.nl/kennisbank/<slug>` doet nu een 301 naar de **homepage** in plaats van naar
`https://www.e-charging.nl/kennisbank/<slug>`. Elke externe link of share zonder `www.` lekt daardoor
naar de homepage en het artikel krijgt de linkwaarde niet.

**Fix:** redirect pad-behoudend maken: `https://e-charging.nl/*` → 301 → `https://www.e-charging.nl/*`
(zelfde pad + querystring). De http→https-varianten doen dit al goed; alleen apex-https gaat mis.

## 2. Article/BlogPosting structured data ontbreekt

Artikelpagina's hebben alleen `Organization`- en `WebSite`-JSON-LD. Voeg per artikel een
`BlogPosting`-blok toe (versheids-signaal + kans op rich results):

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "<artikeltitel>",
  "datePublished": "<published_time>",
  "dateModified": "<updated_time>",
  "author": { "@type": "Organization", "name": "E-Charging" },
  "publisher": { "@type": "Organization", "name": "E-Charging", "logo": { "@type": "ImageObject", "url": "https://www.e-charging.nl/brand/echarging-logo.svg" } },
  "image": "<cover-url>",
  "mainEntityOfPage": "<canonical-url>"
}
```

## 3. Titels worden midden in de zin afgekapt

De title-template kapt op een tekenlimiet: `<title>Laadpalen voor VvE's: mogelijkheden, wetgeving en | E-Charging</title>`.
Dat oogt onaf in Google. **Fix:** afkappen op woordgrens met "…", of de SEO-titel (die is al apart
beschikbaar per artikel) ongewijzigd doorgeven en alleen het suffix ` | E-Charging` toevoegen.

## 4. Meer interne deeplinks naar artikelen

- `/zakelijk` en `/particulier` linken alleen naar het kennisbank-overzicht, nooit naar individuele
  artikelen. Voeg per pagina 2–3 contextueel relevante artikelkaarten toe.
- Het homepage-blok "Uit de kennisbank" toont er 3 — laat die roteren/de nieuwste tonen zodat verse
  artikelen dichter bij de homepage staan.

## Klein (mag)

- `og:image` staat op het Supabase-domein; on-domain (www.e-charging.nl) is één afhankelijkheid minder.

## Wat al automatisch loopt (niets voor nodig)

Vanuit het dashboard-systeem: dagelijkse Search Console-ophaal, wekelijkse indexstatus-check +
sitemap-herindiening bij Google (ma 06:30), wekelijkse IndexNow-aanmelding van alle URLs (ma 07:00),
en een IndexNow-ping direct bij elke blogpublicatie.
