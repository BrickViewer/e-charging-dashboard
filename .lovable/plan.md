

## Plan: Alle sample data consistent en realistisch maken

### Analyse huidige problemen
Na de 6.79x schaling zijn de data intern inconsistent:

| Gegeven | Huidig | Probleem |
|---------|--------|----------|
| Settlement `client_payout` | ~€1.000/mnd | OK (doel) |
| Settlement `gross_revenue` | ~€5.700 | Klopt niet met kWh × €0,45 tarief |
| Settlement `total_kwh` | ~1.750 | Te laag voor €1.000 opbrengst |
| Settlement `platform_cost` | €522,83 | Moet €77 zijn (14 × €5,50) |
| Session financials | Niet geschaald | Matchen niet met settlements |
| Session `total_sessions` | ~44/mnd | Te laag voor 14 laadpunten |

### Realistische doelwaarden (14 laadpunten, tarief €0,45/€0,24/€0,10)

Om ~€1.000 client payout te halen:
- **~9.500 kWh/maand** nodig (680 kWh per laadpunt, ~1u laden per dag bij 22kW)
- **~380 sessies/maand** (~27/dag over 14 punten, ~2 per punt)
- **Platform cost**: 14 × €5,50 = **€77**
- gross_revenue = kWh × €0,45, energy_cost = kWh × €0,24
- net_margin = gross - energy - platform, client_payout = 50%

### Stappen

**1. Monthly settlements herberekenen**
- `total_kwh`: schalen naar ~8.500-11.000 range (variatie per maand, seizoenspatroon)
- `total_sessions`: ~300-450 per maand
- Alle financials herberekenen vanuit kWh × tarieven:

```
gross_revenue    = total_kwh × 0.45
total_energy_cost = total_kwh × 0.24
total_platform_cost = 77.00
net_margin       = gross - energy - platform
client_payout    = net_margin × 0.50
echarging_revenue = net_margin × 0.50
ere_estimate     = total_kwh × 0.10
```

**2. Charging sessions herberekenen**
- Bestaande 560 sessies: `kwh_delivered` schalen (~5.5x) zodat maandtotaal matcht met settlement kWh
- Sessie-financials herberekenen vanuit kWh × tarieven:

```
gross_revenue  = kwh_delivered × 0.45
energy_cost    = kwh_delivered × 0.24
net_margin     = gross - energy
client_share   = net_margin × 0.50
echarging_share = net_margin × 0.50
ere_estimate   = kwh_delivered × 0.10
```

- Per sessie gemiddeld ~100-170 kWh (plausibel voor 22kW werkplek/nachtladen, 5-8 uur)

**3. Code: `useClientData.ts`**
- `avgEarnings` fallback terugzetten naar dynamische berekening (als dat nog niet is gedaan)

### Resultaat
- Alle getallen kloppen onderling: kWh × tarief = omzet
- Dashboard gauges tonen correct ~€1.000 gemiddeld
- Opbrengstgrafiek toont realistische bedragen
- Sessie-overzicht toont correcte per-sessie bedragen
- Platform kosten zijn realistisch (€77 i.p.v. €522)

### Uitvoering
Via SQL UPDATE statements op `monthly_settlements` en `charging_sessions` tabellen.

