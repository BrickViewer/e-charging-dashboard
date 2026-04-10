

# Admin sidebar logo kleiner maken

## Wijziging in `src/layouts/AdminLayout.tsx`

De `Logo` component in de sidebar krijgt een extra `className` prop om de afbeelding kleiner te renderen. Regel ~56:

```
<Logo variant="dark" subtitle="Beheer" className="[&_img]:h-9" />
```

Dit overschrijft de standaard `h-14` naar `h-9` via een Tailwind child selector, zodat het logo alleen in de admin sidebar kleiner wordt. De rest van de app (portal, login) blijft ongewijzigd.

