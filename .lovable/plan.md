

## Gauge Redesign — Clean & Modern

### Wat verandert

**Centrale gauge wordt de Opbrengst (€)** — dit is het belangrijkste getal. Geen traditionele snelheidsmeter maar een **groot digitaal getal** in het midden van een dunne, minimalistische boog. Denk aan een modern EV-display waar de snelheid als groot getal wordt getoond met een subtiele ring eromheen.

**Links (kWh) en rechts (Laadpunten) blijven ronde snelheidsmeters** — maar veel cleaner:

```text
    ┌─────────┐     ┌─────────────────┐     ┌─────────┐
    │  ╭───╮  │     │                 │     │  ╭───╮  │
    │ ╱  ↑  ╲ │     │    € 1.247      │     │ ╱  ↑  ╲ │
    │ ╲     ╱ │     │   ───────────   │     │ ╲     ╱ │
    │  ╰───╯  │     │  subtiele boog  │     │  ╰───╯  │
    │  342kWh │     │  Opbrengst      │     │  4 / 5  │
    │         │     │  deze maand     │     │  online │
    └─────────┘     └─────────────────┘     └─────────┘
```

### GaugeChart.tsx — Design cleanup

**Wat weg gaat (minder druk):**
- Minor ticks verwijderd — alleen nog major ticks
- Minder major ticks (5 in plaats van 6/10)
- Active arc opacity omhoog (0.3 → 0.6) zodat het krachtiger oogt
- Tick labels alleen bij de grote gauge

**Wat cleaner wordt:**
- Dunnere arc (strokeWidth: lg 4→3, sm 3→2)
- Dunnere naald (strokeWidth: 1.5 ipv 2/2.5)
- Kleiner center dot
- Meer ruimte — minder visuele elementen = meer ademruimte

### Nieuw: `size="xl"` voor de centrale opbrengst-gauge

Een derde size variant die geen naald heeft maar een **groot digitaal getal** centraal toont met een dunne voortgangsboog eromheen. Modern EV-stijl.

- Grote circulaire boog (radius ~130)
- Groot getal in het midden (fontSize 42, bold)
- Label eronder
- Subtiele geanimeerde arc die de voortgang toont
- Geen naald, geen ticks — puur minimalistisch

### Dashboard layout aanpassing

- Centrale gauge: Opbrengst → `size="xl"` (was kWh `size="lg"`)
- Links: kWh geladen → `size="sm"` (ronde snelheidsmeter met naald)
- Rechts: Laadpunten online → `size="sm"` (ronde snelheidsmeter met naald)

### Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/portal/GaugeChart.tsx` | Minor ticks weg, minder major ticks, dunnere lijnen, nieuwe `xl` size variant |
| `src/pages/portal/ClientDashboard.tsx` | Opbrengst naar midden als `xl`, kWh en laadpunten als `sm` links/rechts |

