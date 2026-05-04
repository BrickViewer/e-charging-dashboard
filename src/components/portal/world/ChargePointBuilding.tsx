import { InteractiveObject } from "./InteractiveObject";

// Stylized laadpaal — voorgrond, links. Klik → /portal/sessies.
export function ChargePointBuilding({ className }: { className?: string }) {
  return (
    <InteractiveObject
      to="/portal/sessies"
      tooltip="Bekijk uw laadsessies"
      ariaLabel="Bekijk laadsessies"
      className={className}
    >
      <svg width="120" height="180" viewBox="0 0 120 180" className="overflow-visible">
        <defs>
          <linearGradient id="cp-screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--gauge-blue))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(var(--gauge-blue))" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Grondschaduw */}
        <ellipse cx="60" cy="172" rx="38" ry="3.5" fill="hsl(var(--object-stroke))" opacity="0.18" />

        {/* Hoofdpaal — body */}
        <rect
          x="40" y="40" width="40" height="130" rx="4"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.5"
        />

        {/* Top-cap */}
        <rect
          x="36" y="34" width="48" height="10" rx="2"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.5"
        />

        {/* Display met laadpaal-icoon */}
        <rect
          x="46" y="50" width="28" height="22" rx="2"
          fill="url(#cp-screen)"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="0.8"
        />
        {/* Bliksem-icoon op display */}
        <path
          d="M 60 55 L 56 63 L 60 63 L 58 69 L 64 60 L 60 60 Z"
          fill="hsl(var(--gauge-blue))"
          opacity="0.95"
        />

        {/* LED-strip onder display */}
        <rect x="46" y="78" width="28" height="2" rx="1" fill="hsl(var(--gauge-green))" opacity="0.85" />

        {/* Plug-houder rechts */}
        <rect
          x="80" y="90" width="12" height="18" rx="2"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.2"
        />
        {/* Kabel hangt uit plug-houder */}
        <path
          d="M 86 108 Q 96 130 78 152"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* Plug-uiteinde */}
        <rect
          x="73" y="148" width="11" height="8" rx="1.5"
          fill="hsl(var(--object-stroke))"
          opacity="0.9"
        />

        {/* Voet */}
        <rect
          x="34" y="166" width="52" height="6" rx="1"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.5"
        />

        {/* Typografisch label op de body */}
        <text
          x="60" y="120"
          textAnchor="middle"
          fill="hsl(var(--object-stroke))"
          fontSize="6"
          fontFamily="var(--font-family)"
          letterSpacing="0.15em"
          opacity="0.7"
        >
          E-CHARGING
        </text>

        {/* Tweede status-led onderaan */}
        <circle cx="60" cy="135" r="1.6" fill="hsl(var(--gauge-green))" opacity="0.9" />
      </svg>
    </InteractiveObject>
  );
}
