// 3D dashboard cowling: gelaagde kap met diepte, gestuurd via --arc-*-
// variabelen (zie index.css). De kap is bewust DONKER in beide thema's
// (cockpit-chrome); de onderrand eindigt op --arc-hood-end — in nachtmodus
// exact de body-achtergrond (naadloze blend), in dagmodus een strakke donkere
// rand boven het lichte interieur. NB: SVG-stops lezen de vars via inline
// style — presentation-attributes lossen var() niet op.

interface CockpitArcProps {
  className?: string;
}

export function CockpitArc({ className = "" }: CockpitArcProps) {
  return (
    <svg
      className={`pointer-events-none w-full ${className}`}
      viewBox="0 0 1200 220"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Materiaal: donker (of licht aluminium) bovenaan, eindigt exact op de body-bg-kleur */}
        <linearGradient id="hood-material" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-hood-1))" }} stopOpacity="1" />
          <stop offset="38%" style={{ stopColor: "hsl(var(--arc-hood-2))" }} stopOpacity="1" />
          <stop offset="70%" style={{ stopColor: "hsl(var(--arc-hood-3))" }} stopOpacity="1" />
          <stop offset="91%" style={{ stopColor: "hsl(var(--arc-hood-4))" }} stopOpacity="1" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-hood-end))" }} stopOpacity="1" />
        </linearGradient>

        {/* Subtiele bovenshine: alsof licht op de bovenrand reflecteert */}
        <linearGradient id="hood-shine" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" style={{ stopOpacity: "var(--arc-shine-opacity)" }} />
          <stop offset="35%" stopColor="hsl(0 0% 100%)" style={{ stopOpacity: "calc(var(--arc-shine-opacity) * 0.26)" }} />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Donkergroen materiaallicht: breed en laag, zodat het met de body blendt */}
        <radialGradient id="hood-green-glow" cx="0.68" cy="0.62" r="0.82" gradientTransform="matrix(1.35 0 0 0.72 -0.2 0.17)">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.12" />
          <stop offset="40%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.075" />
          <stop offset="76%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.028" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0" />
        </radialGradient>

        {/* Brede ambient wash die de kap iets minder grijs maakt */}
        <linearGradient id="hood-green-wash" x1="0.1" y1="0.15" x2="1" y2="0.9">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0" />
          <stop offset="58%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.052" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.055" />
        </linearGradient>

        {/* Side-vignet: diepere schaduw aan de hoeken voor 3D-ronding */}
        <radialGradient id="side-vignet" cx="0.5" cy="0.25" r="0.85">
          <stop offset="40%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.55" />
        </radialGradient>

        {/* Overhang-shadow: schaduw die zich vormt onder de bocht van de kap */}
        <linearGradient id="overhang-shadow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="65%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="92%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.3" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.48" />
        </linearGradient>

        {/* Zachte onderrandblend die de afstand naar de body minder hard maakt */}
        <linearGradient id="rim-ambient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(132 62% 28%)" stopOpacity="0" />
          <stop offset="28%" stopColor="hsl(132 38% 26%)" stopOpacity="0.04" />
          <stop offset="52%" stopColor="hsl(132 54% 32%)" stopOpacity="0.085" />
          <stop offset="74%" stopColor="hsl(132 38% 24%)" stopOpacity="0.045" />
          <stop offset="100%" stopColor="hsl(132 62% 28%)" stopOpacity="0" />
        </linearGradient>

        {/* Paneeldetail-fade voor zachte structuurlijnen, alleen midden zichtbaar */}
        <linearGradient id="seam-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
          <stop offset="50%" style={{ stopColor: "hsl(var(--arc-seam))" }} stopOpacity="0.045" />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Subtiele groene randlijn: definieert de kap zonder fel te worden */}
        <linearGradient id="rim-subtle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(132 72% 50%)" stopOpacity="0" />
          <stop offset="30%" stopColor="hsl(132 40% 56%)" stopOpacity="0.06" />
          <stop offset="50%" stopColor="hsl(132 62% 66%)" stopOpacity="0.14" />
          <stop offset="68%" stopColor="hsl(132 44% 52%)" stopOpacity="0.085" />
          <stop offset="100%" stopColor="hsl(132 72% 50%)" stopOpacity="0" />
        </linearGradient>

        {/* Brede randglow onder de scherpe rim */}
        <linearGradient id="rim-glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(130 80% 35%)" stopOpacity="0" />
          <stop offset="42%" stopColor="hsl(130 72% 30%)" stopOpacity="0.045" />
          <stop offset="58%" stopColor="hsl(132 82% 36%)" stopOpacity="0.075" />
          <stop offset="100%" stopColor="hsl(130 80% 35%)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Laag 1: hoofd-kap (gevuld materiaal) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-material)"
      />

      {/* Laag 2: subtiele groene ambient wash */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-green-wash)"
      />

      {/* Laag 3: zachte lichtvlek rechts/midden */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-green-glow)"
      />

      {/* Laag 4: bovenshine */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-shine)"
      />

      {/* Laag 5: side-vignet voor diepte aan de hoeken (sterkte per thema) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#side-vignet)"
        style={{ opacity: "var(--arc-shadow-strength)" }}
      />

      {/* Laag 6: overhang-shadow, donkerder net bij de rand (sterkte per thema) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#overhang-shadow)"
        style={{ opacity: "var(--arc-shadow-strength)" }}
      />

      {/* Laag 7: bovenste paneelnaad (subtiele structuurlijn) */}
      <path
        d="M 0 95 Q 600 -78 1200 95"
        stroke="url(#seam-fade)"
        strokeWidth="0.5"
        strokeDasharray="3,5"
        fill="none"
      />

      {/* Laag 8: onderste paneelnaad, dichter bij de rand */}
      <path
        d="M 0 178 Q 600 6 1200 178"
        stroke="url(#seam-fade)"
        strokeWidth="0.4"
        strokeDasharray="2,5"
        fill="none"
        opacity="0.55"
      />

      {/* Laag 9: diepe schaduw onder de rand, geeft de overhang volume */}
      <path
        d="M 0 219 Q 600 26 1200 219"
        strokeOpacity="0.5"
        strokeWidth="5"
        fill="none"
        style={{ stroke: "hsl(var(--arc-shadow))", opacity: "var(--arc-shadow-strength)" }}
      />

      {/* Laag 10: zachte groene blend onder de rand */}
      <path
        d="M 0 216 Q 600 23 1200 216"
        stroke="url(#rim-ambient)"
        strokeWidth="13"
        fill="none"
        strokeLinecap="round"
      />

      {/* Laag 11: brede groene randglow onder de scherpe rim */}
      <path
        d="M 0 215 Q 600 22 1200 215"
        stroke="url(#rim-glow)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Laag 12: subtiele groene randlijn */}
      <path
        d="M 0 215 Q 600 22 1200 215"
        stroke="url(#rim-subtle)"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
