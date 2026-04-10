

# Batch 3: Klanten CRUD — Lijst, Wizard, Detailpagina

## Overzicht

Drie pagina's volledig bouwen:
1. **AdminClients** — herschrijven met statusfilter, debounced zoek, pagination, `created_at` kolom, klikbare rijen
2. **AdminClientWizard** — 5-staps stepper met formulieren die client + locations + charge_points + tarief aanmaken
3. **AdminClientDetail** — header met status + 5 tabs (Overzicht, Locaties, Financieel, Documenten, Activiteit)

Plus: nieuwe data hooks en een herbruikbaar StepperWizard component.

---

## 1. Klantenlijst (`AdminClients.tsx`) — herschrijven

- Statusfilter dropdown (alle/prospect/offerte/actief/inactief) naast zoekbalk
- Debounced zoek (300ms) via `useDebouncedValue` hook
- Kolommen: Bedrijf | Contact | Locaties | Laadpunten | Status | Aangemaakt
- StatusBadge component voor status kolom
- Pagination (20 rijen/pagina) met simpele prev/next knoppen
- Klikbare rijen → navigeer naar `/admin/klanten/:id`
- Skeleton loader tijdens laden

## 2. Stepper component (`src/components/admin/StepperWizard.tsx`) — nieuw

- Herbruikbaar component: bolletjes + lijnen, actieve/voltooide/toekomstige states
- Props: `steps: string[]`, `currentStep: number`
- Groen voor voltooid, primary ring voor actief, grijs voor toekomstig

## 3. Klant Wizard (`AdminClientWizard.tsx`) — volledig bouwen

5 stappen met state management via `useState`:

**Stap 1 — Klantgegevens:**
- Bedrijfsnaam*, KVK, Contactpersoon*, E-mail*, Telefoon
- Factuuradres (straat, postcode, stad) — split fields

**Stap 2 — Locaties:**
- Dynamisch: meerdere locaties toevoegen/verwijderen
- Per locatie: Naam, Adres, Postcode, Stad, Pandtype (dropdown), Parkeerplaatsen, EAN, Solar toggle + capaciteit

**Stap 3 — Laadpunten per locatie:**
- Tabs per locatie
- Aantal laadpunten input → auto-genereer rijen
- Per rij: Naam (auto LP-001 etc), Type (AC 11kW/AC 22kW/DC 50kW), Merk, Model

**Stap 4 — Tariefstructuur:**
- Laadtarief/kWh, Energiekost/kWh, Revenue share %, ERE tarief/kWh
- Live preview: maandelijkse schatting via `calculateMonthly()`

**Stap 5 — Overzicht & Bevestigen:**
- Samenvatting alle data in read-only cards
- "Wijzig" links per sectie → spring terug naar die stap
- "Opslaan" knop: insert client → insert locations → insert charge_points → insert tariff_profile
- Activity log entry aanmaken
- Na succes: navigeer naar `/admin/klanten/:id`

## 4. Klantdetail (`AdminClientDetail.tsx`) — volledig bouwen

**Header:**
- Bedrijfsnaam, StatusBadge, "Bewerken" knop (toggle inline edit mode)
- Terug-link naar klantenlijst

**Nieuwe hooks** in `useAdminData.ts`:
- `useClientById(id)` — client + locations + charge_points
- `useClientSettlements(clientId)` — settlements voor deze klant
- `useClientActivity(clientId)` — activity_log entries
- `useClientSessions(clientId)` — charging sessions

**5 Tabs:**

**Tab 1 — Overzicht:**
- Klantgegevens card (bedrijf, KVK, contact, adres)
- Contract card (startdatum, duur, revenue share, status)
- Stripe status card (onboarding status)
- Quick stats: totaal kWh, totaal omzet, aantal sessies

**Tab 2 — Locaties & Laadpunten:**
- Per locatie een uitklapbaar Card (Collapsible)
- Locatie-info: adres, pandtype, solar, parkeerplaatsen
- Laadpunten tabel per locatie: naam, type, status (ConnectivityIndicator), laatste heartbeat
- "Locatie toevoegen" knop

**Tab 3 — Financieel:**
- KPI-rij: totaal uitbetaald, lopende maand, gem. marge
- Settlements tabel per maand met StatusBadge

**Tab 4 — Documenten:**
- Placeholder upload area (geen storage bucket implementatie)
- "Binnenkort beschikbaar" melding

**Tab 5 — Activiteit:**
- Chronologische lijst uit activity_log gefilterd op client_id
- Datum, actie, beschrijving per regel

## 5. Debounce hook (`src/hooks/useDebouncedValue.ts`) — nieuw

Simpele hook: `useDebouncedValue<T>(value: T, delay: number): T`

---

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/hooks/useDebouncedValue.ts` | Nieuw |
| `src/components/admin/StepperWizard.tsx` | Nieuw |
| `src/pages/admin/AdminClients.tsx` | Herschrijven |
| `src/pages/admin/AdminClientWizard.tsx` | Herschrijven |
| `src/pages/admin/AdminClientDetail.tsx` | Herschrijven |
| `src/hooks/useAdminData.ts` | Uitbreiden (4 nieuwe hooks) |

Geen database migraties nodig — alle tabellen en kolommen bestaan al.

