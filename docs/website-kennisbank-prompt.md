# Opdracht: Kennisbank/blog dynamisch maken via read-only edge-functie + maximale SEO

Je werkt in de **website-repo** (`www.e-charging.nl` — statische **Vite + React**-site). De kennisbank staat op `/kennisbank` (index) en `/kennisbank/<slug>` (detail) en is op dit moment **hardgecodeerd**. Vervang die hardgecodeerde content volledig door dynamische content uit één enkele databron: onze publieke read-only edge-functie. **Verzin geen extra databronnen en geen velden buiten het hieronder gespecificeerde contract.**

Canonieke host: **`https://e-charging.nl`** (non-www), pad `/kennisbank/<slug>`.

> **Kernpunt SEO:** een puur client-side gerenderde SPA is slecht voor crawlers. De index- en detailpagina's MOETEN bij de build worden **geprerenderd/SSG'd** (statische HTML per route, met correcte `<head>`, JSON-LD én zichtbare content in de HTML-bron). De runtime-`fetch` is enkel een **fallback** (bv. bij navigatie binnen de SPA of een net gepubliceerde post die nog niet in een build zit), niet de SEO-strategie. De acceptatietest is hard: `view-source` van een gebouwde pagina toont de volledige `<head>`, JSON-LD én zichtbare content **zonder JS uit te voeren**.

**Onderzoek eerst de repo** voordat je begint en stem je keuzes daarop af:
- Bestaat er al een prerender/SSG-mechanisme (`vite-react-ssg`, `vike`/`vite-plugin-ssr`, een eigen prerender-script, of een Netlify/Cloudflare/Vercel-buildflow)? Sluit daarop aan; voeg geen zware framework-migratie toe als een prerender-plugin volstaat.
- Welke head-manager is er (`react-helmet-async`, `@vueuse/head`, eigen)? Gebruik die; zo niet, voeg `react-helmet-async` toe en gebruik de SSG-flow uit §1.
- Welk hosting-platform draait de site (Netlify / Cloudflare Pages / Vercel / nginx)? Dat bepaalt waar je de 404- en 301-config plaatst (§5/§6). Is het onduidelijk, **vraag het** voordat je die stappen invult.
- Welke Node-versie draait de build? `fetch` is globaal vanaf Node 18; bij ouder: polyfill (`undici`).

---

## DATACONTRACT (exact overnemen — endpoints en veldnamen letterlijk)

### Endpoints (publiek, `GET`, **géén** key/Authorization nodig; CORS toegestaan voor `https://e-charging.nl`, `https://www.e-charging.nl` en `http://localhost*`)
- **Lijst:** `https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public`
- **Detail:** `https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public?slug=<slug>`

### Response-envelope
- **Lijst:** `200` → `{ "status": "ok", "posts": [ <listItem>, ... ] }` — bevat alleen `status='gepubliceerd'`, gesorteerd op `published_at` aflopend.
- **Detail:** `200` → `{ "status": "ok", "post": <detailItem> }`
- **Onbekende/ongepubliceerde slug:** `HTTP 404` → `{ "status": "not_found" }`
- **Fout:** `500` → `{ "status": "error", "message": "..." }`
- Antwoorden bevatten `Cache-Control: public, max-age=60`.

### `listItem` velden
> **Nullability:** de API geeft de ruwe DB-kolommen door en veel daarvan zijn **nullable**. Alleen `slug`, `title`, `tags`, `featured` en `updated_at` (en op detail ook `noindex`, `faq`) zijn gegarandeerd aanwezig. Alle overige velden kunnen `null`/ontbreken. Modelleer ze daarom als nullable en render **defensief** (zie §8).

