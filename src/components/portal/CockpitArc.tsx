// Decorative windshield/cockpit arch — descending lijn aan de bovenkant van het
// dashboard. Geeft het auto-cockpit-gevoel uit de schets (Opzet dashboard.pdf).

interface CockpitArcProps {
  className?: string;
}

export function CockpitArc({ className = "" }: CockpitArcProps) {
  return (
    <svg
      className={`pointer-events-none w-full ${className}`}
      viewBox="0 0 1200 110"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cockpit-arc-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--border))" stopOpacity="0" />
          <stop offset="20%" stopColor="hsl(var(--border))" stopOpacity="0.7" />
          <stop offset="50%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.55" />
          <stop offset="80%" stopColor="hsl(var(--border))" stopOpacity="0.7" />
          <stop offset="100%" stopColor="hsl(var(--border))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 0 105 Q 600 0 1200 105"
        fill="none"
        stroke="url(#cockpit-arc-fade)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
