// Horizon-lijn op ~70% van het uitzicht, met enkele perspectief-streepjes
// die richting verdwijnpunt convergeren — geeft een subtiele "weg vooruit"-feel.

export function HorizonLine() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="horizon-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--road-line))" stopOpacity="0" />
          <stop offset="20%" stopColor="hsl(var(--road-line))" stopOpacity="0.7" />
          <stop offset="50%" stopColor="hsl(var(--road-line))" stopOpacity="1" />
          <stop offset="80%" stopColor="hsl(var(--road-line))" stopOpacity="0.7" />
          <stop offset="100%" stopColor="hsl(var(--road-line))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* De horizonlijn zelf */}
      <line
        x1="0"
        y1="68"
        x2="100"
        y2="68"
        stroke="url(#horizon-gradient)"
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
      />

      {/* Perspectief-lijnen vanuit horizon naar bottom — dunne streepjes */}
      {[
        { angle: -22 }, { angle: -14 }, { angle: -7 },
        { angle: 7 }, { angle: 14 }, { angle: 22 },
      ].map(({ angle }, i) => {
        const startX = 50;
        const startY = 68;
        const length = 32; // tot bottom area
        const endX = startX + Math.sin((angle * Math.PI) / 180) * length;
        const endY = startY + Math.cos((angle * Math.PI) / 180) * length;
        return (
          <line
            key={i}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke="hsl(var(--road-line))"
            strokeWidth="0.15"
            strokeDasharray="0.8 1.5"
            opacity="0.35"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
