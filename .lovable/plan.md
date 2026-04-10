

## Gauge Redesign — Gemiddelde als referentiepunt

### Concept

De snelheidsmeters (sm gauges) werken nu op een nieuw principe: **het maandgemiddelde staat bovenaan (midden)** van de meter. De naald wijst naar links als je onder gemiddeld zit, naar rechts als je erboven zit.

```text
        onder       gemiddeld      boven
          ╲            ↑            ╱
           ╲           │           ╱
            ╰──────────┴──────────╯
```

- Naald in het midden (boven) = precies op het gemiddelde
- Naald naar rechts = boven gemiddeld (goed!)
- Naald naar links = onder gemiddeld

### Data-aanpak

Aangezien er nog geen echte data is, gebruiken we **sample data** om het te demonstreren:

- **kWh geladen deze maand**: huidige waarde uit KPIs, gemiddelde berekend uit de laatste 6 maanden settlements
- **Opbrengst (XL, midden)**: zelfde logica — huidige maand vs. gemiddelde van vorige maanden
- Als er geen historische data is → fallback sample values (bijv. gemiddelde kWh = 800, gemiddelde opbrengst = €1.200)

### Technische wijzigingen

**`GaugeChart.tsx`** — Nieuwe prop `average`:
- Nieuw: `average?: number` prop
- Als `average` is meegegeven: de gauge schaal loopt van `0` tot `average * 2`, met `average` exact bovenaan (0°)
- De naald beweegt van links (-135°) naar rechts (+135°), waarbij het midden (0°) = gemiddelde
- Kleur verandert subtiel: links van midden = oranje/rood tint, rechts = groen
- Een klein markering/tick bovenaan voor "gemiddelde"

**`ClientDashboard.tsx`**:
- Berekent gemiddelden uit `kpis.settlements` (laatste 6 maanden)
- Geeft `average` prop mee aan de sm gauges
- XL gauge krijgt ook average-logica: het getal toont de huidige waarde, de boog toont positie t.o.v. gemiddelde
- Fallback sample data als er geen settlements zijn

**`useClientData.ts`**:
- `useClientKPIs` uitbreiden met `avgKwh` en `avgEarnings` (gemiddelde van beschikbare maanden, of fallback)

### Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/portal/GaugeChart.tsx` | Nieuwe `average` prop, schaal herberekening, gemiddelde-markering |
| `src/pages/portal/ClientDashboard.tsx` | Gemiddelden berekenen en doorgeven, sample data fallback |
| `src/hooks/useClientData.ts` | `avgKwh` en `avgEarnings` toevoegen aan KPI return |

