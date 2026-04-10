

## Plan: Settlement bedragen opschalen naar ~€1.000 gemiddeld

### Probleem
De `monthly_settlements` tabel bevat voor client `10000000-0000-0000-0000-000000000001` een gemiddelde `client_payout` van €147,29. De berekening in de code is correct, maar de data zelf is te laag.

### Oplossing
Alle financiele kolommen in `monthly_settlements` voor deze client vermenigvuldigen met factor **6.79** (≈ 1000 / 147.29). Dit betreft:

- `client_payout`
- `echarging_revenue`
- `gross_revenue`
- `net_margin`
- `ere_estimate`
- `total_energy_cost`
- `total_platform_cost`

`total_kwh` en `total_sessions` blijven ongewijzigd (energie-volumes hoeven niet mee te schalen).

### SQL (via insert tool)
```sql
UPDATE monthly_settlements
SET
  client_payout = client_payout * 6.79,
  echarging_revenue = echarging_revenue * 6.79,
  gross_revenue = gross_revenue * 6.79,
  net_margin = net_margin * 6.79,
  ere_estimate = ere_estimate * 6.79,
  total_energy_cost = total_energy_cost * 6.79,
  total_platform_cost = total_platform_cost * 6.79
WHERE client_id = '10000000-0000-0000-0000-000000000001';
```

### Resultaat
- Gemiddelde `client_payout` wordt ~€1.000/maand
- De gauge toont correct: halve boog bij gemiddelde, meer bij hogere maanden
- De opbrengst-grafiek toont realistische bedragen
- De fallback in `useClientData.ts` kan weer terug naar de dynamische berekening (geen hardcode nodig)

### Ook aanpassen
- **`src/hooks/useClientData.ts`**: De hardcoded `avgEarnings = 1000` terugzetten naar de originele berekening uit de database, zodat het gemiddelde dynamisch blijft.

### Bestanden
| Wat | Actie |
|-----|-------|
| `monthly_settlements` data | UPDATE financiele kolommen × 6.79 |
| `src/hooks/useClientData.ts` | `avgEarnings` terug naar dynamische berekening |

