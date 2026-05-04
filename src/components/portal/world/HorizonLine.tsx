// Horizonlijn op 65% en perspectief-streepjes naar verdwijnpunt — versterkt
// het "weg vooruit"-gevoel zodat objecten op een coherent grondvlak staan.

const HORIZON_Y = 65;

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
          <stop offset="20%" stopColor="hsl(var(--road-line))" stopOpacity="0.6" />
          <stop offset="50%" stopColor="hsl(var(--road-line))" stopOpacity="0.95" />
          <stop offset="80%" stopColor="hsl(var(--road-line))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--road-line))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizonlijn */}
      <line
        x1="0" y1={HORIZON_Y}
        x2="100" y2={HORIZON_Y}
        stroke="url(#horizon-gradient)"
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
      />

      {/* Perspectief-streepjes — convergeren naar verdwijnpunt op horizon */}
      {[
        { angle: -28 }, { angle: -18 }, { angle: -9 },
        { angle: 9 }, { angle: 18 }, { angle: 28 },
      ].map(({ angle }, i) => {
        const startX = 50;
        const startY = HORIZON_Y;
        const length = 40;
        const endX = startX + Math.sin((angle * Math.PI) / 180) * length;
        const endY = startY + Math.cos((angle * Math.PI) / 180) * length;
        return (
          <line
            key={i}
            x1={startX} y1={startY}
            x2={endX} y2={endY}
            stroke="hsl(var(--road-line))"
            strokeWidth="0.2"
            strokeDasharray="0.6 1.2"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
