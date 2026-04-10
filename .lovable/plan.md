

# Batch 5: Offertes Module — Lijst, Aanmaken, Detailpagina

## Overzicht

Drie placeholder pagina's volledig bouwen:
1. **AdminQuotes** — offertelijst met zoek, status-filter, pagination
2. **AdminQuoteCreate** — formulier dat parameters overneemt uit Calculator (via URL params) of handmatig invult, berekening toont, en offerte opslaat in `quotes` tabel
3. **AdminQuoteDetail** — offerte bekijken met alle gegevens, status wijzigen, en PDF-export knop

## Wijzigingen

### 1. `useAdminData.ts` — Uitbreiden

- `useQuoteById(id)` — haalt quote op met `quotes.select("*, clients(company_name)")` op ID

### 2. `AdminQuotes.tsx` — Herschrijven

Volgt exact het AdminClients patroon:
- Debounced zoek op `prospect_company`, `quote_number`
- Status filter: alle / concept / verstuurd / getekend / verlopen / afgewezen
- Tabel kolommen: Offertenr | Bedrijf | Laadpunten | Totaal/jaar | Status | Datum
- Klikbare rijen → `/admin/offertes/:id`
- Pagination (20/pagina), skeleton loader, lege state
- "Nieuwe offerte" knop → `/admin/offertes/nieuw`

### 3. `AdminQuoteCreate.tsx` — Herschrijven

- Leest URL params van Calculator (`cp`, `kwh`, `energy`, `rate`, `type`, `share`, `solar`, `ere`) als defaults
- Formulier secties:
  - **Prospect**: bedrijf, contactpersoon, e-mail (of koppel aan bestaande klant via dropdown)
  - **Parameters**: aantal laadpunten, kWh/mnd, tarief, energiekost, type, revenue share, ERE, zonnepanelen
  - **Berekening**: live preview van jaarlijkse resultaten (hergebruik `calculateMonthly` uit `services/calculations.ts` × 12)
  - **Notities** en **Geldig tot** datum
- Opslaan: insert in `quotes` tabel met `status: 'concept'`, `organization_id` uit `useOrganization`, `calculation_snapshot` met alle berekende waarden
- Na opslaan: navigeer naar `/admin/offertes/:id`

### 4. `AdminQuoteDetail.tsx` — Herschrijven

- Header: offertenummer, bedrijfsnaam, StatusBadge, datum
- Terug-knop naar `/admin/offertes`
- Twee kolommen:
  - Links: prospect-info, parameters, notities
  - Rechts: berekening samenvatting (uit `calculation_snapshot`)
- Acties:
  - Status wijzigen (dropdown: concept → verstuurd → getekend / verlopen / afgewezen) via Supabase update
  - PDF exporteren: genereer client-side PDF met `jsPDF` of `@react-pdf/renderer` — bevat offerte-details en berekening

### 5. PDF Export

Gebruik `@react-pdf/renderer` (al beschikbaar of te installeren) voor een gestylde offerte-PDF:
- Logo/header met organisatienaam
- Prospect gegevens
- Parameters tabel
- Berekening resultaat
- Geldig tot datum
- Download als `Offerte-{nummer}.pdf`

## Technische details

- `useAllQuotes` bestaat al, haalt `quotes.*` op — voldoende voor de lijst
- `useQuoteById` nieuw toe te voegen
- Calculator linkt al naar `/admin/offertes/nieuw?params` — die flow wordt nu werkend
- Status updates via `supabase.from("quotes").update({ status }).eq("id", id)`
- Berekening: hergebruik `calculateMonthly()` × 12 voor jaarcijfers
- PDF: installeer `jspdf` + `jspdf-autotable` (lichter dan react-pdf voor server-side rendering)

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/hooks/useAdminData.ts` | + `useQuoteById` hook |
| `src/pages/admin/AdminQuotes.tsx` | Herschrijven |
| `src/pages/admin/AdminQuoteCreate.tsx` | Herschrijven |
| `src/pages/admin/AdminQuoteDetail.tsx` | Herschrijven |

Geen database migraties nodig — `quotes` tabel bestaat al met alle benodigde kolommen.

