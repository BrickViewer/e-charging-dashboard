# E-Charging Dashboard — Agent context

This file is the entry point for AI coding agents (Codex, Claude Code, etc.) working on this codebase. Read top-to-bottom before making changes.

## What this project is

**E-Charging Dashboard** is the operational management dashboard for **E-Charging**, a Dutch EV-charging service-fee platform.

E-Charging is a private-label CPO (Charge Point Operator) inside the Road / e-Flux platform (provider slug `echarging`, ID `69df3b6fbae5c5e57fb7d047`, custom domain `echarging.dashboard.e-flux.io`). The dashboard sits **on top of** e-Flux: charge points, sessions and invoices live in Road; we sync them into Supabase and layer our own commercial model on top.

**Revenue model (service-fee per kWh, sinds 2026):** end-user pays for charging → Road collects → Road reimburses E-Charging → E-Charging takes a flat fee per charged kWh and passes the rest to the **klant** (property owner / parking-operator on whose location the charger lives):

```
Laadopbrengst (gross_revenue, excl BTW)  = som reimbursement_amount uit Road
E-Charging service-fee                    = echarging_fee_per_kwh × total_kwh   (default €0,10/kWh, GEEN minimum)
Uitbetaling klant (client_payout)         = gross_revenue − service-fee
```

- **Geen** revenue-share-split (de oude 75/25 is afgeschaft), **geen** energie-doorbelasting (de klant betaalt zelf zijn stroom), **geen** abonnements- of opstartkosten aan de klant, **geen** blokkeer/start-tarief-percentage.
- De fee staat op `organizations.default_echarging_fee_per_kwh` (default `0.10`) met optionele per-klant override `clients.echarging_fee_per_kwh`. **LET OP: 0.10 = tien cent per kWh, niet 0.001.** Een vitest (`apps/admin/src/services/calculations.test.ts`) faalt als de constante verkeerd staat.
- Afrekeningen zijn **maandelijks** (`settlements`-tabel, één rij per `client_id, year, month`).
- De canonieke formule staat in `apps/admin/src/services/calculations.ts` (`calculateSettlement`, `DEFAULT_ECHARGING_FEE_PER_KWH`); de edge function `aggregate-settlements` houdt een identieke Deno-kopie aan.
- `clients.revenue_share_percentage` bestaat nog als legacy-kolom maar wordt door settlements genegeerd.

## User groups & routing

| Group | Route prefix | Role check | Access |
|---|---|---|---|
| **Admin / internal** | `/admin/*` | `is_internal()` or `has_role('admin'/'manager')` | All clients, all settlements, all locations, sync controls |
| **Klant / portal** | `/portal/*` | `clients.portal_user_id = auth.uid()` | Only own data via `get_client_id_for_user()` |

Klanten worden uitgenodigd via een token-link (`client_invitations` tabel + `send-client-invitation` + `accept-client-invitation` edge functions). Bij accept wordt `clients.portal_user_id` gevuld → klant ziet alleen eigen sessies, settlements, locations.

## Tech stack

- **Frontend**: Vite 8 + React 18 + TypeScript + TanStack Query + React Router 7
- **UI**: shadcn/ui (Radix + Tailwind) — generated components live in `src/components/ui/`
- **Forms**: react-hook-form + zod
- **Backend**: Supabase (project `uuldldhmuanmjlyvnagt`)
  - PostgreSQL with RLS on every public table
  - Supabase Auth (email/password)
  - Edge Functions (Deno runtime)
  - Vault for secrets (`supabase_anon_key`, plus env-secrets for API keys)
- **External**: Road / e-Flux API at `https://api.road.io` (Bearer auth + `Provider` header)

## Folder map

Het project is een **npm-workspaces monorepo** (root `package.json` met `workspaces: ["packages/*", "apps/*"]`). `npm run dev` start de admin-app op localhost:8080.

