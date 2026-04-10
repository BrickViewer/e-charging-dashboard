

# Plan: Admin Beheerpaneel Ombouw

Dit is een groot project. Ik stel voor om het in **5 batches** te implementeren, zodat je na elke batch kunt testen.

---

## Batch 1: Database schema uitbreiden + Design systeem + Sidebar + Routes

### Database migratie
Kolommen toevoegen aan bestaande tabellen (geen data verwijderen):

**organizations**: `logo_url`, `default_charge_rate_per_kwh`, `default_energy_cost_per_kwh`, `default_revenue_share_pct`, `default_ere_rate_per_kwh`, `default_eflux_cost_ac`, `default_eflux_cost_dc`, `eflux_api_key`, `stripe_secret_key`, `stripe_publishable_key`, `updated_at`

**clients**: `billing_address_street`, `billing_address_postal`, `billing_address_city`, `charge_rate_per_kwh`, `energy_cost_per_kwh`, `ere_rate_per_kwh`, `monthly_platform_surcharge`
- Update `stripe_onboarding_status` check constraint to include `'not_started'`

**charge_points**: `serial_number`, `eflux_evse_controller_id`, `connectivity_state` (connected/maybe-connected/disconnected/access-denied/unknown/pending-first-connection), `last_heartbeat_at`, `num_connectors`, `max_power`, `updated_at`

**charging_sessions**: `status` (ACTIVE/COMPLETED), `duration_seconds`, `currency`, `external_calculated_price`, `energy_costs`, `time_costs`, `start_costs`, `idle_costs`, `total_price`, `power_type`, `connector_id`, `excluded`, `updated_at`

**quotes**: `num_charge_points`, `charge_point_type`, `estimated_kwh_per_point`, `charge_rate_per_kwh`, `energy_cost_per_kwh`, `revenue_share_pct`, `ere_rate_per_kwh`, `has_solar`, `solar_percentage`, `calculation_snapshot`, `updated_at`
- Rename `calculation_data` → keep both, use `calculation_snapshot` going forward

**locations**: `latitude`, `longitude`, `updated_at`

**activity_log**: rename `details` to also support `description` + `metadata` columns

**Nieuwe tabel**: `eflux_sync_log` (entity_type, last_synced_at, records_synced, status, error_message)

### Design systeem
- Update `src/index.css` met de exacte CSS custom properties uit de spec
- Sidebar variabelen: dark background `#1A1A1E`
- KPI, typography, component classes per spec

