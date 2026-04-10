

# Fix: Wizard Redirect Bug + Financieel Number Formatting

## Twee problemen

### 1. Wizard redirect bug
De `navigate()` call in `AdminClientWizard.tsx` lijn 174 ziet er correct uit: `navigate(\`/admin/klanten/${client.id}\`)`. Het probleem is waarschijnlijk dat de insert via RLS faalt op `.select().single()`, waardoor `client` null is en een error gegooid wordt die door de catch wordt afgevangen — of dat `client.id` undefined is. De fix: extra null-check na insert, en een fallback navigate naar de klantenlijst als het ID niet beschikbaar is. Ook een `console.log` toevoegen voor debugging.

**Aanpak:**
- Na de `.select().single()` call, check expliciet of `client?.id` bestaat
- Als het ID beschikbaar is: navigeer naar `/admin/klanten/${client.id}`
- Als niet: navigeer naar `/admin/klanten` met een waarschuwing

### 2. Financieel number formatting
`fmt()` op lijn 19 van `AdminFinancial.tsx` gebruikt `minimumFractionDigits: 2` maar mist `maximumFractionDigits: 2`. Hierdoor worden getallen als `€63.289,024` weergegeven in plaats van `€63.289,02`.

**Aanpak:**
- Voeg `maximumFractionDigits: 2` toe aan de `fmt()` functie in `AdminFinancial.tsx`
- Check en fix dezelfde functie in `AdminDashboard.tsx` (die gebruikt `minimumFractionDigits: 0`, daar ook `maximumFractionDigits: 0` toevoegen)

## Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/pages/admin/AdminClientWizard.tsx` | Null-check op client na insert, fallback navigate |
| `src/pages/admin/AdminFinancial.tsx` | Fix `fmt()` met `maximumFractionDigits: 2` |
| `src/pages/admin/AdminDashboard.tsx` | Fix `fmt()` met `maximumFractionDigits: 0` |