```
apps/
  admin/                @echarging/admin — de hoofd-app: ZOWEL /admin- als /portal-routes
    src/
      pages/admin/      Internal-team views (dashboard, klanten, locaties, financieel, settings, wizard)
      pages/portal/     Klant-portaal views (dashboard, sessies, financieel, gegevens, berichten)
      components/admin/ Admin-componenten (StatusBadge, financial/SettlementDetailRow, ...)
      components/portal/ Portal-componenten (CockpitGauge, NavIconBar, WarningLight, ...)
      components/ui/    shadcn/ui primitives — NIET met de hand bewerken
      hooks/            useAdminData.ts (admin queries), useClientData.ts (portal queries), useAuth, ...
      contexts/         AuthContext
      integrations/supabase/  client.ts (single client) + types.ts (generated — NIET handmatig bewerken)
      services/         calculations.ts (calculateSettlement, formatEuro), settlements.ts (RPC-wrappers),
                        invoicePdf.ts (self-billing PDF), locations.ts, clients.ts, activityLog.ts
      types/db.ts       App-types afgeleid van de generated Supabase types
  configurator/         @echarging/configurator — losse sales/offerte-app (BUITEN het settlement-model)

packages/
  pricing-engine/       @echarging/pricing-engine — getrapt marge-model VAN DE CONFIGURATOR (eigen tests).
                        NIET het settlement-model; los van de per-kWh fee. Niet aanraken voor afrekeningen.
  api-client/           @echarging/api-client
  ui-kit/               @echarging/ui-kit

supabase/
  functions/
    _shared/                auth.ts (requireAdminOrInternal), client-access.ts, configurator.ts
    eflux-sync/             Hourly cron: pull locations, EVSEs, sessions, invoices from Road API; chaint aggregate-settlements
    eflux-test-connection/  Diagnostic probes
    aggregate-settlements/  Bouwt settlements (maandelijks, per-kWh fee) uit charging_sessions
    configurator-finalize-client/  Maakt klant aan vanuit de configurator (legacy: schrijft revenue_share_percentage)
    send-client-invitation/ / accept-client-invitation/  Portal-invite flow
  migrations/                Numbered SQL migrations
```

## Data model (essentials)

```
organizations           → currently 1 row: E-Charging (multi-org-ready but unused)
  └── clients           B2B klanten (KvK, BTW-nr, contract, echarging_fee_per_kwh-override, legacy revenue_share_percentage)
        ├── client_invitations    Token-based portal invites
        ├── client_payment_details  Factuur- en bankgegevens voor uitbetaling/facturatie
        ├── locations             FK client_id; optional (unlinked = nog niet aan klant gekoppeld)
        │     └── charge_points   FK location_id; type (ac/dc), num_connectors, setup_fee fields
        ├── charging_sessions     FK client_id, location_id, charge_point_id; reimbursement_amount = bron van waarheid
        ├── tariff_profiles       Optionele per-locatie override van klant-defaults
        └── settlements           Een rij per (client_id, year, month); maandelijks; status lifecycle hieronder

eflux_invoices          Cpo-usage en cpo-credit facturen (gesynchroniseerd uit Road)
eflux_sync_log          Sync-runs (success/error per entity)
eflux_sync_state        Cursor/last_synced per resource type

profiles                Eigen profielinfo gekoppeld aan auth.users
user_roles              app_role enum: 'admin' | 'manager' | 'viewer'
activity_log            Admin audit-trail
notifications           Per-user inbox
quotes                  Sales-fase calculations (pre-klant)
```

### Settlement status lifecycle

```
live           Maand loopt nog → cijfers updaten met elke sync, klant ziet niets
calculated     Maand voorbij → admin moet goedkeuren, klant ziet niets
approved       Admin heeft akkoord gegeven → zichtbaar in portaal
  → (positief) eflux_reimbursed_at zetten ("e-Flux heeft ons betaald") → paid (uitbetaald aan klant)
  → (negatief) invoice_sent → invoice_paid (zeldzaam; alleen bij heel lage benutting)
charged_back   Legacy negatieve-afrekening pad
```

**Uitbetaling is synchroon met e-Flux:** `mark_settlements_paid` vereist dat `eflux_reimbursed_at` gezet is — we betalen de klant pas zodra e-Flux ons heeft uitbetaald. Klant ziet alleen `approved`/`paid`/`invoice_sent`/`invoice_paid`/`charged_back` in portaal.

### Sleutelvelden op settlements

```
year, month                      Periode-dimensie (uniek per client_id, year, month)
total_kwh, total_sessions        Volume uit charging_sessions
gross_revenue                    Som reimbursement_amount (= "Prijs excl BTW" van Road)
echarging_fee_per_kwh            Snapshot van toegepast tarief (default 0.10)
echarging_revenue                = echarging_fee_per_kwh × total_kwh  (onze fee, GEEN minimum)
client_payout                    = gross_revenue − echarging_revenue   (uitbetaling klant)
eflux_reimbursed_at              Moment dat e-Flux ONS heeft uitbetaald (voorwaarde voor paid)
invoice_sent_at, paid_at         Tijdstempels van de geldstroom
ere_estimate                     Informatief (via Laadbeloning, buiten onze cashflow)
```

