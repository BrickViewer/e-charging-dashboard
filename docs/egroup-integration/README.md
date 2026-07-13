# Installatie-koppeling: E-Charging ⇄ E-Group portal

Doorzetten van getekende offertes als installatie-opdrachten naar de E-Group
portal, met live statusterugkoppeling. Twee aparte Supabase-projecten:

| Systeem | Supabase ref |
|---|---|
| E-Charging dashboard | `uuldldhmuanmjlyvnagt` |
| E-Group portal | `natxaneygihzzszabmcv` |

## Flow

1. Offerte wordt getekend → `installation_orders`-rij (status `nieuw`) in E-Charging.
2. Sales start de **werkvoorbereiding** (onboarding-bord): de RPC `start_work_preparation`
   seedt de materialen-checklist uit de calculatie (`installation_order_materials`,
   status per materiaal: niet_nodig / te_bestellen / besteld / binnen). Doorsturen kan
   pas als niets meer op `te_bestellen` staat (gate in `order-handoff`).
3. E-Charging `order-handoff` POST't naar E-Group `intake-external-order` (Contract 1).
   E-Group maakt organisatie + project + order (`service_category='e_charging'`,
   `source='e_charging_dashboard'`, `external_system='e-charging'`, `external_reference`)
   + order-regels aan, en geeft `{order_id, order_number}` terug.
4. E-Charging bewaart `egroup_order_id/number`, zet status op `overgedragen`, en pusht
   best-effort direct de geaggregeerde materiaalstatus (Contract 3).
5. Elke statuswijziging van die order in E-Group triggert (`pg_net`) een callback naar
   E-Charging `installation-completion-webhook` (Contract 2) → het Installaties-overzicht
   loopt mee (ingepland / geinstalleerd / afgerond + `completed_at`).
6. Elke materiaal-mutatie ná de handoff (bv. "binnen" melden) triggert vanuit de
   frontend best-effort `order-material-sync` → E-Group `sync-material-status`
   (Contract 3) → de planner ziet `order_lines.preparation_status` (+ verwachte
   leverdatum en notitie) live meelopen. E-Charging is de bron van waarheid; de
   sync stuurt het volledige AGGREGAAT en is dus laatste-wint/idempotent — een
   gemiste push wordt door de eerstvolgende mutatie of de retry-knop hersteld
   (`installation_orders.last_sync_error` / `materials_synced_at`).

## Aggregatieregel materiaalstatus (E-Charging → één fase per opdracht)

"Slechtste toestand wint"; `niet_nodig` is neutraal. Geen (relevante) materialen →
`niet_nodig`; anders één regel `te_bestellen` → `te_bestellen`; anders één regel
`besteld` → `besteld`; anders (alles binnen) → `binnen`.
Implementatie: `aggregatePreparationStatus` in `_shared/installationHandoff.ts`
(+ unit-geteste app-twin).

## Statusmapping (E-Group → E-Charging)

| E-Group `order_status` | E-Charging `status` | completed_at |
|---|---|---|
| bevestigd / te_plannen | overgedragen | — |
| ingepland | ingepland | — |
| in_uitvoering | geinstalleerd | — |
| gereed / afgerond | afgerond | gezet |

## Secrets (Vault op beide projecten; edge functions lezen env-first, anders Vault)

| Doel | E-Charging (env / Vault-naam) | E-Group (env / Vault-naam) |
|---|---|---|
| Intake-URL | `EGROUP_INTAKE_URL` / `egroup_intake_url` | n.v.t. |
| Intake-auth (handoff → intake) | `EGROUP_SHARED_SECRET` / `egroup_shared_secret` | `ECHARGING_SHARED_SECRET` / `echarging_intake_secret` |
| Callback-auth (E-Group → webhook) | `EGROUP_WEBHOOK_SECRET` / `egroup_webhook_secret` | (Vault) `echarging_webhook_secret` |
| Materiaalsync-URL (optionele override) | `EGROUP_MATERIAL_SYNC_URL` / `egroup_material_sync_url` | n.v.t. |

De materiaalsync-URL wordt standaard **afgeleid** uit de intake-URL (zelfde
functions-domein, laatste padsegment → `sync-material-status`); de override hoeft
alleen gezet te worden als de endpoints ooit uiteenlopen. Auth van de materiaalsync
hergebruikt het intake-secret-paar (één rotatiepunt).

De Vault-waarden zijn gezet via MCP; de gebruiker kan desgewenst env-secrets zetten
(die krijgen voorrang). Secret-lezen gaat via de service-role-only RPC
`get_integration_secret(p_name)` (geweigerd voor anon/authenticated).

## Componenten

**E-Charging (deze repo):**
- `supabase/migrations/20260616090000_installation_orders_egroup_sync.sql`
- `supabase/migrations/20260714100000_work_preparation_materials.sql` — werkvoorbereiding (materialen-tabel + RPC + prep-kolommen)
- `supabase/functions/order-handoff/` — handoff (incl. werkvoorbereiding-gate + initiële materiaalpush)
- `supabase/functions/order-material-sync/` — outbound materiaalstatus-sync (Contract 3)
- `supabase/functions/installation-completion-webhook/` — inbound statusterugkoppeling
- `supabase/functions/_shared/installationHandoff.ts` + `egroup-api.ts` + `materialSync.ts` + `secrets.ts` (+ app-twin `src/services/installationHandoff.ts` met vitest)
- `apps/admin/src/pages/sales/SalesOnboarding.tsx` + `components/sales/OnboardingMaterialsDialog.tsx` + `hooks/useOrderMaterials.ts` + `hooks/useInstallations.ts`

