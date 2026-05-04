import logoFullColor from "@/assets/logo-full-color.svg";
import logoBright from "@/assets/logo-bright.svg";

interface SteeringWheelProps {
  isLight?: boolean;
  className?: string;
}

// Half-wheel — alleen het bovenste deel van een rond stuur is zichtbaar
// (alsof de bestuurder achter het stuur zit). Twee spaken converging
// naar centraal e-Charging-embleem. Subtiel metallic via gradient.
export function SteeringWheel({ isLight = false, className = "" }: SteeringWheelProps) {
  const logo = isLight ? logoFullColor : logoBright;

  return (
    <div className={`relative w-full pointer-events-none ${className}`}>
      <svg
        viewBox="0 0 800 200"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="wheel-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.95" />
            <stop offset="50%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(var(--object-stroke))" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="wheel-glow" cx="0.5" cy="1" r="0.7">
            <stop offset="0%" stopColor="hsl(var(--object-glow))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--object-glow))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Glow halo achter stuur */}
        <ellipse cx="400" cy="200" rx="380" ry="120" fill="url(#wheel-glow)" />

        {/* Buitenrand — bovenste 60% van een cirkel zichtbaar */}
        <path
          d="M 60 200 A 340 340 0 0 1 740 200"
          fill="none"
          stroke="url(#wheel-rim)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Binnenrand (subtiele dubbele lijn voor diepte) */}
        <path
          d="M 80 200 A 320 320 0 0 1 720 200"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.35"
        />

        {/* Linker spaak */}
        <path
          d="M 188 132 Q 280 175 360 195"
          fill="none"
          stroke="url(#wheel-rim)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Rechter spaak */}
        <path
          d="M 612 132 Q 520 175 440 195"
          fill="none"
          stroke="url(#wheel-rim)"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Centrum-hub — afgeronde rechthoek met logo */}
        <rect
          x="340" y="170" width="120" height="42" rx="10"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="2"
        />
        {/* Subtiele binnenshadow op hub */}
        <rect
          x="344" y="174" width="112" height="34" rx="8"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="0.6"
          opacity="0.4"
        />

        {/* Logo embedded in hub */}
        <image
          href={logo}
          x="360" y="178" width="80" height="26"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Drukknopjes op spaken — pure decoratie, suggest functionaliteit */}
        <circle cx="240" cy="158" r="3" fill="hsl(var(--gauge-blue))" opacity="0.7" />
        <circle cx="560" cy="158" r="3" fill="hsl(var(--gauge-green))" opacity="0.7" />
      </svg>
    </div>
  );
}