| veld | type | opmerking |
|---|---|---|
| `slug` | string | URL-safe, stabiel, **altijd aanwezig** |
| `title` | string | **altijd aanwezig** |
| `excerpt` | string \| null | ~120–160 tekens |
| `category` | string \| null | label uit vaste taxonomie |
| `category_slug` | string \| null | URL-safe |
| `tags` | string[] | **altijd aanwezig** (kan leeg zijn) |
| `featured` | boolean | **altijd aanwezig** |
| `author_name` | string \| null | |
| `reading_minutes` | int \| null | |
| `published_at` | string \| null | ISO 8601 met tz |
| `updated_at` | string | ISO 8601 met tz, **altijd aanwezig** |
| `cover_image_url` | string \| null | absolute Supabase Storage URL |
| `cover_image_alt` | string \| null | |
| `cover_image_width` | int \| null | px |
| `cover_image_height` | int \| null | px |

### `detailItem` = alle `listItem`-velden PLUS:
| veld | type | opmerking |
|---|---|---|
| `content` | string \| null | gesaneerde semantische HTML (zie waarschuwing hieronder) |
| `seo_title` | string \| null | bedoeld ≤60, fallback = `title`; kan toch `null` zijn → val terug op `title` |
| `seo_description` | string \| null | bedoeld ≤155, fallback = `excerpt`; kan toch `null` zijn → val terug op `excerpt` |
| `canonical_url` | string \| null | AL opgelost door de API: opgeslagen override óf `https://e-charging.nl/kennisbank/<slug>`. Bij `null` zelf afleiden als `https://e-charging.nl/kennisbank/<slug>` |
| `noindex` | boolean | **altijd aanwezig**, default `false` |
| `faq` | `{ question: string, answer: string }[]` | **altijd aanwezig**, kan leeg zijn |
| `json_ld` | object | kant-en-klaar; zie hieronder |

**Waarschuwing over `content` (niet blind vertrouwen):** de HTML is bij het opslaan in de admin éénmalig gesaneerd met een standaard-`DOMPurify`-configuratie. Dat verwijdert `<script>`, maar dwingt **niet** af dat koppen op `<h2>` starten, dat er geen inline-`style` in zit, of dat elke `<img>` `width`/`height`/`alt` heeft. Behandel `content` dus als "redelijk gesaneerd, maar niet gehard":
- Injecteer met `dangerouslySetInnerHTML`, maar **her-saneer bij de SSG/SSR-stap** met een allowlist (goedkoop en veilig). Sta toe: `<h2>`–`<h4>`, `<p>`, `<ul>`/`<ol>`/`<li>`, `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`, `<blockquote>`, `<figure>`/`<figcaption>`, `<img>` (met `src`/`alt`/`width`/`height`), `<a>` (met `href`/`rel`/`target`), `<strong>`/`<em>`/`<code>`. Strip `<script>`, event-handlers en inline-`style`.
- **Scope je CSS** zodat een eventuele `<h1>` binnen `content` niet als pagina-titel meetelt en visueel niet de echte `<h1>` dupliceert; render zelf altijd precies één pagina-`<h1>` = `title`.

`json_ld`-vorm (kant-en-klaar door de API — **letterlijk** injecteren via `JSON.stringify(post.json_ld)`, niet zelf opbouwen, niets toevoegen of verwijderen). Onderstaand blok is **illustratief, geen letterlijk te kopiëren JSON** (let op: optionele velden kunnen ontbreken, `keywords` is een **string**):
```jsonc
// ILLUSTRATIEF — niet letterlijk kopiëren. Dit komt kant-en-klaar uit post.json_ld.
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "headline": "...",
      "description": "...",                       // kan ontbreken
      "image": { "@type": "ImageObject", "url": "...", "width": 0, "height": 0 }, // kan ontbreken
      "datePublished": "...",                      // kan ontbreken
      "dateModified": "...",
      "author": { "@type": "Organization", "name": "...", "url": "..." },
      "publisher": { "@type": "Organization", "name": "E-Charging", "url": "...",
        "logo": { "@type": "ImageObject", "url": "..." } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "<canonical_url>" },
      "articleSection": "<category>",              // kan ontbreken
      "keywords": "tag1, tag2",                     // STRING (komma-gescheiden), ontbreekt bij geen tags
      "wordCount": 0
    }
    // + { "@type": "FAQPage", "mainEntity": [ { "@type": "Question", "name": "...",
    //     "acceptedAnswer": { "@type": "Answer", "text": "..." } } ] }  ← AL aanwezig indien faq niet leeg
  ]
}
```
> `post.json_ld` bevat de `FAQPage`-tak **al** wanneer `faq` niet leeg is. De implementatie voegt niets toe en verwijdert niets — uitsluitend `JSON.stringify(post.json_ld)`. Optionele velden (`description`, `image`, `datePublished`, `articleSection`, `keywords`) kunnen ontbreken; `JSON.stringify` laat `undefined` vanzelf weg.