**E-Group (gebouwd via MCP; referentie in deze map — de live deploy is de bron
van waarheid, bij wijzigen de kopie mee-updaten):**
- `egroup-backend.sql` — kolommen, enum-waarde, completion-trigger, secret-RPC
- `intake-external-order.ts` — intake edge function (verify_jwt=false). **Let op:**
  live draait v5 met de atomaire SECURITY DEFINER RPC `create_external_order`
  (order + regels + `external_order_mirrors` in één transactie); haal bij twijfel
  de actuele bron op via MCP `get_edge_function`.
- `sync-material-status.ts` — materiaalstatus-sync edge function (verify_jwt=false, Contract 3)
- Frontend-tagging: zie `egroup-frontend-prompt.md` (door E-Group-team uit te voeren)

## Contracten

**Contract 1 — Handoff (E-Charging → E-Group `intake-external-order`)**
```json
{
  "external_reference": "<installation_orders.id>",
  "external_system": "e-charging",
  "service_category": "e_charging",
  "source": "e_charging_dashboard",
  "quote_number": "OFF-2026-00012",
  "service_summary": "10 laadpunten - AC 22kW",
  "notes": "Vanuit getekende offerte OFF-2026-00012",
  "callback_url": "https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/installation-completion-webhook",
  "customer": { "name": "...", "organization_type": "bedrijf", "kvk_number": "...", "vat_number": "...", "email": "...", "phone": "...", "street": "...", "house_number": "...", "postal_code": "...", "city": "...", "country": "NL", "client_number": 142 },
  "site": { "location_name": "...", "street": "...", "house_number": "...", "postal_code": "...", "city": "...", "country": "NL" },
  "contact": { "name": "...", "email": "...", "phone": "..." },        // back-office/administratie (uit de klant)
  "site_contact": { "name": "...", "phone": "...", "email": "..." },   // contactpersoon op locatie (uit het bewerkbare site-snapshot)
  "order_lines": [ { "description": "...", "qty": 10, "unit_price": 950, "total": 9500 } ],
  "totals": { "hardware_cost": 9500, "installation_cost": 4500, "with_management": true },
  "billing": { "invoiced_by": "e_charging", "e_portal_creates_invoice": false }  // facturering door e-charging; E-Portal maakt GEEN klantfactuur
}
```
Respons: `{ "order_id": "<uuid>", "order_number": "OPD-00023" }`

> **Facturering:** `billing.e_portal_creates_invoice` staat altijd op `false`. Facturen worden door e-charging verstuurd en beheerd (settlements-flow), niet door de E-Portal. De E-Portal voert alleen de installatie/werkbon uit. `site_contact.phone` valt terug op het algemene klantcontact als het site-snapshot leeg is (zodat het telefoonnummer niet leeg binnenkomt). Dedupliceer op `external_reference` (= `installation_orders.id`) en respecteer de `Idempotency-Key`-header zodat een herhaalde POST geen dubbele opdracht aanmaakt.

**Contract 2 — Completion-callback (E-Group → E-Charging `installation-completion-webhook`)**
```json
{
  "external_reference": "<installation_orders.id>",
  "egroup_order_id": "<orders.id>",
  "egroup_order_number": "OPD-00023",
  "status": "afgerond",
  "completed_at": "2026-06-20T14:30:00Z"
}
```
Header `x-echarging-secret`. Respons: `200 {"status":"ok"}`.

**Contract 3 — Materiaalstatus-sync (E-Charging `order-material-sync` → E-Group `sync-material-status`)**
```json
{
  "external_reference": "<installation_orders.id>",
  "preparation_status": "besteld",            // niet_nodig | te_bestellen | besteld | binnen (aggregaat)
  "materials_expected_at": "2026-07-28",      // of null — verwachte leverdatum voor de planner
  "preparation_notes": "Meterkast levert week 31"  // of null
}
```
Header `x-echarging-secret` (zelfde secret als intake). Full-state en laatste-wint:
elke call bevat de complete actuele staat en is idempotent. E-Group update ALLE
`order_lines` van de opdracht (order-brede semantiek; e-charging-orders hebben er
precies één), strikt gescoped op `source='e_charging_dashboard'`.
Respons: `200 {"status":"ok","order_id":"…","order_number":"OPD-…","lines_updated":1}`;
onbekende reference → `404 {"status":"not_found"}` (voor E-Charging niet fataal:
landt in `last_sync_error`).

## Geverifieerd (E2E via MCP, daarna opgeruimd)

Intake maakte org/project/order/2 regels met correcte tagging; statuswijziging
`ingepland` → `afgerond` in E-Group spiegelde via de trigger naar E-Charging
(`afgerond` + `completed_at`); foute secret → 401 op beide webhooks; de
secret-RPC weigert anon (42501).

Materiaalsync (2026-07-13): foute secret → 401; onbekende reference → 404 zonder
mutatie; synthetische order + regel → Contract 3 2× gepost (idempotent, `lines_updated: 1`),
`preparation_status/materials_expected_at/preparation_notes` correct geland; testdata
verwijderd (0 rijen over). `start_work_preparation` + org-autofill-trigger + freeze-
onafhankelijkheid geverifieerd in een transactie met rollback op E-Charging.
