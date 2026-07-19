// 3D dashboard cowling: gelaagde kap met diepte, gestuurd via --arc-*-
// variabelen (zie index.css). De kap is bewust DONKER in beide thema's
// (cockpit-chrome); de onderrand eindigt op --arc-hood-end — in nachtmodus
// exact de body-achtergrond (naadloze blend), in dagmodus een strakke donkere
// rand boven het lichte interieur. NB: SVG-stops lezen de vars via inline
// style — presentation-attributes lossen var() niet op.

import { useId } from "react";

interface CockpitArcProps {
  className?: string;
}

export function CockpitArc({ className = "" }: CockpitArcProps) {
  // Gradient-IDs per instantie uniek: bij twee kappen in de DOM (bv. login-
  // skelet + verborgen desktop-kap) wint anders de eerste — en een paint-server
  // in een display:none-subtree rendert niet, waardoor de kap vaal wordt.
  const uid = useId();
  return (
    <svg
      className={`pointer-events-none w-full ${className}`}
      viewBox="0 0 1200 220"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Materiaal: donker (of licht aluminium) bovenaan, eindigt exact op de body-bg-kleur */}
        <linearGradient id={`hood-material-${uid}`} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-hood-1))" }} stopOpacity="1" />
          <stop offset="38%" style={{ stopColor: "hsl(var(--arc-hood-2))" }} stopOpacity="1" />
          <stop offset="70%" style={{ stopColor: "hsl(var(--arc-hood-3))" }} stopOpacity="1" />
          <stop offset="91%" style={{ stopColor: "hsl(var(--arc-hood-4))" }} stopOpacity="1" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-hood-end))" }} stopOpacity="1" />
        </linearGradient>

        {/* Subtiele bovenshine: alsof licht op de bovenrand reflecteert */}
        <linearGradient id={`hood-shine-${uid}`} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" style={{ stopOpacity: "var(--arc-shine-opacity)" }} />
          <stop offset="35%" stopColor="hsl(0 0% 100%)" style={{ stopOpacity: "calc(var(--arc-shine-opacity) * 0.26)" }} />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Donkergroen materiaallicht: breed en laag, zodat het met de body blendt */}
        <radialGradient id={`hood-green-glow-${uid}`} cx="0.68" cy="0.62" r="0.82" gradientTransform="matrix(1.35 0 0 0.72 -0.2 0.17)">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.12" />
          <stop offset="40%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.075" />
          <stop offset="76%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.028" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0" />
        </radialGradient>

        {/* Brede ambient wash die de kap iets minder grijs maakt */}
        <linearGradient id={`hood-green-wash-${uid}`} x1="0.1" y1="0.15" x2="1" y2="0.9">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0" />
          <stop offset="58%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.052" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-glow))" }} stopOpacity="0.055" />
        </linearGradient>

        {/* Side-vignet: diepere schaduw aan de hoeken voor 3D-ronding */}
        <radialGradient id={`side-vignet-${uid}`} cx="0.5" cy="0.25" r="0.85">
          <stop offset="40%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.55" />
        </radialGradient>

        {/* Overhang-shadow: schaduw die zich vormt onder de bocht van de kap */}
        <linearGradient id={`overhang-shadow-${uid}`} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="65%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0" />
          <stop offset="92%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.3" />
          <stop offset="100%" style={{ stopColor: "hsl(var(--arc-shadow))" }} stopOpacity="0.48" />
        </linearGradient>

        {/* Zachte onderrandblend die de afstand naar de body minder hard maakt */}
        <linearGradient id={`rim-ambient-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(132 62% 28%)" stopOpacity="0" />
          <stop offset="28%" stopColor="hsl(132 38% 26%)" stopOpacity="0.04" />
          <stop offset="52%" stopColor="hsl(132 54% 32%)" stopOpacity="0.085" />
          <stop offset="74%" stopColor="hsl(132 38% 24%)" stopOpacity="0.045" />
          <stop offset="100%" stopColor="hsl(132 62% 28%)" stopOpacity="0" />
        </linearGradient>

        {/* Paneeldetail-fade voor zachte structuurlijnen, alleen midden zichtbaar */}
        <linearGradient id={`seam-fade-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
          <stop offset="50%" style={{ stopColor: "hsl(var(--arc-seam))" }} stopOpacity="0.045" />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Subtiele groene randlijn: definieert de kap zonder fel te worden */}
        <linearGradient id={`rim-subtle-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(132 72% 50%)" stopOpacity="0" />
          <stop offset="30%" stopColor="hsl(132 40% 56%)" stopOpacity="0.06" />
          <stop offset="50%" stopColor="hsl(132 62% 66%)" stopOpacity="0.14" />
          <stop offset="68%" stopColor="hsl(132 44% 52%)" stopOpacity="0.085" />
          <stop offset="100%" stopColor="hsl(132 72% 50%)" stopOpacity="0" />
        </linearGradient>

        {/* Brede randglow onder de scherpe rim */}
        <linearGradient id={`rim-glow-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(130 80% 35%)" stopOpacity="0" />
          <stop offset="42%" stopColor="hsl(130 72% 30%)" stopOpacity="0.045" />
          <stop offset="58%" stopColor="hsl(132 82% 36%)" stopOpacity="0.075" />
          <stop offset="100%" stopColor="hsl(130 80% 35%)" stopOpacity="0" />
        </linearGradient>

        {/* LED-strip (dagmodus): zachte merkgroene bloom onder de kaprand */}
        <linearGradient id={`led-glow-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(118.2 100% 32.4%)" stopOpacity="0" />
          <stop offset="25%" stopColor="hsl(118.2 100% 32.4%)" stopOpacity="0.13" />
          <stop offset="50%" stopColor="hsl(118.2 100% 32.4%)" stopOpacity="0.24" />
          <stop offset="75%" stopColor="hsl(118.2 100% 32.4%)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="hsl(118.2 100% 32.4%)" stopOpacity="0" />
        </linearGradient>

        {/* LED-strip (dagmodus): de lijn zelf, met lichte hotspot in het midden */}
        <linearGradient id={`led-core-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(118 90% 38%)" stopOpacity="0" />
          <stop offset="8%" stopColor="hsl(118 90% 38%)" stopOpacity="0.55" />
          <stop offset="35%" stopColor="hsl(118 90% 38%)" stopOpacity="0.85" />
          <stop offset="50%" stopColor="hsl(118 85% 45%)" stopOpacity="0.95" />
          <stop offset="65%" stopColor="hsl(118 90% 38%)" stopOpacity="0.85" />
          <stop offset="92%" stopColor="hsl(118 90% 38%)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(118 90% 38%)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Laag 1: hoofd-kap (gevuld materiaal) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill={`url(#hood-material-${uid})`}
      />

      {/* Laag 2+3: groene ambient wash + lichtvlek — decoratief, uit in dagmodus.
          Opacity via style: presentation-attributes lossen var() niet op. */}
      <g style={{ opacity: "var(--arc-decor-opacity, 1)", transition: "opacity 300ms ease" }}>
        <path
          d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
          fill={`url(#hood-green-wash-${uid})`}
        />
        <path
          d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
          fill={`url(#hood-green-glow-${uid})`}
        />
      </g>

      {/* Laag 4: bovenshine */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill={`url(#hood-shine-${uid})`}
      />

      {/* Laag 5: side-vignet voor diepte aan de hoeken (sterkte per thema) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill={`url(#side-vignet-${uid})`}
        style={{ opacity: "var(--arc-shadow-strength)" }}
      />

      {/* Laag 6: overhang-shadow, donkerder net bij de rand (sterkte per thema) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill={`url(#overhang-shadow-${uid})`}
        style={{ opacity: "var(--arc-shadow-strength)" }}
      />

      {/* Laag 7: bovenste paneelnaad (subtiele structuurlijn) */}
      <path
        d="M 0 95 Q 600 -78 1200 95"
        stroke={`url(#seam-fade-${uid})`}
        strokeWidth="0.5"
        strokeDasharray="3,5"
        fill="none"
      />

      {/* Laag 8: onderste paneelnaad, dichter bij de rand */}
      <path
        d="M 0 178 Q 600 6 1200 178"
        stroke={`url(#seam-fade-${uid})`}
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

      {/* Laag 10-12: groene rand-blend/-glow/-lijn (hardgecodeerd 132-groen) —
          decoratief cockpit-chrome, uit in dagmodus via --arc-decor-opacity. */}
      <g style={{ opacity: "var(--arc-decor-opacity, 1)", transition: "opacity 300ms ease" }}>
        <path
          d="M 0 216 Q 600 23 1200 216"
          stroke={`url(#rim-ambient-${uid})`}
          strokeWidth="13"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 0 215 Q 600 22 1200 215"
          stroke={`url(#rim-glow-${uid})`}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 0 215 Q 600 22 1200 215"
          stroke={`url(#rim-subtle-${uid})`}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* Laag 13-14: LED-strip in merkgroen — het dagmodus-equivalent van de
          groene rim hierboven (die is getuned op donker). Fallback 0 houdt
          nachtmodus byte-voor-byte identiek. */}
      <g style={{ opacity: "var(--arc-led-opacity, 0)", transition: "opacity 300ms ease" }}>
        <path
          d="M 0 215 Q 600 22 1200 215"
          stroke={`url(#led-glow-${uid})`}
          strokeWidth="13"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 0 215 Q 600 22 1200 215"
          stroke={`url(#led-core-${uid})`}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
