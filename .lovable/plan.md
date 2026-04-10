

# Gauges aanpassen: groter + realistische kWh

## Wijzigingen

### 1. Kleine gauges groter maken (`GaugeChart.tsx`)
De `sm` variant wordt opgeschaald zodat labels meer ruimte krijgen:
- `svgSize`: 180 → **220**
- `radius`: 65 → **80**
- `needleLength`: 42 → **55**
- `cy`: 92 → **110**
- Font sizes proportioneel mee omhoog (value 16→18, unit 11→12)
- Label text `text-xs` → `text-sm`

### 2. Realistische kWh fallback waarde (`ClientDashboard.tsx`)
De fallback van 650 kWh is te laag bij een opbrengst van €1.380. Bij een gemiddeld tarief van ~€0,40/kWh zou ~3.450 kWh realistisch zijn. Ook de `avgKwh` fallback in `useClientData.ts` moet omhoog.

- `ClientDashboard.tsx` regel 30: fallback `650` → **3500**
- `useClientData.ts` regel 100: fallback `800` → **3000**

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/components/portal/GaugeChart.tsx` | sm-variant groter maken |
| `src/pages/portal/ClientDashboard.tsx` | kWh fallback naar 3500 |
| `src/hooks/useClientData.ts` | avgKwh fallback naar 3000 |