De RPC's `approve_settlements`, `mark_settlements_eflux_reimbursed`, `mark_settlements_paid`, `mark_settlements_invoice_sent`, `mark_settlements_invoice_paid` (SECURITY DEFINER, admin/manager) sturen de transities.

## RLS-architectuur (security-kritisch)

Elke public tabel heeft RLS aan. Drie helper-functions (in schema **`app_private`**, niet `public`) sturen de checks:

| Function | Returns | Logic | SECURITY DEFINER |
|---|---|---|---|
| `app_private.has_role(user_id, role)` | bool | Bestaat er rij in `user_roles` met deze user + role | ✓ |
| `app_private.is_internal(user_id)` | bool | **Bestaat user_id überhaupt in `user_roles`** (ongeacht role) | ✓ |
| `app_private.get_client_id_for_user(user_id)` | uuid | `SELECT id FROM clients WHERE portal_user_id = user_id` | ✓ |

⚠️ **Belangrijke nuance:** `is_internal()` checkt ALLEEN of een user in `user_roles` staat — niet welke role. Dus een `viewer` ziet via `is_internal()` net zo veel als een `admin` op SELECT. Voor mutaties wordt wel expliciet op `admin`/`manager` gecheckt.

Een klant (portal-user) staat NIET in `user_roles`, dus `is_internal()` retourneert `false`. Klanten krijgen toegang via `get_client_id_for_user()` joins.

### Patroon per tabel

Voor de meeste data-tabellen (clients, locations, charge_points, charging_sessions, tariff_profiles):

1. `is_internal()` → SELECT alles
2. `has_role(admin OR manager)` → ALL (insert/update/delete)
3. Portal-user filter (`client_id = get_client_id_for_user(auth.uid())` of via locations-join) → SELECT eigen rijen

`settlements` heeft alleen SELECT-policies (intern + portal-final-status); schrijven loopt via service_role (edge function) en SECURITY DEFINER RPC's.

Edge cases:
- `locations`: extra policy zodat `is_internal()` ook **niet-gekoppelde** locaties ziet (`client_id IS NULL` pad)
- `client_invitations`: ook service_role policy (voor accept-flow vanuit edge function)
- `eflux_invoices`: alleen admins kunnen SELECTen, service_role volledige toegang
- `eflux_sync_state`: alleen service_role manageert, internal users kunnen SELECTen
- `user_roles`: users zien alleen eigen role, admins managen alles

## Edge Functions

Allemaal Deno, draaien op Supabase. Auth-handling per function:

| Function | verify_jwt | Trigger | Notes |
|---|---|---|---|
| `eflux-sync` | check current | Cron (hourly) + handmatig | Gebruikt SERVICE_ROLE_KEY voor DB writes, EFLUX_API_KEY env voor Road API |
| `aggregate-settlements` | **false** | Cron (daily 02:00 UTC) + chain vanuit eflux-sync | Service-role DB writes; chained via `invoke_edge_function()` RPC |
| `eflux-test-connection` | **false** | Handmatig (admin "Test verbinding") | Diagnostic only — exposes probe results |
| `send-client-invitation` | check current | Admin clickt "uitnodigen" | Resend email API; service-role writes to client_invitations |
| `accept-client-invitation` | depends | Public landing URL | Verifies token + links auth user → clients.portal_user_id |

⚠️ De `invoke_edge_function()` SQL helper haalt `supabase_anon_key` uit Vault en doet `net.http_post` met Bearer. Dat betekent: chained edge functions worden aangeroepen met **anon-rechten**, niet service-role. Bij `verify_jwt=false` werkt dat; bij `verify_jwt=true` zou je een geldige user-JWT moeten meegeven.

## External: Road / e-Flux API