### Vaste categorie-taxonomie (label → `category_slug`)
| label (`category`) | `category_slug` |
|---|---|
| Opbrengsten & verdienmodellen | `opbrengsten-verdienmodellen` |
| ERE-certificaten | `ere-certificaten` |
| Laadpalen & hardware | `laadpalen-hardware` |
| Voor vastgoedeigenaren | `voor-vastgoedeigenaren` |
| Wetgeving & regelgeving | `wetgeving-regelgeving` |

Gebruik altijd het `category`-label en `category_slug` **zoals ze uit de API komen**; hardcode geen eigen vertaaltabel buiten deze taxonomie en filter er niet op. De taxonomie-volgorde hierboven gebruik je alleen voor de **volgorde van categoriegroepen** op de index (§3).

---

## 1. Prerender / SSG-strategie (cruciaal — eerst inrichten)

1. Bepaal bij de build de volledige set routes door **één keer** de lijst-endpoint te fetchen: alle `posts[].slug` → routes `/kennisbank/<slug>`, plus de index-route `/kennisbank`.
2. **Prerender per route naar statische HTML** met: de juiste `<head>` (title, meta description, canonical, robots, Open Graph, Twitter Card, `lang="nl"` op `<html>`), de `<script type="application/ld+json">`-blokken, én de **zichtbare content** (de `content`-HTML en FAQ) in de HTML-bron — niet pas na JS-hydration.
3. Haal de data bij de build één keer op (lijst eenmalig; details per slug **parallel/gebatcht** binnen een kort venster zodat de snapshot consistent is — accepteer bewust de korte `max-age=60`-staleness) en geef die als props/inline-data mee aan de prerender, zodat de SPA bij hydration **niet opnieuw** hoeft te fetchen voor de initiële render. Embed de gebruikte data inline (`<script id="__BLOG_DATA__" type="application/json">…</script>`) zodat hydration zonder netwerkronde matcht.
4. De runtime-`fetch` blijft als **fallback** bestaan voor client-side navigatie en voor net gepubliceerde posts die nog niet in een build zitten. SEO mag er niet van afhangen.
5. Een nieuwe build pikt automatisch de nieuwste posts op (rebuild = bron van waarheid). Documenteer kort hoe een rebuild getriggerd wordt (bv. deploy hook / scheduled build).

### Concreet SSG-recept (kies één van twee)

**Optie A — bestaande plugin (voorkeur als de repo al iets heeft):** sluit aan bij `vike`/`vite-plugin-ssr` of `vite-react-ssg`. Lever per route een `onBeforeRender`/`getStaticPaths`-equivalent dat `fetchPosts()` (paths) en `fetchPost(slug)` (per-route data) aanroept, en geef de data als page-props door.

**Optie B — eigen prerender-script** (als er nog niets is). Bouw normaal de SPA en draai daarna een Node-script dat per route statische HTML wegschrijft. Schets:

