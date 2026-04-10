

# Logo groter maken in sidebars

De `Logo` component gebruikt `h-8` (32px) voor de afbeelding. Dit wordt vergroot naar `h-10` (40px) standaard, met een optionele `size` prop voor flexibiliteit.

## Wijzigingen

| Bestand | Actie |
|---------|-------|
| `src/components/Logo.tsx` | `h-8` → `h-10` voor de img class |

Eenvoudige one-line change — de logo's in admin sidebar, client sidebar, mobile headers en login pagina worden allemaal groter.

