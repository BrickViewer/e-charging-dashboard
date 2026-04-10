

## Gauge Polish — Perfecte Snelheidsmeters

### Problemen die worden opgelost

1. **XL gauge (midden)**: Euro bedrag te klein (fontSize 42 → 56), en de progress arc vult de hele boog — moet stoppen bij de positie t.o.v. gemiddelde
2. **SM gauges (links/rechts)**: Tekst en waarde lopen over de gauge heen, getallen te klein, naald staat te dicht op het getal
3. **Hover op gemiddelde**: Geen tooltip — bij hover over het gemiddelde-markering moet je het gemiddelde bedrag/waarde zien
4. **Arc logica XL fout**: Arc gaat van -135 tot einde, maar moet stoppen bij de juiste positie relatief aan het gemiddelde (net als de sm gauges)

### Wijzigingen

**`src/components/portal/GaugeChart.tsx`**

**XL gauge fixes:**
- Euro bedrag fontSize: 42 → 56, nog prominenter
- Progress arc gebruikt `animatedProgress * 270` correct — maar controleren dat het stopt bij de juiste positie (niet 100% gevuld)
- SVG viewBox iets groter maken zodat er ruimte is

**SM gauge fixes:**
- SVG hoogte vergroten: `cy + 24` → `cy + 40` zodat tekst niet over de gauge loopt
- Value fontSize: 14 → 16, unit fontSize: 9 → 11
- Naaldlengte iets korter: 48 → 42 zodat die niet tegen het getal aankomt
- Value text y-positie naar beneden: meer ruimte tussen naald-center en tekst

**Hover tooltip op gemiddelde (beide sizes):**
- Wrappen van de gemiddelde-marker in een `<g>` met een onMouseEnter/onMouseLeave
- State `showAvgTooltip` toevoegen
- Bij hover: een klein SVG rect + text tonen met "Gem: €1.200" of "Gem: 800 kWh"
- Nieuwe prop `averageLabel?: string` voor de tooltip tekst, of automatisch formatteren met de `formatValue` functie

**Dashboard:**
- `averageLabel` meegeven aan gauges zodat de tooltip weet wat er getoond moet worden

### Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/portal/GaugeChart.tsx` | XL font groter, SM spacing/sizing fixes, hover tooltip op gemiddelde |
| `src/pages/portal/ClientDashboard.tsx` | Eventueel `averageLabel` prop meegeven |