```ts
// scripts/prerender.ts  (draait NA `vite build` van de client-bundle)
import { renderToString } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { StaticRouter } from "react-router-dom/server";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fetchPosts, fetchPost } from "../src/lib/blog";
import App from "../src/App";

const template = await readFile("dist/index.html", "utf8"); // de Vite-build-output

async function renderRoute(url: string, blogData: unknown) {
  const helmetContext: { helmet?: any } = {};
  const appHtml = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </HelmetProvider>,
  );
  const { helmet } = helmetContext;
  const head =
    helmet.title.toString() +
    helmet.meta.toString() +
    helmet.link.toString() +
    helmet.script.toString(); // JSON-LD zit hierin
  const inlineData = `<script id="__BLOG_DATA__" type="application/json">${JSON.stringify(
    blogData,
  ).replace(/</g, "\\u003c")}</script>`;

  return template
    .replace("<html", '<html lang="nl"') // of zet lang al in het bron-template
    .replace("</head>", `${head}${inlineData}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

async function write(routePath: string, html: string) {
  const dir = `dist${routePath}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/index.html`, html, "utf8");
}

const posts = await fetchPosts();
await write("/kennisbank", await renderRoute("/kennisbank", { posts }));
const details = await Promise.all(posts.map((p) => fetchPost(p.slug)));
await Promise.all(
  details.filter(Boolean).map((post) =>
    write(`/kennisbank/${post!.slug}`, renderRoute(`/kennisbank/${post!.slug}`, { post })),
  ),
);
```

```jsonc
// package.json
{
  "scripts": {
    "build": "vite build && tsx scripts/prerender.ts && tsx scripts/sitemap.ts"
  }
}
```

> **Cruciaal voor `react-helmet-async` bij SSG:** Helmet vult de `<head>` client-side via effects en belandt **niet** vanzelf in de prerenderde HTML. Je MOET met `HelmetProvider context={helmetContext}` renderen en ná `renderToString` `helmet.title/meta/link/script.toString()` uitlezen en in de `<head>` van de weggeschreven HTML injecteren (zie script). Sla je deze brug over, dan staan `<head>`/JSON-LD alleen client-side — precies de faalmodus die we vermijden. Pas de imports/router aan op wat de repo gebruikt.

## 2. Fetch-helpers (één databron)

Maak een dunne data-laag die zowel bij build als runtime werkt. Stuur **geen** `apikey`/`Authorization` (publiek endpoint). De `Access-Control-Allow-Headers` van de functie staat alleen `content-type` toe; stuur daarom geen custom request-headers (een `Accept`-header zou als safelisted nog net werken, maar is overbodig — laat hem weg).

```ts
// src/lib/blog.ts
const BASE = "https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public";

export type BlogListItem = {
  slug: string;                 // altijd
  title: string;                // altijd
  excerpt: string | null;
  category: string | null;
  category_slug: string | null;
  tags: string[];               // altijd (kan leeg)
  featured: boolean;            // altijd
  author_name: string | null;
  reading_minutes: number | null;
  published_at: string | null;
  updated_at: string;           // altijd
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_image_width: number | null;
  cover_image_height: number | null;
};

export type BlogDetail = BlogListItem & {
  content: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  noindex: boolean;             // altijd
  faq: { question: string; answer: string }[];   // altijd (kan leeg)
  json_ld: Record<string, unknown>;
};

export async function fetchPosts(): Promise<BlogListItem[]> {
  const res = await fetch(BASE); // geen extra headers
  if (!res.ok) throw new Error(`blog list ${res.status}`);
  const body = await res.json();
  if (body.status !== "ok") throw new Error(`blog list status ${body.status}`);
  return body.posts as BlogListItem[];
}

// null = not_found (renderen als echte 404); throw = echte fout (500/netwerk)
export async function fetchPost(slug: string): Promise<BlogDetail | null> {
  const res = await fetch(`${BASE}?slug=${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blog detail ${res.status}`);
  const body = await res.json();
  if (body.status === "not_found") return null;
  if (body.status !== "ok") throw new Error(`blog detail status ${body.status}`);
  return body.post as BlogDetail;
}

// helper voor canonical-fallback
export const canonicalFor = (post: BlogDetail) =>
  post.canonical_url ?? `https://e-charging.nl/kennisbank/${post.slug}`;
