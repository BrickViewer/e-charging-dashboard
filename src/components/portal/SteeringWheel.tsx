import logoFullColor from "@/assets/logo-full-color.svg";
import logoBright from "@/assets/logo-bright.svg";

interface SteeringWheelProps {
  isLight?: boolean;
  className?: string;
}

// Tilted-perspective stuur — alsof je vanuit driver-positie schuin omlaag kijkt.
// Ellipse-rim ipv cirkel = natuurlijke "wheel-from-above" hoek. Hub centraal,
// twee horizontale spaken, logo embedded. Compact (180px hoog) zodat het de
// cockpit niet domineert.
export function SteeringWheel({ isLight = false, className = "" }: SteeringWheelProps) {
  const logo = isLight ? logoFullColor : logoBright;

  // Geometry
  const W = 800;
  const H = 180;
  const cx = W / 2;
  const cy = 100;        // wheel-center
  const rxOuter = 320;   // outer rim — horizontal radius (perspectief)
  const ryOuter = 78;    // outer rim — vertical radius (kleiner = meer tilt)
  const rxInner = 296;
  const ryInner = 60;
  const hubRx = 56;
  const hubRy = 38;

  return (
    <div className={`relative w-full pointer-events-none ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Metallic rim — hooglicht boven, schaduw onder voor 3D-perspectief */}
          <linearGradient id="wheel-metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--object-stroke))" stopOpacity="1" />
            <stop offset="55%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.78" />
            <stop offset="100%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.4" />
          </linearGradient>

          {/* Hub binnenkant met depth-gradient */}
          <radialGradient id="hub-fill" cx="0.5" cy="0.35" r="0.7">
            <stop offset="0%" stopColor="hsl(var(--object-fill))" stopOpacity="1" />
            <stop offset="80%" stopColor="hsl(var(--object-fill))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--object-stroke) / 0.18)" stopOpacity="1" />
          </radialGradient>

          {/* Halo onder/achter het wheel */}
          <radialGradient id="wheel-halo" cx="0.5" cy="0.55" r="0.55">
            <stop offset="0%" stopColor="hsl(var(--object-glow))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--object-glow))" stopOpacity="0" />
          </radialGradient>

          {/* Topreflectie op rim */}
          <linearGradient id="rim-highlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.8" />
            <stop offset="60%" stopColor="hsl(var(--object-stroke))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Halo achter wheel */}
        <ellipse cx={cx} cy={cy + 10} rx={rxOuter + 80} ry={ryOuter + 30} fill="url(#wheel-halo)" />

        {/* Schaduw onder wheel */}
        <ellipse cx={cx} cy={cy + ryOuter + 18} rx={rxOuter * 0.85} ry={5} fill="hsl(var(--object-stroke))" opacity="0.18" />

        {/* Buitenste rim (donut shape via fill-rule even-odd) */}
        <path
          d={`
            M ${cx - rxOuter} ${cy} A ${rxOuter} ${ryOuter} 0 1 0 ${cx + rxOuter} ${cy} A ${rxOuter} ${ryOuter} 0 1 0 ${cx - rxOuter} ${cy} Z
            M ${cx - rxInner} ${cy} A ${rxInner} ${ryInner} 0 1 0 ${cx + rxInner} ${cy} A ${rxInner} ${ryInner} 0 1 0 ${cx - rxInner} ${cy} Z
          `}
          fill="url(#wheel-metal)"
          fillRule="evenodd"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="0.8"
          strokeOpacity="0.55"
        />

        {/* Top-highlight reflectie op rim */}
        <path
          d={`M ${cx - rxOuter + 14} ${cy - 4} A ${rxOuter - 6} ${ryOuter - 4} 0 0 1 ${cx + rxOuter - 14} ${cy - 4}`}
          fill="none"
          stroke="url(#rim-highlight)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Spaken — 9 en 3 uur, lopen van hub-rand naar inner-rim */}
        <line
          x1={cx - hubRx + 4} y1={cy}
          x2={cx - rxInner + 8} y2={cy}
          stroke="url(#wheel-metal)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <line
          x1={cx + hubRx - 4} y1={cy}
          x2={cx + rxInner - 8} y2={cy}
          stroke="url(#wheel-metal)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Subtiele groove-lijntjes op spaken */}
        <line x1={cx - hubRx} y1={cy} x2={cx - rxInner + 4} y2={cy}
          stroke="hsl(var(--object-stroke))" strokeWidth="0.6" opacity="0.45" />
        <line x1={cx + hubRx} y1={cy} x2={cx + rxInner - 4} y2={cy}
          stroke="hsl(var(--object-stroke))" strokeWidth="0.6" opacity="0.45" />

        {/* Hub — afgeronde vorm in dezelfde tilt */}
        <ellipse cx={cx} cy={cy} rx={hubRx} ry={hubRy} fill="url(#hub-fill)" stroke="hsl(var(--object-stroke))" strokeWidth="2.5" />
        <ellipse cx={cx} cy={cy} rx={hubRx - 7} ry={hubRy - 5} fill="none" stroke="hsl(var(--object-stroke))" strokeWidth="0.6" opacity="0.4" />

        {/* Logo gecentreerd op hub */}
        <image
          href={logo}
          x={cx - 38} y={cy - 13}
          width={76} height={26}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Indicator-lampjes op spaken */}
        <circle cx={cx - 130} cy={cy} r="3" fill="hsl(var(--gauge-blue))" opacity="0.85" />
        <circle cx={cx + 130} cy={cy} r="3" fill="hsl(var(--gauge-green))" opacity="0.85" />

        {/* Tip-knopje bovenaan hub */}
        <circle cx={cx} cy={cy - hubRy + 7} r="2.5" fill="hsl(var(--gauge-blue))" opacity="0.7" />
      </svg>
    </div>
  );
}
