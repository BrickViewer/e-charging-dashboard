import { InteractiveObject } from "./InteractiveObject";

// Munt op pilaar — middenafstand rechts. Klik → /portal/financieel.
export function CoinPillar({ className }: { className?: string }) {
  return (
    <InteractiveObject
      to="/portal/financieel"
      tooltip="Financieel overzicht"
      ariaLabel="Financieel overzicht"
      className={className}
    >
      <svg width="80" height="115" viewBox="0 0 80 115" className="overflow-visible">
        {/* Grondschaduw */}
        <ellipse cx="40" cy="110" rx="22" ry="2.5" fill="hsl(var(--object-stroke))" opacity="0.18" />

        {/* Pilaar / sokkel */}
        <rect
          x="30" y="65" width="20" height="40"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.4"
        />
        <line
          x1="30" y1="72" x2="50" y2="72"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="0.8"
          opacity="0.6"
        />

        {/* Munt — staand op zijn kant, schuin perspectief */}
        <ellipse
          cx="40" cy="42" rx="26" ry="28"
          fill="hsl(var(--object-fill))"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="1.8"
        />
        {/* Munt-rand binnenring voor diepte */}
        <ellipse
          cx="40" cy="42" rx="22" ry="24"
          fill="none"
          stroke="hsl(var(--object-stroke))"
          strokeWidth="0.8"
          opacity="0.55"
        />

        {/* € symbool op munt */}
        <text
          x="40" y="50"
          textAnchor="middle"
          fill="hsl(var(--gauge-green))"
          fontSize="28"
          fontWeight="700"
          fontFamily="var(--font-family)"
        >€</text>

        {/* Glow-rand op munt */}
        <ellipse
          cx="40" cy="42" rx="27" ry="29"
          fill="none"
          stroke="hsl(var(--gauge-green))"
          strokeWidth="0.9"
          opacity="0.4"
        />
      </svg>
    </InteractiveObject>
  );
}
