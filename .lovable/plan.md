

# Kleine gauges omvormen naar zelfde stijl als XL

De twee kleine meters (sm) krijgen exact dezelfde visuele stijl als de grote middelste meter — een circulaire arc met glow-dot, zonder naald en zonder streepjes. Alleen kleiner.

## Wijzigingen in `src/components/portal/GaugeChart.tsx`

### SM variant herschrijven
Vervang de huidige "classic needle gauge" (regels 227-382) door een verkleinde versie van de XL renderer:

- **Verwijderen:** naald, center dot, tick marks
- **Toevoegen:** zelfde circulaire arc + glow-dot als XL
- **Afmetingen SM:** `svgSize: 180`, `radius: 70`, `strokeW: 2.5`
- **Value font:** 22px bold (kleiner dan XL's 56px)
- **Unit font:** 11px
- **Label:** `text-xs` (was `text-sm`), met `mt-0` voor strakke afstand

### Resultaat
Alle drie de meters hebben identieke vormgeving (arc + dot), verschil zit alleen in schaal. Geen naald, geen ticks, geen center dot bij de kleine meters.

| Element | XL (midden) | SM (links/rechts) |
|---------|------------|-------------------|
| svgSize | 320 | 180 |
| radius | 130 | 70 |
| value font | 56px | 22px |
| unit font | 14px | 11px |
| label | text-sm | text-xs |
| arc stroke | 4px | 2.5px |

