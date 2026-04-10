

# Batch 4: Laadpunten Overzicht — Herschrijven

## Overzicht

Herschrijf `AdminChargePoints.tsx` tot een volwaardig monitoring dashboard met KPI-kaarten, extra filters (locatie, klant), connectiviteitsindicatoren, debounced zoek, en pagination.

## Wijzigingen

### `AdminChargePoints.tsx` — Herschrijven

**KPI-rij bovenaan (4 kaarten):**
- Totaal laadpunten
- Online (groen)
- Offline/Error (rood)
- In gebruik (blauw)

Berekend uit de opgehaalde data.

**Filters uitbreiden:**
- Debounced zoek (hergebruik `useDebouncedValue`)
- Status filter (bestaand, behouden)
- Klant filter — dropdown gevuld met unieke `clients.company_name` uit de data
- Locatie filter — dropdown gevuld met unieke `locations.name`, gefilterd op geselecteerde klant

**Tabel uitbreiden:**
- Kolommen: Laadpunt | Locatie | Klant | Type | Merk/Model | Connectiviteit | Status
- Connectiviteit kolom: gebruik `ConnectivityIndicator` component met `connectivity_state`
- Status kolom: vertaalde labels (online→Online, in_use→In gebruik, offline→Offline, error→Storing)
- Pagination (20 rijen/pagina) met prev/next knoppen
- Skeleton loader tijdens laden
- Lege state met icon en tekst

**Geen nieuwe hooks nodig** — `useAllChargePoints` levert alle data inclusief `locations(name, address, client_id, clients(company_name))`.

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/pages/admin/AdminChargePoints.tsx` | Herschrijven |

Geen database migraties nodig.

