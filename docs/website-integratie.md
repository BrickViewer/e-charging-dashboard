# Website-integratie (www.e-charging.nl)

De statische website praat **nooit rechtstreeks** met de database. Inkomend (contact)
gaat via een edge-functie; uitgaand (blogs, later) wordt read-only gelezen.

## Contactformulier → systeem

**Endpoint (publiek, geen sleutel nodig):**
```
POST https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/contact-intake
Content-Type: application/json
```

Beveiliging: CORS beperkt tot `e-charging.nl` / `www.e-charging.nl` (+ localhost voor dev),
honeypot, rate-limiting (10/10 min per IP) en — zodra ingesteld — Cloudflare Turnstile.

Een inzending komt binnen als **lead** onder **Sales → Leads** (fase "Nieuw"). Bedrijf en
persoon worden automatisch in de contacten-laag aangemaakt/gededupliceerd, en het bericht
komt in de notitie van de lead — zodat je bij een offerte of conversie niks dubbel invult.
`bedrijf` is optioneel; zonder bedrijf wordt de naam als bedrijfsnaam gebruikt.

### Kopieer-klaar (werkt in elke statische/Vite-site)

```html
<form id="contact-form" novalidate>
  <label>Naam <input name="name" type="text" autocomplete="name" /></label>
  <label>E-mail <input name="email" type="email" autocomplete="email" required /></label>
  <label>Telefoon <input name="phone" type="tel" autocomplete="tel" /></label>
  <label>Bedrijf <input name="company" type="text" autocomplete="organization" /></label>
  <label>Onderwerp <input name="subject" type="text" /></label>
  <label>Bericht <textarea name="message" rows="5" required></textarea></label>

  <!-- Honeypot: verborgen voor mensen, bots vullen 'm. NIET weghalen. -->
  <div aria-hidden="true" style="position:absolute;left:-9999px;height:0;overflow:hidden">
    <input name="website_url_hp" type="text" tabindex="-1" autocomplete="off" />
  </div>

  <button type="submit">Versturen</button>
  <p id="contact-status" role="status" aria-live="polite"></p>
</form>

<script>
  const ENDPOINT = "https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/contact-intake";
  const form = document.getElementById("contact-form");
  const statusEl = document.getElementById("contact-status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const d = Object.fromEntries(new FormData(form).entries());
    statusEl.textContent = "Versturen…";
    btn.disabled = true;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name, email: d.email, phone: d.phone, company: d.company,
          subject: d.subject, message: d.message,
          website_url_hp: d.website_url_hp,      // honeypot
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.status === "ok") {
        form.reset();
        statusEl.textContent = "Bedankt! We nemen snel contact met je op.";
      } else if (res.status === 429) {
        statusEl.textContent = "Te veel berichten verstuurd. Probeer het later opnieuw.";
      } else {
        statusEl.textContent = json.message || "Versturen mislukt. Probeer het later opnieuw.";
      }
    } catch {
      statusEl.textContent = "Versturen mislukt. Controleer je verbinding.";
    } finally {
      btn.disabled = false;
    }
  });
</script>
```

### Turnstile later toevoegen (aanbevolen tegen spam)
1. Cloudflare → Turnstile → nieuwe site → **site key** (website) + **secret key**.
2. Secret in Supabase zetten: `supabase secrets set TURNSTILE_SECRET_KEY=...` (of via het dashboard).
   Zodra die env bestaat, eist `contact-intake` automatisch een geldig token.
