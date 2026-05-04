// Stylized sky-gradient + sterren. Werkt in donker (nachtelijk) en licht
// (dageraad) thema via --sky-* CSS-variabelen uit index.css.

import { useMemo } from "react";

const STAR_COUNT = 60;

interface Star {
  cx: number;
  cy: number;
  r: number;
  delay: number;
  duration: number;
  opacity: number;
}

// Deterministische pseudo-random voor stabiele star-posities tussen renders
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateStars(seed = 1234): Star[] {
  const rand = seededRandom(seed);
  return Array.from({ length: STAR_COUNT }, () => ({
    cx: rand() * 100,            // % horizontaal
    cy: rand() * 60,             // % verticaal — alleen in bovenste 60% (boven horizon)
    r: 0.4 + rand() * 0.9,       // 0.4 - 1.3 px
    delay: rand() * 5,           // 0-5s phase offset
    duration: 3 + rand() * 4,    // 3-7s
    opacity: 0.4 + rand() * 0.5, // base opacity
  }));
}

export function SkyBackdrop() {
  const stars = useMemo(() => generateStars(), []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Gradient achtergrond */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg,
            hsl(var(--sky-top)) 0%,
            hsl(var(--sky-mid)) 55%,
            hsl(var(--sky-horizon)) 100%)`,
        }}
      />

      {/* Subtiele horizon-glow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-32 opacity-50 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center bottom,
            hsl(var(--sky-glow) / 0.5) 0%,
            transparent 70%)`,
        }}
      />

      {/* Sterren — alleen zichtbaar in donker thema (in licht thema gaan ze verloren in de gradient) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {stars.map((star, i) => (
          <circle
            key={i}
            cx={star.cx}
            cy={star.cy}
            r={star.r * 0.18}  // schaal voor 100x100 viewBox
            fill="white"
            opacity={star.opacity}
            style={{
              animation: `star-pulse ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
