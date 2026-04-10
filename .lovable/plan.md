

# Logo's & Branding Toepassen over het Hele Systeem

## Overzicht

De huidige `Logo` component is een tekst-only placeholder. De uploadde SVG logo's worden toegevoegd aan het project en op alle juiste plekken gebruikt, conform het brand book.

## Logo-varianten en gebruik

Volgens het brand book (sectie 3.1 toepassingstabel):

| Context | Achtergrond | Logo-variant |
|---------|------------|--------------|
| Client portal sidebar (licht) | Licht | **Full Color** logo |
| Client portal mobile header | Licht | **Full Color** logo |
| Admin sidebar (donker #1A1A1E) | Donker | **Bright** logo |
| Admin mobile header (licht) | Licht | **Full Color** logo |
| Login pagina | Licht | **Full Color** logo |
| Favicon | — | **Full Color** icoon |
| PDF export (offertes) | Wit | **Full Color** logo (embedded) |
| `index.html` title + meta | — | "e-Charging" tekst |

## Bestanden

### Kopieer assets (8 bestanden → `src/assets/`)
- `E-Charging_logo_2000x800_Full_color.svg` → `src/assets/logo-full-color.svg`
- `E-Charging_logo_2000x800_Bright.svg` → `src/assets/logo-bright.svg`
- `E-Charging_logo_2000x800_Full_White.svg` → `src/assets/logo-full-white.svg`
- `E-Charging_logo_2000x800_Full_Black.svg` → `src/assets/logo-full-black.svg`
- `E-Charging_Icon_2000x800_Full_color.svg` → `src/assets/icon-full-color.svg`
- `E-Charging_Icon_2000x800_Bright.svg` → `src/assets/icon-bright.svg`
- `E-Charging_Icon_2000x800_Full_White.svg` → `src/assets/icon-full-white.svg`
- `E-Charging_Icon_2000x800_Full_Black.svg` → `src/assets/icon-full-black.svg`

### Wijzigingen

| Bestand | Actie |
|---------|-------|
| `src/assets/` | 8 SVG logo's kopiëren |
| `src/components/Logo.tsx` | Herschrijven: `<img>` met juiste SVG variant op basis van `variant` prop |
| `src/layouts/AdminLayout.tsx` | Logo variant="dark" → toont Bright logo; mobile header → Full Color |
| `src/layouts/ClientLayout.tsx` | Logo → toont Full Color logo |
| `src/pages/Login.tsx` | Vervang Zap-icoon + tekst door Full Color logo |
| `src/pages/admin/AdminQuoteDetail.tsx` | PDF header: embed Full Color logo als base64 image i.p.v. tekst |
| `index.html` | Titel → "e-Charging", favicon → Full Color icoon |
| `public/favicon.svg` | Kopieer icon-full-color.svg als favicon |

### Technische details

**Logo component:**
```
- variant="light" → import logo-full-color.svg
- variant="dark" → import logo-bright.svg  
- Optionele subtitle blijft als tekst eronder
- Hoogte: ~32px sidebar, ~40px login
```

**PDF logo embed:**
- Converteer Full Color SVG naar base64 data URL
- Gebruik `doc.addImage()` i.p.v. `doc.text()` voor de header

**Favicon:**
- Kopieer icon-full-color.svg naar `public/favicon.svg`
- Verwijder bestaande favicon.ico indien aanwezig
- Update `index.html` met `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`