3. Op de website het Turnstile-widget toevoegen en het token meesturen als
   `turnstile_token` in de body:
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
   <div class="cf-turnstile" data-sitekey="JOUW_SITE_KEY"></div>
   ```
   ```js
   const token = form.querySelector('[name="cf-turnstile-response"]').value;
   // ... body: { ..., turnstile_token: token }
   ```

## Blogs/kennisbank lezen op de website (volledig SEO-contract)

Blogs worden in het dashboard beheerd (**Marketing → Blogs**) en read-only opgehaald
via een publieke edge-functie — géén Supabase-sleutel nodig. Alleen **gepubliceerde**
blogs komen terug. De site rendert volledig uit deze JSON (geen tweede databron).

**Endpoints (GET):**
```
Lijst:   https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public
Detail:  https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public?slug=<slug>
```

### Velden

**Lijst** `{ posts: [...] }` — per post:
`slug, title, excerpt, category, category_slug, tags, author_name, reading_minutes,
published_at, updated_at, cover_image_url, cover_image_alt, cover_image_width,
cover_image_height, featured`. Gesorteerd op `published_at` aflopend.

**Detail** `{ post: {...} }` = alle lijstvelden **plus**:
`content` (gesaneerde semantische HTML), `seo_title` (≤60), `seo_description` (≤155),
`canonical_url` (al opgelost: `https://e-charging.nl/kennisbank/<slug>` of de override),
`noindex` (bool), `faq` (`[{question, answer}]`) en `json_ld` (kant-en-klaar
`@graph` met **BlogPosting** + **FAQPage**). Status **404** bij onbekende/ongepubliceerde slug.

### Detailpagina — maximaal SEO

```js
const BASE = "https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/blog-public";

async function renderArticle(slug) {
  const res = await fetch(`${BASE}?slug=${encodeURIComponent(slug)}`);
  if (res.status === 404) return show404();
  const { post } = await res.json();

  // <head>
  document.title = post.seo_title;
  setMeta("description", post.seo_description);
  setLinkRel("canonical", post.canonical_url);
  if (post.noindex) setMeta("robots", "noindex,follow");
  // Open Graph
  setMetaProp("og:type", "article");
  setMetaProp("og:title", post.seo_title);
  setMetaProp("og:description", post.seo_description);
  setMetaProp("og:url", post.canonical_url);
  setMetaProp("og:image", post.cover_image_url);
  setMetaProp("og:image:width", post.cover_image_width);
  setMetaProp("og:image:height", post.cover_image_height);

  // JSON-LD (BlogPosting + FAQPage) — kant-en-klaar
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(post.json_ld);
  document.head.appendChild(s);

  // <body>: één <h1> = title (de content begint zelf bij <h2>)
  el("h1").textContent = post.title;
  if (post.cover_image_url) {
    const img = el("img.hero");
    img.src = post.cover_image_url; img.alt = post.cover_image_alt || post.title;
    img.width = post.cover_image_width; img.height = post.cover_image_height; // tegen CLS
  }
  el("#content").innerHTML = post.content; // gesaneerde HTML; evt. nogmaals client-side saneren

  // FAQ als accordeon (de FAQPage-structured-data zit al in json_ld)
  el("#faq").innerHTML = post.faq.map((f) =>
    `<details><summary>${esc(f.question)}</summary><div>${esc(f.answer)}</div></details>`).join("");
}
```

### Index `/kennisbank` — groeperen per categorie

```js
async function renderIndex() {
  const { posts } = await fetch(BASE).then((r) => r.json());
  const featured = posts.filter((p) => p.featured);            // 0–1 uitgelicht bovenaan
  const groups = {};
  for (const p of posts) (groups[p.category] ??= []).push(p);   // gebruik category_slug voor anchors/filters
  // render per categorie kaarten: title, excerpt, cover (+ width/height), reading_minutes → /kennisbank/<p.slug>
}
```

### Sitemap

Genereer `sitemap.xml` uit de lijst: per post `<loc>` = `canonical_url` (of
`https://e-charging.nl/kennisbank/<slug>`) en `<lastmod>` = `updated_at`.

### Belangrijk
- **Stabiele slugs**: verandert een slug, regel dan een **301-redirect** van de oude
  URL (anders breken bestaande links/backlinks).
- **`published_at` ≠ `updated_at`**: gebruik beide (datePublished/dateModified) — staat al in `json_ld`.
- Omslag- en inline-afbeeldingen wijzen al naar Supabase Storage (absoluut, met
  afmetingen), dus de blogs zijn zelfstandig. Nieuwe/bewerkte blogs verschijnen
  automatisch via deze endpoints.
