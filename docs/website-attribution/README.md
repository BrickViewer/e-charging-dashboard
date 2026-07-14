# Lead-attributie vanaf www.e-charging.nl (first-touch → offerteformulier)

**Voor de websitebouwer.** Het dashboard toont per blogartikel welke leads en omzet eruit voortkomen
(Marketing → Blogprestaties). Die attributie werkt pas als het offerteformulier meegeeft **waar de bezoeker
oorspronkelijk binnenkwam**. De backend (edge-functie `quote-intake`) accepteert de velden al — er hoeft
alleen website-zijdig iets bij.

## Wat er moet gebeuren

1. **Op elke paginaload** (site-breed, dus ook op blogpagina's): first-touch éénmalig vastleggen in
   `localStorage`. Eerste bezoek wint; latere pagina's overschrijven niets.
2. **Bij het versturen van het offerteformulier** (de POST naar
   `https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/quote-intake`): de vastgelegde velden meesturen
   in dezelfde JSON-body, naast de bestaande velden.

## Stap 1 — snippet op elke pagina

```html
<script>
(function () {
  var KEY = "ec_first_touch";
  try {
    if (localStorage.getItem(KEY)) return; // first touch al vastgelegd
    var p = new URLSearchParams(location.search);
    localStorage.setItem(KEY, JSON.stringify({
      first_touch_path: location.pathname,             // bv. "/kennisbank/laadpaal-vve"
      landing_page: location.href,                     // volledige URL incl. querystring
      referrer: document.referrer || null,             // bv. "https://www.google.com/"
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_term: p.get("utm_term"),
      utm_content: p.get("utm_content"),
      first_touch_at: new Date().toISOString()
    }));
  } catch (e) { /* localStorage geblokkeerd: attributie stilletjes overslaan */ }
})();
</script>
```

## Stap 2 — meesturen in de quote-intake-POST

Waar het formulier zijn JSON-body opbouwt, de opgeslagen velden erbij mergen:

```js
var attribution = {};
try { attribution = JSON.parse(localStorage.getItem("ec_first_touch") || "{}"); } catch (e) {}

var body = Object.assign({}, bestaandeFormulierVelden, {
  first_touch_path: attribution.first_touch_path || null, // pad ZONDER domein
  first_touch_at: attribution.first_touch_at || null,
  landing_page: attribution.landing_page || null,
  referrer: attribution.referrer || null,
  utm_source: attribution.utm_source || null,
  utm_medium: attribution.utm_medium || null,
  utm_campaign: attribution.utm_campaign || null,
  utm_term: attribution.utm_term || null,
  utm_content: attribution.utm_content || null,
  attribution: attribution // volledige snapshot (jsonb, vrij veld)
});
```

## Contract (backend, bestaat al)

`quote-intake` slaat deze velden 1-op-1 op de lead op. Belangrijk:

| Veld | Vorm | Voorbeeld |
| --- | --- | --- |
| `first_touch_path` | pad **zonder** domein | `/kennisbank/laadpalen-voor-vve-s` |
| `first_touch_at` | ISO-8601 timestamp | `2026-07-14T09:12:00.000Z` |
| `landing_page` | volledige URL | `https://www.e-charging.nl/kennisbank/…?utm_source=…` |
| `referrer` / `utm_*` | string of `null` | `https://www.google.com/` |
| `attribution` | vrij JSON-object | de hele snapshot |

De blog-attributie in het dashboard matcht exact op `first_touch_path = '/kennisbank/<slug>'` — daarom
moet het pad zonder domein en zonder trailing slash worden meegestuurd (`location.pathname` doet dit goed,
mits de site geen trailing slashes forceert; anders strippen).

## Testen

1. Open in een schone/incognito-browser eerst een blogpagina (`/kennisbank/…`), klik daarna door naar het
   offerteformulier en verstuur een testaanvraag.
2. In het dashboard: de nieuwe lead openen — de aanvraagdetails tonen de herkomst. Of via de database:
   `select first_touch_path, referrer, utm_source from leads order by created_at desc limit 1;`
3. Verwacht: `first_touch_path = '/kennisbank/<slug>'`. Vanaf dan telt deze lead mee op Blogprestaties.
