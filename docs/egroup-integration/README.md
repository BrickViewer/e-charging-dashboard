# Installatie-koppeling: E-Charging ⇄ E-Group portal

Doorzetten van getekende offertes als installatie-opdrachten naar de E-Group
portal, met live statusterugkoppeling. Twee aparte Supabase-projecten:

| Systeem | Supabase ref |
|---|---|
| E-Charging dashboard | `uuldldhmuanmjlyvnagt` |
| E-Group portal | `natxaneygihzzszabmcv` |

## Flow

1. Offerte wordt getekend → `installation_orders`-rij (status `nieuw`) in E-Charging.
2. Sales opent **Installaties**, vult zo nodig het site-adres aan en klikt **"Versturen opdracht"**.
3. E-Charging `order-handoff` POST't naar E-Group `intake-external-order` (Contract 1).
   E-Group maakt organisatie + project + order (`service_category='e_charging'`,
   `source='e_charging_dashboard'`, `external_system='e-charging'`, `external_reference`)
   + order-regels aan, en geeft `{order_id, order_number}` terug.
4. E-Charging bewaart `egroup_order_id/number`, zet status op `overgedragen`.
5. Elke statuswijziging van die order in E-Group triggert (`pg_net`) een callback naar
   E-Charging `installation-completion-webhook` (Contract 2) → het Installaties-overzicht
   loopt mee (ingepland / geinstalleerd / afgerond + `completed_at`).

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

De Vault-waarden zijn gezet via MCP; de gebruiker kan desgewenst env-secrets zetten
(die krijgen voorrang). Secret-lezen gaat via de service-role-only RPC
`get_integration_secret(p_name)` (geweigerd voor anon/authenticated).

## Componenten

**E-Charging (deze repo):**
- `supabase/migrations/20260616090000_installation_orders_egroup_sync.sql`
- `supabase/functions/order-handoff/` (index.ts + egroup-api.ts) — handoff
- `supabase/functions/installation-completion-webhook/` — inbound statusterugkoppeling
- `supabase/functions/_shared/installationHandoff.ts` + `secrets.ts` (+ app-twin `src/services/installationHandoff.ts` met vitest)
- `apps/admin/src/pages/sales/SalesInstallations.tsx` + `hooks/useInstallations.ts`

**E-Group (gebouwd via MCP; referentie in deze map):**
- `egroup-backend.sql` — kolommen, enum-waarde, completion-trigger, secret-RPC
- `intake-external-order.ts` — intake edge function (verify_jwt=false)
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
  "contact": { "name": "...", "email": "...", "phone": "...", "role": "..." },
  "order_lines": [ { "description": "...", "qty": 10, "unit_price": 950, "total": 9500 } ],
  "totals": { "hardware_cost": 9500, "installation_cost": 4500, "with_management": true }
}
```
Respons: `{ "order_id": "<uuid>", "order_number": "OPD-00023" }`

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

## Geverifieerd (E2E via MCP, daarna opgeruimd)

Intake maakte org/project/order/2 regels met correcte tagging; statuswijziging
`ingepland` → `afgerond` in E-Group spiegelde via de trigger naar E-Charging
(`afgerond` + `completed_at`); foute secret → 401 op beide webhooks; de
secret-RPC weigert anon (42501).
