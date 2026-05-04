import { InteractiveObject } from "./InteractiveObject";

// Persoon-silhouet — voorgrond, rechts. Klik → /portal/gegevens.
export function PersonFigure({ className }: { className?: string }) {
  return (
    <InteractiveObject
      to="/portal/gegevens"
      tooltip="Uw gegevens"
      ariaLabel="Uw gegevens"
      className={className}
    >
      <svg width="100" height="170" viewBox="0 0 100 170" className="overflow-visible">
        {/* Grondschaduw */}
        <ellipse cx="50" cy="166" rx="28" ry="3" fill="hsl(var(--object-stroke))" opacity="0.22" />

        {/* Hoofd */}
        <circle
          cx="50" cy="40" r="22"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="2"
        />

        {/* Subtiele gezicht-hint — alleen voor diepte */}
        <path
          d="M 42 45 Q 50 50 58 45"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Hals */}
        <rect
          x="44" y="60" width="12" height="10"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.6"
        />

        {/* Schouders + torso */}
        <path
          d="M 10 100 Q 10 76 28 70 L 72 70 Q 90 76 90 100 L 90 162 L 10 162 Z"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Collar / overhemd-v */}
        <path
          d="M 36 70 L 50 92 L 64 70"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Knoopjes verticaal */}
        <circle cx="50" cy="105" r="1.4" fill="hsl(var(--object-stroke))" opacity="0.65" />
        <circle cx="50" cy="120" r="1.4" fill="hsl(var(--object-stroke))" opacity="0.65" />
        <circle cx="50" cy="135" r="1.4" fill="hsl(var(--object-stroke))" opacity="0.65" />

        {/* Glow-accent rond hoofd */}
        <circle
          cx="50" cy="40" r="25"
          fill="none"
          stroke="hsl(var(--object-glow))"
          strokeWidth="1"
          opacity="0.35"
        />
      </svg>
    </InteractiveObject>
  );
}
