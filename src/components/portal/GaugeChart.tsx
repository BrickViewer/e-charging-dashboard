import { useEffect, useState } from "react";

interface GaugeChartProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  size?: "sm" | "lg";
  color?: string;
  formatValue?: (v: number) => string;
}

export function GaugeChart({
  value,
  max,
  label,
  unit = "",
  size = "sm",
  color = "hsl(var(--primary))",
  formatValue,
}: GaugeChartProps) {
  const [animatedAngle, setAnimatedAngle] = useState(-135);

  const isLarge = size === "lg";
  const svgSize = isLarge ? 280 : 180;
  const cx = svgSize / 2;
  const cy = isLarge ? 155 : 100;
  const radius = isLarge ? 110 : 70;
  const needleLength = isLarge ? 95 : 58;

  // Gauge spans from -135deg to +135deg (270 degrees total)
  const clampedValue = Math.min(Math.max(value, 0), max);
  const targetAngle = max > 0 ? -135 + (clampedValue / max) * 270 : -135;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedAngle(targetAngle), 100);
    return () => clearTimeout(timer);
  }, [targetAngle]);

  // Arc path helper
  const describeArc = (startAngle: number, endAngle: number, r: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  // Tick marks
  const tickCount = isLarge ? 10 : 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const angle = -135 + (i / tickCount) * 270;
    const outer = polarToCartesian(cx, cy, radius + (isLarge ? 8 : 5), angle);
    const inner = polarToCartesian(cx, cy, radius - (isLarge ? 4 : 3), angle);
    const tickValue = Math.round((i / tickCount) * max);
    const labelPos = polarToCartesian(cx, cy, radius + (isLarge ? 22 : 16), angle);
    return { outer, inner, labelPos, tickValue, angle };
  });

  // Minor ticks
  const minorTickCount = tickCount * 4;
  const minorTicks = Array.from({ length: minorTickCount + 1 }, (_, i) => {
    const angle = -135 + (i / minorTickCount) * 270;
    const outer = polarToCartesian(cx, cy, radius + (isLarge ? 4 : 2), angle);
    const inner = polarToCartesian(cx, cy, radius - (isLarge ? 2 : 1), angle);
    return { outer, inner };
  });

  const displayValue = formatValue ? formatValue(clampedValue) : clampedValue.toLocaleString("nl-NL");

  return (
    <div className="flex flex-col items-center">
      <svg
        width={svgSize}
        height={isLarge ? cy + 40 : cy + 28}
        viewBox={`0 0 ${svgSize} ${isLarge ? cy + 40 : cy + 28}`}
        className="overflow-visible"
      >
        {/* Background arc */}
        <path
          d={describeArc(-135, 135, radius)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={isLarge ? 6 : 4}
          strokeLinecap="round"
        />

        {/* Active arc */}
        <path
          d={describeArc(-135, Math.min(animatedAngle, 135), radius)}
          fill="none"
          stroke={color}
          strokeWidth={isLarge ? 6 : 4}
          strokeLinecap="round"
          style={{ transition: "all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          opacity={0.3}
        />

        {/* Minor tick marks */}
        {minorTicks.map((t, i) => (
          <line
            key={`minor-${i}`}
            x1={t.outer.x}
            y1={t.outer.y}
            x2={t.inner.x}
            y2={t.inner.y}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={0.5}
            opacity={0.3}
          />
        ))}

        {/* Major tick marks */}
        {ticks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={t.outer.x}
              y1={t.outer.y}
              x2={t.inner.x}
              y2={t.inner.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={isLarge ? 2 : 1.5}
              opacity={0.6}
            />
            {isLarge && (
              <text
                x={t.labelPos.x}
                y={t.labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))"
                fontSize={10}
                fontFamily="var(--font-family)"
              >
                {t.tickValue}
              </text>
            )}
          </g>
        ))}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={isLarge ? 8 : 5} fill={color} />
        <circle cx={cx} cy={cy} r={isLarge ? 4 : 2.5} fill="hsl(var(--card))" />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - needleLength}
          stroke={color}
          strokeWidth={isLarge ? 2.5 : 2}
          strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${animatedAngle}deg)`,
            transition: "transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />

        {/* Value text */}
        <text
          x={cx}
          y={cy + (isLarge ? 28 : 18)}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize={isLarge ? 28 : 18}
          fontWeight="700"
          fontFamily="var(--font-family)"
        >
          {displayValue}
        </text>
        {unit && (
          <text
            x={cx}
            y={cy + (isLarge ? 44 : 30)}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={isLarge ? 13 : 10}
            fontFamily="var(--font-family)"
          >
            {unit}
          </text>
        )}
      </svg>
      <span className="text-sm font-medium text-muted-foreground mt-1">{label}</span>
    </div>
  );
}
