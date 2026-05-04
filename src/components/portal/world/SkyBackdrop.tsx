// Stylized sky + ground. Tweedeling: bovenste 65% is hemel (gradient + sterren),
// onderste 35% is grond (gradient + perspectief-streepjes komen van HorizonLine).

import { useMemo } from "react";

const STAR_COUNT = 70;
const HORIZON_PCT = 65; // % van top waar horizon zit

interface Star {
  cx: number;
  cy: number;
  r: number;
  delay: number;
  duration: number;
  opacity: number;
}

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
    cx: rand() * 100,
    cy: rand() * (HORIZON_PCT - 5), // alleen in hemel-zone
    r: 0.4 + rand() * 0.9,
    delay: rand() * 5,
    duration: 3 + rand() * 4,
    opacity: 0.4 + rand() * 0.55,
  }));
}

export function SkyBackdrop() {
  const stars = useMemo(() => generateStars(), []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky — bovenste deel */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: `${HORIZON_PCT}%`,
          background: `linear-gradient(180deg,
            hsl(var(--sky-top)) 0%,
            hsl(var(--sky-mid)) 60%,
            hsl(var(--sky-horizon)) 100%)`,
        }}
      />

      {/* Ground — onderste deel, voor grondvlak waar objecten op staan */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          top: `${HORIZON_PCT}%`,
          background: `linear-gradient(180deg,
            hsl(var(--sky-horizon)) 0%,
            hsl(var(--ground-far)) 35%,
            hsl(var(--ground-near)) 100%)`,
        }}
      />

      {/* Horizon-glow — radial, gecentreerd op horizon-lijn */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          top: `${HORIZON_PCT}%`,
          transform: "translate(-50%, -50%)",
          width: "75%",
          height: "120px",
          background: `radial-gradient(ellipse at center,
            hsl(var(--sky-glow) / 0.55) 0%,
            transparent 70%)`,
        }}
      />

      {/* Sterren in sky-zone */}
      <svg
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: `${HORIZON_PCT}%` }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {stars.map((star, i) => (
          <circle
            key={i}
            cx={star.cx}
            cy={(star.cy / HORIZON_PCT) * 100}
            r={star.r * 0.18}
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