- Base URL: `https://api.road.io`
- Auth: `Authorization: Bearer <EFLUX_API_KEY>` + `Provider: <provider_id>`
- API-key staat in **Supabase Edge Function Secrets** (env var `EFLUX_API_KEY`), niet in DB
- Provider ID staat in `organizations.eflux_provider_id`
- Belangrijkste endpoints we gebruiken:
  - `POST /1/locations/search/fast` — locaties
  - `GET /1/locations/{id}` — locatie-detail (unwrap `{data: ...}`)
  - `POST /1/evse-controllers/search/fast` — laadpalen
  - `GET /1/evse-controllers/{id}` — paal-detail met costSettings
  - `POST /2/sessions/cpo/search/fast` — sessies (max limit 100 per page)
  - `POST /1/invoices/search/fast` — facturen (summary, geen line items)
- Bron-van-waarheid voor sessie-inkomsten: `priceWithFX.originalReimbursementAmount` (excl BTW). We schrijven dat naar `charging_sessions.reimbursement_amount`.

## Commands

```bash
npm run dev          # Vite dev server op localhost:8080
npm run build        # Production build naar dist/
npm run lint         # ESLint
npm test             # Vitest run
npx tsc --noEmit     # Type-check zonder build
```

Supabase migrations + edge function deploys gebeuren via de Supabase MCP-tools (geen lokale supabase CLI flow ingesteld). Migration-bestanden in `supabase/migrations/` zijn historische snapshots.

## Conventions

- **Taal**: code in Engels, UI-strings + commentaar in Nederlands
- **Geen em-dashes** in user-facing text (vanwege Wessel's brand-stijl)
- **Bedragen in UI**: `formatEuro()` uit `services/calculations.ts` — gebruikt `nl-NL` locale, 2 decimalen, NIET afronden op hele euro's
- **kWh**: 3 decimalen in `toLocaleString("nl-NL")`
- **Datums**: `date-fns` met `nl` locale
- **Query keys**: prefixed met `admin-*` of `portal-*` per laag — zie hooks files
- **Settlements zijn `monthly`** (tabel `settlements`, kolommen `year` + `month`), niet per kwartaal
- **Status-flow op settlements:** `live` → `calculated` → `approved` → `paid` (positief, na `eflux_reimbursed_at`) of → `invoice_sent` → `invoice_paid` (negatief)

## What's recently shipped (juni 2026)

1. **Verdienmodel omgezet van revenue-share (kwartaal) naar service-fee per kWh (maandelijks).** `quarterly_settlements` → `settlements` (year+month), fee = €0,10 × kWh, geen minimum, geen energie/abonnement/opstart/split. Configurator (`pricing-engine`) bewust ongemoeid gelaten.
2. `eflux_reimbursed_at` + `mark_settlements_eflux_reimbursed`: klant wordt pas uitbetaald nadat e-Flux ons heeft betaald.
3. Self-billing factuur-PDF (`services/invoicePdf.ts`, jspdf) op approved+ afrekeningen in `AdminClientDetail`.
4. 0.10-guardtest in `services/calculations.test.ts` (faalt bij 0.001).
5. Klant-onboarding via eigen portaal: bedrijfsgegevens, factuurgegevens en IBAN in `client_payment_details`.
6. Stripe Connect / SEPA onboarding is verwijderd uit actieve code, database en live Edge Functions.

## What's NOT yet built (do not assume)

- BTW-handling — alle berekeningen zijn excl BTW
- Document-archief (`/admin/documenten`) — placeholder
- Berichten / notifications systeem — basis-tabel staat, geen UI/flow
- Editability per settlement-regel (vóór approve) — gepland, niet gebouwd
- Reconciliatie eflux invoice ↔ settlement — onderzocht, niet gebouwd
- Automatische bankbatch-export voor positieve uitbetalingen — nu markeert admin bankbetaling na verwerking
- Automatische incasso voor negatieve afrekeningen — nu via factuur/boekhouding opvolgen

## Don't do

- ❌ Hardcoded klant-IDs in code (gebruik altijd `useAuth()` of `get_client_id_for_user()`)
- ❌ Bedragen afronden naar hele euro's (Wessel vond dit expliciet onacceptabel)
- ❌ Em-dashes (`—`) in user-facing strings (brand-stijl)
- ❌ Edge function migraties via lokale supabase CLI (gebruik MCP tools)
- ❌ Directe DB queries vanuit klant-portal componenten (alles via hooks die RLS respecteren)
- ❌ De fee-constante als `0.001` schrijven — het is `0.10` (tien cent per kWh). De vitest bewaakt dit.
- ❌ De configurator (`packages/pricing-engine`) verwarren met het settlement-model — dat is een aparte sales-tool.
