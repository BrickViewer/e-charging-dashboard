import { InteractiveObject } from "./InteractiveObject";

// Postbus — middenafstand links. Klik → /portal/berichten.
export function MailboxIcon({ className }: { className?: string }) {
  return (
    <InteractiveObject
      to="/portal/berichten"
      tooltip="Uw berichten"
      ariaLabel="Berichten"
      className={className}
    >
      <svg width="70" height="110" viewBox="0 0 70 110" className="overflow-visible">
        {/* Grondschaduw */}
        <ellipse cx="35" cy="105" rx="14" ry="2" fill="hsl(var(--object-stroke))" opacity="0.18" />

        {/* Paal */}
        <rect
          x="32" y="55" width="6" height="48"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.3"
        />

        {/* Postbus body — afgerond capsuleshape */}
        <path
          d="M 12 30 Q 12 14 28 14 L 42 14 Q 58 14 58 30 L 58 56 L 12 56 Z"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Brievengleuf */}
        <rect
          x="22" y="22" width="26" height="3" rx="1"
          fill="hsl(var(--object-stroke))"
          opacity="0.6"
        />

        {/* Knop / handvat onderaan */}
        <circle cx="35" cy="46" r="1.8" fill="hsl(var(--object-stroke))" opacity="0.7" />

        {/* Vlaggetje aan de zijkant */}
        <rect
          x="58" y="22" width="2" height="14"
          fill="hsl(var(--object-stroke))"
          opacity="0.7"
        />
        <path
          d="M 60 22 L 68 26 L 60 30 Z"
          fill="hsl(var(--gauge-red))"
          opacity="0.85"
        />
      </svg>
    </InteractiveObject>
  );
}
