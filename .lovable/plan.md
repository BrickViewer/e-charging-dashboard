

## Wijziging: gemiddelde opbrengst fallback naar €1.000

### Huidige situatie
In `src/hooks/useClientData.ts` regel 97 staat de fallback waarde voor `avgEarnings` op `1200`.

### Wijziging

**`src/hooks/useClientData.ts`** regel 97:
- `: 1200` → `: 1000`

Hierdoor wordt het gemiddelde €1.000 en is de schaal 0–€2.000. De huidige sample opbrengst van €1.380 zal dan op ~69% van de boog staan — duidelijk boven gemiddeld.

