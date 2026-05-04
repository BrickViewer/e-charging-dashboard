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
      <svg width="90" height="160" viewBox="0 0 90 160" className="overflow-visible">
        {/* Grondschaduw */}
        <ellipse cx="45" cy="155" rx="22" ry="2.5" fill="hsl(var(--object-stroke))" opacity="0.18" />

        {/* Hoofd */}
        <circle
          cx="45" cy="38" r="20"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.8"
        />

        {/* Hals */}
        <rect
          x="40" y="56" width="10" height="10"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.5"
        />

        {/* Schouders + torso (trapezium) */}
        <path
          d="M 12 90 Q 12 70 28 66 L 62 66 Q 78 70 78 90 L 78 152 L 12 152 Z"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Subtiel collar/v-neck detail */}
        <path
          d="M 38 66 L 45 82 L 52 66"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Glow-accent rond hoofd */}
        <circle
          cx="45" cy="38" r="22"
          fill="none"
          stroke="hsl(var(--object-glow))"
          strokeWidth="0.8"
          opacity="0.35"
        />
      </svg>
    </InteractiveObject>
  );
}
