// 3D dashboard cowling — donkere kap bovenaan met gelaagde diepte. Blendt
// onderaan in de body-achtergrond zodat het visueel één geheel is.

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
        {/* Materiaal — donker bovenaan, eindigt EXACT op de body-bg-kleur (hsl 222 18% 6%) */}
        <linearGradient id="hood-material" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="hsl(222 26% 2%)" stopOpacity="1" />
          <stop offset="45%" stopColor="hsl(222 22% 4%)" stopOpacity="1" />
          <stop offset="85%" stopColor="hsl(222 20% 6%)" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(222 18% 6%)" stopOpacity="1" />
        </linearGradient>

        {/* Subtiele bovenshine — alsof licht op de bovenrand reflecteert */}
        <linearGradient id="hood-shine" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0.07" />
          <stop offset="35%" stopColor="hsl(0 0% 100%)" stopOpacity="0.018" />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Side-vignet — diepere schaduw aan de hoeken voor 3D-ronding */}
        <radialGradient id="side-vignet" cx="0.5" cy="0.25" r="0.85">
          <stop offset="40%" stopColor="hsl(0 0% 0%)" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.55" />
        </radialGradient>

        {/* Overhang-shadow — schaduw die zich vormt onder de bocht van de kap */}
        <linearGradient id="overhang-shadow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 0%)" stopOpacity="0" />
          <stop offset="65%" stopColor="hsl(0 0% 0%)" stopOpacity="0" />
          <stop offset="92%" stopColor="hsl(0 0% 0%)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.55" />
        </linearGradient>

        {/* Stiknaad-fade voor zachte paneeldetails (alleen midden zichtbaar) */}
        <linearGradient id="seam-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
          <stop offset="50%" stopColor="hsl(0 0% 100%)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
        </linearGradient>

        {/* Subtiele grijze randlijn — vervangt de blauwe glow */}
        <linearGradient id="rim-subtle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 0% 75%)" stopOpacity="0" />
          <stop offset="35%" stopColor="hsl(0 0% 70%)" stopOpacity="0.13" />
          <stop offset="50%" stopColor="hsl(0 0% 80%)" stopOpacity="0.2" />
          <stop offset="65%" stopColor="hsl(0 0% 70%)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="hsl(0 0% 75%)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Laag 1 — hoofd-kap (gevuld donker materiaal) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-material)"
      />

      {/* Laag 2 — bovenshine */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#hood-shine)"
      />

      {/* Laag 3 — side-vignet voor diepte aan de hoeken */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#side-vignet)"
      />

      {/* Laag 4 — overhang-shadow (donkerder net bij de rand, geeft "diep" gevoel) */}
      <path
        d="M 0 0 L 1200 0 L 1200 215 Q 600 22 0 215 Z"
        fill="url(#overhang-shadow)"
      />

      {/* Laag 5 — bovenste paneelnaad (subtiele structuurlijn) */}
      <path
        d="M 0 95 Q 600 -78 1200 95"
        stroke="url(#seam-fade)"
        strokeWidth="0.5"
        strokeDasharray="3,5"
        fill="none"
      />

      {/* Laag 6 — onderste paneelnaad (dichter bij de rand) */}
      <path
        d="M 0 178 Q 600 6 1200 178"
        stroke="url(#seam-fade)"
        strokeWidth="0.4"
        strokeDasharray="2,5"
        fill="none"
        opacity="0.55"
      />

      {/* Laag 7 — diepe schaduw onder de rand (geeft de overhang z'n volume) */}
      <path
        d="M 0 219 Q 600 26 1200 219"
        stroke="hsl(0 0% 0%)"
        strokeOpacity="0.5"
        strokeWidth="5"
        fill="none"
      />

      {/* Laag 8 — subtiele grijze randlijn (definieert de kap-rand zonder op te vallen) */}
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
