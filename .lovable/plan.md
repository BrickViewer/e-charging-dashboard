

## Fix: Arc toont delta, kleur blijft groen

### Wat er mis is

De progress arc tekent nu van het **begin** (links-onder, -135°) tot de waarde-positie. Bij 1380/2400 is dat ~57% van de boog — lijkt bijna vol. Gebruiker wil alleen het stukje **verschil** t.o.v. gemiddelde zien.

### Wat er moet gebeuren

De progress arc moet alleen het segment tekenen **tussen het gemiddelde (midden/top) en de huidige waarde**. Kleur blijft gewoon de primaire kleur (groen), geen kleurverandering.

```text
        gem.
         ↓
    ╭────├██──╮     ← klein groen stukje rechts van midden
   ╱     │ ██ ╲       = "iets boven gemiddeld"
  │      │     │
   ╲     │    ╱
    ╰────┴────╯
```

### Wijziging in `src/components/portal/GaugeChart.tsx`

**XL gauge** (regel 134-144): Arc van `-135` → verander naar:
- `avgAngle = -135 + 0.5 * 270` = 0° (midden)
- `valueAngle = -135 + animatedProgress * 270`
- Als value > average: `describeArc(cx, cy, 0, valueAngle, radius)`
- Als value < average: `describeArc(cx, cy, valueAngle, 0, radius)`

**SM gauges** (regel ~275-285): Zelfde logica voor de active arc.

**Kleur**: Verwijder `getNeedleColor()` logica — gewoon altijd `color` (= primary groen) gebruiken voor arc, naald en dots. Geen oranje/rood.

**Glow dot**: Blijft op de waarde-positie staan.

| Bestand | Wijziging |
|---------|-----------|
| `src/components/portal/GaugeChart.tsx` | Arc tekent alleen delta segment, kleur altijd groen |

