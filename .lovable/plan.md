
## Correctie: boog weer vullen vanaf 0, gemiddelde alleen als middelpunt-marker

De fout zit nu in `src/components/portal/GaugeChart.tsx`: zodra `average` is gezet, tekent de gauge alleen nog het verschil tussen gemiddelde en huidige waarde. Dat is niet de gewenste logica.

### Gewenst gedrag
- `0` = start links-onder, geen vulling
- `average` = exact 50% gevuld, naald bovenaan
- `average * 2` = volledige boog gevuld
- Alles daartussen vult lineair vanaf 0 tot de huidige waarde
- Dit moet identiek werken voor `Opbrengst` en `Energie geladen`

### Implementatie
1. De schaal behouden zoals die nu al goed staat:
   - `effectiveMax = average ? average * 2 : max`
   - `targetAngle = -135 + (clampedValue / effectiveMax) * 270`
2. In de XL gauge de huidige “delta arc” verwijderen:
   - niet meer van gemiddelde naar waarde tekenen
   - altijd tekenen van `-135` tot `-135 + animatedProgress * 270`
3. In de SM/LG gauges exact dezelfde wijziging doen:
   - ook daar de delta-logica verwijderen
   - dezelfde 0→waarde boog gebruiken
4. De gemiddelde-marker behouden:
   - marker + tooltip blijven op `0°` als referentie
   - kleur blijft gewoon groen
5. Comments/benaming opschonen:
   - geen “delta arc” meer, maar “active arc from zero to current value”

### Bestanden
- `src/components/portal/GaugeChart.tsx` — actieve boog terugzetten naar 0→waarde, terwijl gemiddelde 50% van de schaal blijft
- `src/pages/portal/ClientDashboard.tsx` — geen functionele wijziging nodig; de huidige props (`average` en `max={average * 2}`) passen al bij deze berekening

### Technische notitie
De naald-positie is waarschijnlijk al correct. De echte fout zit in de getekende boog. De sample `earningsValue = 1380` met `avgEarnings = 1200` kan dus gewoon blijven; met de juiste logica hoort dat ongeveer 57,5% gevulde boog te geven.

### Controle na implementatie
- Opbrengst: `value = average` toont exact halve boog
- Opbrengst: `value = average * 2` toont volledig gevulde boog
- kWh gauge volgt exact dezelfde logica
- Laadpunten online blijft ongewijzigd