```

Vertaal `status: "not_found"` (of HTTP 404) altijd naar een 404-render; vertaal `status: "error"`/HTTP 500/netwerkfout (`fetch` gooit) naar een nette foutstaat (geen lege/half-gerenderde pagina). De lijst is **al** gefilterd op `gepubliceerd` en gesorteerd op `published_at` aflopend — filter/sorteer niet zelf op publicatiestatus.

## 3. Index-pagina `/kennisbank`

- Fetch via `fetchPosts()` (build-time; runtime alleen als fallback).
- Toon bovenaan een **uitgelicht** blok met de posts waar `featured === true`. **Verberg dit blok** als er geen featured posts zijn.
- **Groepeer de overige posts per `category`** (gebruik het label uit `category`; volgorde van de categoriegroepen volgens de vaste taxonomie). **Binnen elke groep behoud je de API-volgorde** (`published_at` aflopend) — verzin geen eigen sorteersleutel. Posts zonder `category` plaats je in een neutrale "Overig"-groep onderaan. Toon per groep een sectiekop.
- Elke kaart linkt naar `/kennisbank/<slug>` en toont `title`, en — alléén wanneer aanwezig — `excerpt`, `category`, `reading_minutes`, `published_at` (mensvriendelijk geformatteerd) en de cover.
- Cover-`<img>` **alleen** renderen wanneer `cover_image_url` én `cover_image_width` én `cover_image_height` aanwezig zijn; dan met `src`, `alt={cover_image_alt ?? ""}` en expliciete `width`/`height` (tegen CLS). Gebruik `loading="lazy"` behalve voor het eerste/uitgelichte beeld. Geen valide afbeelding → laat hem weg of toon een placeholder met vaste afmetingen.
- **Empty-state:** is `posts` leeg, toon een nette "nog geen artikelen"-melding (geen lege pagina/crash).
- **`<head>` index:**
  - zinvolle `<title>` + meta description voor de overzichtspagina;
  - `<link rel="canonical" href="https://e-charging.nl/kennisbank">`;
  - `lang="nl"` op `<html>`;
  - **Open Graph/Twitter (minimaal):** `og:type=website`, `og:title`, `og:description`, `og:url=https://e-charging.nl/kennisbank`, `og:site_name=E-Charging`, `og:locale=nl_NL`, een `og:image` (eerste featured cover of een site-default), `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- **Loading-state (runtime-fallback):** toon bij client-side navigatie een skeleton zolang de fetch loopt.

## 4. Detailpagina `/kennisbank/<slug>`

Render uit `fetchPost(slug)`:

