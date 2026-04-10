

## Klantdashboard Redesign — Auto-instrumentenpaneel concept

### Visie

Het klantportaal krijgt een **licht thema** met een uniek **auto-dashboard** design. De centrale metafoor: je kijkt naar het instrumentenpaneel van een elektrische auto. Denk aan een Tesla/Porsche Taycan cockpit — clean, minimalistisch, met ronde meters en subtiele animaties.

### Kerncomponenten

**1. SVG Gauge-component (nieuw)**
Een herbruikbare halve-cirkel meter (zoals een snelheidsmeter) gebouwd met SVG. Wordt gebruikt voor:
- **Huidige kWh-verbruik** — grote centrale gauge, de "snelheidsmeter"
- **Opbrengst deze maand** — kleinere gauge links
- **Laadpunten online** — kleinere gauge rechts (bijv. 4/5 = bijna vol)

Elke gauge heeft een geanimeerde naald die smooth naar de juiste waarde beweegt met CSS transitions.

**2. Layout — cockpit-stijl**
```text
┌─────────────────────────────────────────────┐
│  Welkom, Wessel                    [status] │
├─────────────────────────────────────────────┤
│                                             │
│      ┌───────┐  ┌───────────┐  ┌───────┐   │
│      │ €     │  │    kWh    │  │  ●/●  │   │
│      │ gauge │  │   GAUGE   │  │ gauge │   │
│      │ small │  │   LARGE   │  │ small │   │
│      └───────┘  └───────────┘  └───────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Opbrengst per maand (area chart)    │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ Locatie 1   │  │ Locatie 2   │           │
│  │ status dots │  │ status dots │           │
│  └─────────────┘  └─────────────┘           │
│                                             │
│  Recente sessies (compacte lijst)           │
└─────────────────────────────────────────────┘
```

**3. Licht thema voor het klantportaal**
De `dark` class wordt verwijderd van `ClientLayout.tsx`. In plaats daarvan krijgt het portaal een eigen lichte kleurset:
- Achtergrond: zacht off-white (#F8F9FA)
- Cards: wit met subtiele schaduw
- Accenten: e-charging groen (#047F00)
- Gauge achtergrond: lichtgrijs bogen

### Wat wordt aangepast

| Bestand | Wijziging |
|---------|-----------|
| `src/components/portal/GaugeChart.tsx` | **Nieuw** — SVG gauge met geanimeerde naald, tick-marks, labels |
| `src/pages/portal/ClientDashboard.tsx` | Volledig herschreven met cockpit-layout en gauges |
| `src/layouts/ClientLayout.tsx` | `dark` class verwijderen, licht thema styling |
| `src/index.css` | Optioneel: `.portal` thema-variant toevoegen voor subtiele kleurverschillen |
| `src/components/KPICard.tsx` | Niet meer gebruikt op het dashboard (gauges vervangen KPI-cards) |

### Design-principes

- **Uniek**: Geen standaard dashboard-cards. SVG gauges met naald-animatie die je nergens anders ziet
- **Simpel**: Drie meters, een grafiek, locaties, recente sessies. Geen overbodige elementen
- **Duidelijk**: Grote getallen in het midden van elke gauge, labels eronder, direct leesbaar

### Technisch

- Gauges zijn pure SVG + CSS transitions (geen externe libraries)
- De naald animeert met `transition: transform 1s ease-out` bij mount
- Responsive: op mobiel worden de 3 gauges gestapeld
- Alle data komt uit dezelfde `useClientKPIs` / `useClientSessions` hooks