### Sidebar ombouw (`AdminLayout.tsx`)
- Donkere achtergrond (#1A1A1E), 260px breed
- Logo: "e-" in groen (#047F00), "Charging" in wit, "Beheer" eronder
- Nav items met Lucide icons, actief item: `bg-white/10`, `border-left 3px solid primary`
- Separator voor Instellingen
- Gebruikersprofiel onderaan (naam uit profiles tabel, rol, uitloggen)
- Mobile: hamburger menu

### Routes bijwerken (`App.tsx`)
- `/admin/offertes` als aparte route (los van calculator)
- `/admin/offertes/nieuw` voor offerte aanmaken
- `/admin/klanten/nieuw` voor klant wizard
- `/admin/klanten/:id` voor klantdetail

### Service layers
- `src/services/eflux.ts` — wrapper rond Supabase queries, klaar voor Road.io API
- `src/services/stripe.ts` — stub voor Stripe Connect
- `src/services/calculations.ts` — `calculateMonthly()` functie

---

## Batch 2: Dashboard + Calculator + Financieel

### Dashboard (`/admin`)
- 4 KPI-cards met maand-over-maand vergelijking (▲/▼ %)
- Klantentabel: Klant | Locaties | Laadpunten | kWh/maand | Marge E-Charging | Status
- Zoekbalk + statusfilter boven tabel
- Alerts-sectie: offline laadpunten, openstaande offertes, uitbetalingen gereed

### Calculator (`/admin/calculator`)
- Twee-kolom layout: links inputs, rechts live resultaten
- Input cards: Locatiegegevens (met +/- knoppen, slider), Tarieven, Extra opties (solar toggle)
- Resultaat cards: klant (groene accent-border), E-Charging, terugverdientijd
- Knoppen "Maak offerte" en "Maak klant aan" onderaan

### Financieel (`/admin/financieel`)
- KPI-rij: MRR totaal, uitbetaald, openstaand, gem. marge
- Recharts AreaChart 12 maanden (E-Charging marge + klant-uitbetalingen)
- Afrekenrun card met tabel per klant + totaalrij
- "Keur alle berekeningen goed" knop
- Omzet per klant tabel

---

## Batch 3: Klanten (lijst + wizard + detailpagina)

### Klantenlijst (`/admin/klanten`)
- Tabel: Klant | Contactpersoon | Locaties | Laadpunten | Status | Aangemaakt
- Zoek + statusfilter dropdown
- "Nieuwe klant" knop → wizard

### Klant wizard (`/admin/klanten/nieuw`)
- 5-stap stepper component (bolletjes + lijnen)
- Stap 1: Klantgegevens (bedrijfsnaam, KVK, contact, adres split)
- Stap 2: Locaties (meerdere, met pandtype, parkeerplaatsen, EAN, solar)
- Stap 3: Laadpunten per locatie (tabs, auto-genereer rijen bij aantal)
- Stap 4: Tariefstructuur (met live preview maandelijks)
- Stap 5: Overzicht & Bevestigen (samenvatting, wijzig-links, opslaan)

### Klantdetail (`/admin/klanten/:id`)
- Header met bedrijfsnaam, status badge, bewerken knop
- 5 tabs: Overzicht | Locaties & Laadpunten | Financieel | Documenten | Activiteit
- Tab Overzicht: klantgegevens, contractgegevens, Stripe status, quick stats
- Tab Locaties: uitklapbare cards met laadpunten tabel per locatie
- Tab Financieel: settlement cards per maand
- Tab Documenten: upload area (placeholder, storage bucket later)
- Tab Activiteit: chronologische log

---

## Batch 4: Offertes + Laadpunten

### Offertes (`/admin/offertes`)
- Offertelijst tabel: nummer, klant/prospect, laadpunten, bedrag/jaar, status, datum
- Status badges: concept/verstuurd/getekend/verlopen/afgewezen

### Offerte aanmaken (`/admin/offertes/nieuw`)
- Prospect/klant selectie (bestaand of nieuw)
- Configuratie (zelfde als calculator, pre-filled als vanuit calculator)
- Offerte-instellingen: auto-nummer, geldig tot, notities
- Preview/opslaan knoppen

### Offerte detail (`/admin/offertes/:id`)
- Volledige offerte met berekeningen
- Status-wijziging knoppen
- "Maak klant aan vanuit offerte" bij status getekend

### Laadpunten (`/admin/laadpunten`)
- KPI-rij: totaal, online, offline, storing
- Tabel met connectivity_state indicators (gekleurde bollen)
- Filters: klant, locatie, status, type
- Laatste heartbeat kolom
- Klik → detail (placeholder)

---

## Batch 5: Instellingen + Demo data cleanup + Polish

### Instellingen (`/admin/instellingen`)
- 4 tabs: Bedrijf | Gebruikers | Standaardwaarden | API
- Bedrijf: edit form voor organisatie
- Gebruikers: tabel met rollen, "Gebruiker toevoegen"
- Standaardwaarden: editable default tarieven (uit organizations tabel)
- API: password fields voor keys, webhook URL readonly, test knop (disabled)

### Demo data
- Update bestaande demodata zodat het past bij de nieuwe kolommen
- Activity log entries (10-15 regels)
- Seed `eflux_sync_log`
- Locatienamen aanpassen per spec (Fellenoord 15, Keizersgracht 200, etc.)

### Performance & polish
- React.lazy + Suspense voor alle admin pagina's
- Skeleton loaders op KPI-cards en tabellen
- Pagination component (20 rijen/pagina)
- Debounce op zoek-inputs (300ms)
- Responsive: tablet sidebar collapse, mobile stacking

---

## Bestanden die worden aangemaakt/gewijzigd

| Bestand | Actie |
|---------|-------|
| `supabase/migrations/...` | Schema uitbreidingen + demodata updates |
| `src/index.css` | Design tokens bijwerken |
| `src/layouts/AdminLayout.tsx` | Volledig herschrijven (dark sidebar) |
| `src/components/Logo.tsx` | "e-" groen + "Charging" wit variant |
| `src/components/KPICard.tsx` | Design update |
| `src/App.tsx` | Nieuwe routes toevoegen |
| `src/pages/admin/AdminDashboard.tsx` | Herschrijven |
| `src/pages/admin/AdminClients.tsx` | Herschrijven |
| `src/pages/admin/AdminClientWizard.tsx` | **Nieuw** |
| `src/pages/admin/AdminClientDetail.tsx` | **Nieuw** |
| `src/pages/admin/AdminCalculator.tsx` | Herschrijven |
| `src/pages/admin/AdminQuotes.tsx` | **Nieuw** |
| `src/pages/admin/AdminQuoteCreate.tsx` | **Nieuw** |
| `src/pages/admin/AdminQuoteDetail.tsx` | **Nieuw** |
| `src/pages/admin/AdminFinancial.tsx` | Herschrijven |
| `src/pages/admin/AdminChargePoints.tsx` | Herschrijven |
| `src/pages/admin/AdminSettings.tsx` | Herschrijven |
| `src/services/eflux.ts` | **Nieuw** |
| `src/services/stripe.ts` | **Nieuw** |
| `src/services/calculations.ts` | **Nieuw** |
| `src/hooks/useAdminData.ts` | Uitbreiden |
| `src/components/admin/StepperWizard.tsx` | **Nieuw** |
| `src/components/admin/SettlementCard.tsx` | **Nieuw** |
| `src/components/admin/StatusBadge.tsx` | **Nieuw** |
| `src/components/admin/ConnectivityIndicator.tsx` | **Nieuw** |

Totaal: ~25 bestanden, ~5000-7000 regels nieuwe code, 2-3 database migraties.

Ik begin met Batch 1 na goedkeuring en werk dan per batch door.

