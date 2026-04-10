

# Batch 7: Klantportaal Uitbouwen

## Analyse

Het klantportaal heeft al werkende pagina's (Dashboard, Sessies, Financieel, Profiel, Berichten). De volgende verbeteringen zijn nodig:

1. **Locatie detailpagina ontbreekt** — Dashboard linkt naar `/portal/locatie/:id` maar die route bestaat niet
2. **Sessies missen filters** — geen datum-filter, geen pagination
3. **Financieel mist KPI-samenvatting** — alleen kaarten per maand, geen totaaloverzicht bovenaan
4. **Portal user koppeling** — slechts 1 van 5 klanten heeft een `portal_user_id` gekoppeld

## Wijzigingen

### 1. Nieuwe pagina: `ClientLocationDetail.tsx`

Locatie detailpagina met:
- Locatie-info (naam, adres, stad, postcode, type, zonnepanelen)
- Laadpunten overzicht met status-indicators per punt
- Recente sessies voor deze locatie (laatste 20)

### 2. `ClientSessions.tsx` — Uitbreiden

- Datum-filter: "Laatste 7 dagen", "Laatste 30 dagen", "Laatste 3 maanden", "Alles"
- Laadpunt-filter dropdown (naast zoek)
- Pagination (20 per pagina) met prev/next knoppen
- Totaalrij onderaan: som kWh, som bruto, som opbrengst

### 3. `ClientFinancial.tsx` — Uitbreiden

- KPI-rij bovenaan: Totaal uitbetaald, Totaal ERE, Gemiddelde maandopbrengst
- Status-filter: alle / berekend / goedgekeurd / uitbetaald
- Betalingsgeschiedenis tabel-weergave als alternatief voor kaarten

### 4. Routes toevoegen in `App.tsx`

- `/portal/locatie/:id` → `ClientLocationDetail`

### 5. `useClientData.ts` — Uitbreiden

- `useClientLocationDetail(locationId)` — locatie + charge_points
- `useClientSessionsFiltered(clientId, filters)` — sessies met datum en laadpunt filters

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/pages/portal/ClientLocationDetail.tsx` | Nieuw |
| `src/pages/portal/ClientSessions.tsx` | Uitbreiden met filters + pagination |
| `src/pages/portal/ClientFinancial.tsx` | Uitbreiden met KPIs + filter |
| `src/hooks/useClientData.ts` | + location detail hook |
| `src/App.tsx` | + route `/portal/locatie/:id` |

Geen database migraties nodig.

