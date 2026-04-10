

# Kleine gauges iets groter maken

## Wijziging in `src/components/portal/GaugeChart.tsx`

Regel 228-232 — SM variant opschalen:

| Eigenschap | Nu | Nieuw |
|---|---|---|
| `smSvgSize` (sm) | 180 | 210 |
| `smRadius` (sm) | 70 | 82 |
| `smStrokeW` (sm) | 2.5 | 2.5 |
| Value font (sm) | 22px | 26px |
| Unit font (sm) | 11px | 12px |

LG variant blijft ongewijzigd (220/85). Alleen de `sm` variant wordt groter.

