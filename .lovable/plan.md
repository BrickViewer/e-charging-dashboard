

## Fix: Sample opbrengst iets boven gemiddelde

De huidige fallback waarden zijn:
- `earningsValue = 1050` (huidige maand)
- `avgEarnings = 1200` (gemiddelde)

Dit plaatst de naald/arc **links** van het midden (onder gemiddeld). De gebruiker wil dat de opbrengst **iets boven** het gemiddelde ligt.

### Wijziging

**`src/pages/portal/ClientDashboard.tsx`** regel 31:
- `earningsValue` fallback van `1050` → `1380` (iets boven het gemiddelde van 1200)

Hierdoor staat de arc/lijn iets voorbij het midden — precies het gewenste effect.