- **Eén** pagina-`<h1>` = `title` (de `content` start zelf op `<h2>`; voeg geen extra `<h1>` toe en CSS-scope een eventuele `<h1>` in de content weg — zie waarschuwing in het datacontract).
- **Zichtbare breadcrumb** bovenaan: `Kennisbank` (link naar `/kennisbank`) → `<category>` (alleen tonen als aanwezig) → `<title>`. Gebruik `category_slug` voor een stabiel anchor/categorie-link op de index.
- Injecteer de (her-gesaneerde) `content`-HTML via `dangerouslySetInnerHTML`. Style via een `.prose`-achtige wrapper. **Empty-state:** is `content` leeg/`null`, toon een nette melding i.p.v. een lege `.prose`-wrapper.
- Cover-`<img>` defensief zoals in §3.
- Render de **FAQ als zichtbare accordeon** uit `post.faq` (alleen als de array niet leeg is). De zichtbare FAQ-tekst moet exact overeenkomen met de FAQ in de JSON-LD.
- **`<head>` van de detailpagina:**
  - `<title>` = `post.seo_title ?? post.title`
  - `<meta name="description" content={post.seo_description ?? post.excerpt ?? ""}>`
  - `<link rel="canonical" href={canonicalFor(post)}>`
  - `lang="nl"` op `<html>`
  - **`<meta name="robots" content="noindex,follow">` alléén als `post.noindex === true`** (anders deze tag weglaten of `index,follow`).
  - **Open Graph:** `og:type=article`, `og:title` (= `seo_title ?? title`), `og:description` (= `seo_description ?? excerpt`), `og:url` (= canonical), `og:site_name=E-Charging`, `og:locale=nl_NL`, `og:image`/`og:image:width`/`og:image:height`/`og:image:alt` (**alleen als cover compleet is**), `article:published_time` (= `published_at`, alleen indien aanwezig), `article:modified_time` (= `updated_at`).
  - **Twitter Card:** `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image` (indien cover aanwezig), `twitter:image:alt` (= `cover_image_alt`, indien aanwezig).
  - **JSON-LD (BlogPosting/FAQPage):** injecteer `post.json_ld` **letterlijk** via `JSON.stringify(post.json_ld)` in een `<script type="application/ld+json">`. Niet zelf opbouwen of herschrijven.
  - **JSON-LD (BreadcrumbList — dit bouw je WEL zelf):** voeg een tweede `<script type="application/ld+json">` toe met een `BreadcrumbList` opgebouwd uit `Kennisbank` → `<category>` (indien aanwezig) → `<title>`, met `item`-URLs op de **non-www** host (`https://e-charging.nl/kennisbank`, …). "Niet zelf opbouwen" geldt uitsluitend voor de BlogPosting/FAQPage-graph, niet voor deze breadcrumb.

### `<head>`/JSON-LD-injectie (voorbeeld met `react-helmet-async`)

> JSON-LD moet als **één string-child** in het `<script>` staan. Bij directe prerender-injectie (geen Helmet) zet je `JSON.stringify(...)` rauw tussen de `<script type="application/ld+json">…</script>`-tags. Vergeet de SSG-brug uit §1 niet (`helmet.*.toString()` uitlezen).

