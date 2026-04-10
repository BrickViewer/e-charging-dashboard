

# E-Charging Platform — Fix & Complete Plan

Dit plan voert alle gevraagde wijzigingen door in de opgegeven volgorde. Het is een groot plan met 9 stappen.

---

## Stap 1: Database — Foreign Keys Migration

**Bestand:** `supabase/migrations/` (nieuwe migration)

SQL migration die:
1. Orphan records verwijdert (DELETE statements voor inconsistente referenties)
2. Alle 12 foreign key constraints toevoegt met `DO $$ ... EXCEPTION WHEN duplicate_object` pattern om bestaande constraints te skippen
3. CASCADE op `locations.client_id` en `charge_points.location_id`

---

## Stap 2: Database — Activity Log Demodata

Via Supabase insert tool: 12 activity_log entries verspreid over 4 maanden, gekoppeld aan bestaande clients (Van der Berg, Zorggroep Brabant, Parkstad, Hendriksen) en de organization.

---

## Stap 3: TypeScript Types — `src/types/eflux.ts`

Nieuw bestand met alle Road.io API interfaces zoals opgegeven: `RoadCPOSession`, `RoadEVSEController`, `RoadConnector`, `RoadCostSetting`, `RoadLocation`, `RoadProvider`, `RoadEvseOperationalStatus`, search params, pagination, API response/error types, en mapping helpers (`mapRoadSessionToInternal`, `mapRoadEVSEToInternal`).

---

## Stap 4: Instellingen Pagina Herbouwen

**Bestand:** `src/pages/admin/AdminSettings.tsx` — volledig herschrijven

4 tabs met bewerkbare formulieren:

| Tab | Functionaliteit |
|-----|----------------|
| **Bedrijf** | Naam, KVK, adres, telefoon, email, logo URL → opslaan naar `organizations` |
| **Standaardwaarden** | 6 tarief-velden → opslaan naar `organizations` |
| **Gebruikers** | Tabel uit `profiles` met naam, email, rol badge. "Uitnodigen" knop disabled |
| **API** | Password-type velden voor Road.io key, Stripe keys. "Test verbinding" disabled |

Laadt data via `useOrganization()`, slaat op via `supabase.from('organizations').update(...)`. Success toast na opslaan. Gebruikers-tab haalt profiles op via aparte query.

---

## Stap 5: Klant Bewerken

**Bestand:** `src/pages/admin/AdminClientDetail.tsx`

- "Bewerken" knop (Pencil icoon) in de header
- Toggle state `isEditing` — in edit-mode worden de klantgegevens-velden inputs
- Bewerkbare velden: bedrijfsnaam, KVK, contactpersoon, email, telefoon, factuuradres, contract-gegevens, tarieven
- "Opslaan" en "Annuleren" knoppen
- Na opslaan: update client record, log activity entry, success toast, terug naar view-mode
- Invalidate query cache zodat data ververst

---

## Stap 6: "Maak klant aan" vanuit Calculator

**Bestand:** `src/pages/admin/AdminCalculator.tsx`

- Tweede knop naast "Maak offerte": "Maak klant aan" (UserPlus icoon, variant outline)
- Navigate naar `/admin/klanten/nieuw` met state: `{ fromCalculator: true, chargeRate, energyCost, revenueShare, ereRate, numChargePoints, chargePointType }`

**Bestand:** `src/pages/admin/AdminClientWizard.tsx`
- Lees `location.state` bij mount
- Pre-fill stap 3 (aantal laadpunten, type) en stap 4 (tarieven) als `fromCalculator` state aanwezig is

---

## Stap 7: "Maak klant aan vanuit offerte"

**Bestand:** `src/pages/admin/AdminQuoteDetail.tsx`

- Als `quote.status === 'getekend'`: toon groene "Klant aanmaken vanuit offerte" knop (UserPlus icoon)
- Navigate naar `/admin/klanten/nieuw` met state: prospect-gegevens (stap 1), laadpunten (stap 3), tarieven (stap 4), quote_id

**Bestand:** `src/pages/admin/AdminClientWizard.tsx`
- Lees `fromQuote` state, pre-fill relevante stappen
- Na aanmaken: update quote met nieuwe `client_id`

---

## Stap 8: Laadpunt Detail View

**Bestand:** `src/pages/admin/AdminChargePoints.tsx`

- Maak tabelrijen klikbaar → open een Sheet (slide-over van rechts)
- Sheet toont: naam, locatie+klant, type, merk/model, serienummer, MID-meter, connectivity state met indicator, laatste heartbeat, max vermogen, aantal connectors
- Recente sessies sectie: laatste 10 sessies van dit laadpunt (via `charging_sessions` query gefilterd op `charge_point_id`)
- e-Flux IDs sectie: bewerkbare EVSE Controller ID en EVSE ID velden met opslaan-knop

Nieuwe query `useChargePointSessions(cpId)` in `useAdminData.ts`.

---

## Stap 9: Service Laag (als tijd het toelaat)

Nieuwe service-bestanden:
- `src/services/clients.ts`
- `src/services/locations.ts`
- `src/services/chargePoints.ts`
- `src/services/sessions.ts`
- `src/services/settlements.ts`
- `src/services/quotes.ts`
- `src/services/activityLog.ts`
- `src/services/organizations.ts`

Elk bestand bevat de Supabase queries die nu in hooks staan. De hooks (`useAdminData.ts`, `useClientData.ts`) worden gerefactored om uit services te importeren. Dit is de minst urgente stap — kan ook v1.1 zijn.

---

## Samenvatting bestanden

| Bestand | Actie |
|---------|-------|
| `supabase/migrations/` | Nieuwe migration: FK constraints |
| Activity log data | Insert via tool |
| `src/types/eflux.ts` | Nieuw |
| `src/pages/admin/AdminSettings.tsx` | Volledig herschrijven |
| `src/pages/admin/AdminClientDetail.tsx` | Edit functionaliteit toevoegen |
| `src/pages/admin/AdminCalculator.tsx` | "Maak klant" knop |
| `src/pages/admin/AdminQuoteDetail.tsx` | "Maak klant vanuit offerte" knop |
| `src/pages/admin/AdminClientWizard.tsx` | Pre-fill vanuit calculator/offerte state |
| `src/pages/admin/AdminChargePoints.tsx` | Klikbare rijen + detail Sheet |
| `src/hooks/useAdminData.ts` | Nieuwe query voor CP sessies |
| `src/services/*.ts` | 8 nieuwe service-bestanden (stap 9) |