```tsx
import { Helmet } from "react-helmet-async";

function BlogHead({ post }: { post: BlogDetail }) {
  const canonical = post.canonical_url ?? `https://e-charging.nl/kennisbank/${post.slug}`;
  const title = post.seo_title ?? post.title;
  const description = post.seo_description ?? post.excerpt ?? "";
  const coverComplete =
    !!post.cover_image_url && !!post.cover_image_width && !!post.cover_image_height;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Kennisbank", item: "https://e-charging.nl/kennisbank" },
      ...(post.category
        ? [{ "@type": "ListItem", position: 2, name: post.category, item: canonical }]
        : []),
      { "@type": "ListItem", position: post.category ? 3 : 2, name: post.title, item: canonical },
    ],
  };

  return (
    <Helmet>
      <html lang="nl" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {post.noindex && <meta name="robots" content="noindex,follow" />}

      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="E-Charging" />
      <meta property="og:locale" content="nl_NL" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      {coverComplete && <meta property="og:image" content={post.cover_image_url!} />}
      {coverComplete && <meta property="og:image:width" content={String(post.cover_image_width)} />}
      {coverComplete && <meta property="og:image:height" content={String(post.cover_image_height)} />}
      {coverComplete && post.cover_image_alt && (
        <meta property="og:image:alt" content={post.cover_image_alt} />
      )}
      {post.published_at && <meta property="article:published_time" content={post.published_at} />}
      <meta property="article:modified_time" content={post.updated_at} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {coverComplete && <meta name="twitter:image" content={post.cover_image_url!} />}
      {coverComplete && post.cover_image_alt && (
        <meta name="twitter:image:alt" content={post.cover_image_alt} />
      )}

      {/* BlogPosting/FAQPage — letterlijk, niet zelf opbouwen */}
      <script type="application/ld+json">{JSON.stringify(post.json_ld)}</script>
      {/* BreadcrumbList — wél zelf opgebouwd */}
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
    </Helmet>
  );
}
```

## 5. 404-afhandeling (echte HTTP 404, niet alleen UI)

- `fetchPost` retourneert `null` bij `status==='not_found'`/HTTP 404 → render de bestaande 404-route. `status:'error'`/500/netwerkfout → nette foutstaat (geen lege/half-gerenderde pagina).
- Prerender **alleen** slugs uit de lijst-respons. Voor een onbekende `/kennisbank/<willekeurig>` bestaat dan geen HTML-bestand; op een statische host levert dat standaard de SPA-fallback met **HTTP 200**, niet 404. Dat is niet voldoende.
- **Voeg daarom een hosting-config toe die een echte HTTP 404 stuurt** voor niet-bestaande paden. Stem dit af op het platform (vraag het indien onbekend). Voorbeelden:
  - **Netlify** (`public/_redirects`, volgorde belangrijk): laat bestaande prerenderde paden met rust en stuur de rest naar de 404:
    ```
    /kennisbank/*   /404.html   404
    ```
  - **Cloudflare Pages**: `_redirects` met statuscode `404`, of een `functions/`-handler die `fetchPost(slug)===null` op HTTP 404 mapt.
  - **Vercel/nginx**: equivalente rewrite met 404-status of een SSR-handler die de juiste status zet.

## 6. Stabiele slugs + 301-redirects

- `slug` is stabiel; URL's zijn `/kennisbank/<slug>`. Verander geen slug-vorm client-side.
- Voorzie een **301-redirect**-mechanisme voor wanneer een slug ooit wijzigt (oude → nieuwe URL), zodat link-equity behouden blijft. Plaats dit op hosting-/edge-niveau (zelfde plek als de 404-config, bv. `_redirects`/host-config) en houd een eenvoudige, uitbreidbare lijst bij. **Geen** client-side `meta refresh`.

## 7. `sitemap.xml`, `lastmod` + `robots.txt`

- Genereer bij de build een `sitemap.xml` met:
  - `/kennisbank` (index), met `<lastmod>` = de **meest recente `updated_at`** over alle posts;
  - per post `https://e-charging.nl/kennisbank/<slug>` met `<lastmod>` = de **letterlijke `updated_at`** (volledige W3C-datetime/ISO 8601 is geldig — niet afkappen);
  - gebruik de canonieke **non-www** host.
- Plaats/actualiseer `robots.txt` met `Sitemap: https://e-charging.nl/sitemap.xml`. Blokkeer de kennisbank **niet** in robots.txt; respecteer `noindex` op individuele posts uitsluitend via de meta-tag (§4), niet via robots.txt.

## 8. Algemene eisen

- **Eén databron**: uitsluitend `blog-public`. Geen tweede CMS/JSON/markdown-bron.
- Geen velden gebruiken/verzinnen buiten dit contract.
- **Defensief renderen:** alle nullable velden (zie datacontract) afvangen — `<img>` alleen bij complete cover, `published_at`/date-formatting guarden, `excerpt`/`category`/`reading_minutes` conditioneel tonen, `seo_title`/`seo_description`/`canonical_url` met de genoemde fallbacks.
- **States compleet:** loading (skeleton, runtime-fallback), empty (lege `posts`, lege `content`, geen featured), 404 (echte status) en error (500/netwerk) zijn alle vier afgehandeld.
- Afbeeldingen altijd met expliciete `width`/`height` (CLS = 0).
- Geen API-key of `Authorization`-header sturen (endpoint is publiek); geen overbodige custom request-headers.
- **Ontdubbel de `<head>`:** verwijder/overschrijf generieke `<title>`/`description`/`canonical`/`og`-tags uit de root `index.html`-template, zodat er per route exact **één** canonical, **één** title en **één** set OG-tags is. Controleer op duplicaten in `view-source`.
- **Verwijder de oude hardgecodeerde kennisbank-content** (componenten, routes, lokale data) volledig.
- Respecteer de korte cache; doe geen onnodige dubbele fetches op dezelfde route.

---

## Klaar wanneer

- [ ] `/kennisbank` en `/kennisbank/<slug>` halen **alle** content uit `blog-public`; geen hardgecodeerde blogcontent en geen tweede databron meer (oude content verwijderd).
- [ ] Beide routes worden bij de build **geprerenderd/SSG'd**: `view-source` van een gebouwde pagina toont de volledige zichtbare content, correcte `<head>` (incl. `<html lang="nl">`) én de JSON-LD-blokken — **zonder JS uit te voeren**. Runtime-`fetch` werkt enkel als fallback bij client-navigatie.
- [ ] De `react-helmet-async`-output wordt bij de prerender uit `helmetContext` gelezen en in de weggeschreven HTML-`<head>` geïnjecteerd (geen client-only `<head>`).
- [ ] Index toont een **featured**-blok (`featured===true`, verborgen als leeg) en groepeert de rest **per `category`** (taxonomie-volgorde groepen, API-volgorde `published_at` aflopend binnen elke groep), met kaarten die naar `/kennisbank/<slug>` linken; lege `posts` toont een empty-state.
- [ ] Detailpagina heeft precies **één pagina-`<h1>` = `title`**; (her-gesaneerde) `content`-HTML is geïnjecteerd en correct gestyled; een `<h1>` binnen `content` is CSS-gescoped; lege `content` toont een empty-state.
- [ ] Zichtbare **breadcrumb** op de detailpagina (`Kennisbank → <category> → <title>`) plus een zelf-opgebouwde **BreadcrumbList**-JSON-LD op de non-www host.
- [ ] `<head>` detail klopt en valt netjes terug bij `null`: `title=seo_title??title`, `description=seo_description??excerpt`, `canonical=canonical_url??afgeleid`, `meta robots noindex` **alléén** als `post.noindex===true`.
- [ ] Open Graph + Twitter Card aanwezig, incl. `og:site_name`, `og:locale`, en — **alleen bij complete cover** — `og:image`/`og:image:width`/`og:image:height`/`og:image:alt` en `twitter:image`/`twitter:image:alt`.
- [ ] `post.json_ld` wordt **letterlijk** geïnjecteerd via `JSON.stringify(post.json_ld)` (niet zelf opgebouwd; optionele velden mogen ontbreken; `keywords` is een string); valideert in Google Rich Results Test (BlogPosting, FAQPage als `faq` niet leeg, plus de aparte BreadcrumbList).
- [ ] FAQ wordt als **zichtbare accordeon** gerenderd uit `post.faq` (alleen bij niet-lege array), tekst komt overeen met de FAQ in de JSON-LD.
- [ ] Alle TS-types zijn **nullable-correct**; nergens crasht de render op een ontbrekend veld; alle `<img>` hebben `src`/`alt`/`width`/`height`; geen layout shift (CLS).
- [ ] Onbekende/ongepubliceerde slug → **echte HTTP 404** via hosting-config (niet alleen een 200 met "niet gevonden"-tekst); `status:'error'`/500/netwerkfout → nette foutstaat.
- [ ] Slugs zijn stabiel; er is een werkend **301-redirect**-mechanisme voor toekomstige slug-wijzigingen (host/edge-niveau, geen meta-refresh).
- [ ] `sitemap.xml` bevat de index (lastmod = nieuwste `updated_at`) + alle post-URL's met `<lastmod>` = letterlijke `updated_at` op de non-www host; `robots.txt` verwijst naar de sitemap en blokkeert de kennisbank niet.
- [ ] Generieke `<head>`-tags uit de root `index.html` zijn ontdubbeld; per route exact één canonical/title/OG-set; canonicals en alle interne kennisbank-links wijzen naar de **non-www** host `https://e-charging.nl`.
- [ ] `npm run build` slaagt (incl. prerender + sitemap-stap); lint/typecheck groen; de build heeft een globale `fetch` (Node 18+, anders gepolyfilld); een nieuwe build pikt automatisch nieuw gepubliceerde posts op.