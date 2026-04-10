import { useEffect, useState } from "react";

interface GaugeChartProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  size?: "sm" | "lg" | "xl";
  color?: string;
  formatValue?: (v: number) => string;
  average?: number;
}

export function GaugeChart({
  value,
  max,
  label,
  unit = "",
  size = "sm",
  color = "hsl(var(--primary))",
  formatValue,
  average,
}: GaugeChartProps) {
  const [animatedAngle, setAnimatedAngle] = useState(-135);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const isXL = size === "xl";
  const isLarge = size === "lg";

  // When average is set, scale is 0..average*2, with average at top (0°)
  const effectiveMax = average ? average * 2 : max;
  const clampedValue = Math.min(Math.max(value, 0), effectiveMax);
  const targetAngle = effectiveMax > 0 ? -135 + (clampedValue / effectiveMax) * 270 : -135;
  const targetProgress = effectiveMax > 0 ? clampedValue / effectiveMax : 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedAngle(targetAngle);
      setAnimatedProgress(targetProgress);
    }, 100);
    return () => clearTimeout(timer);
  }, [targetAngle, targetProgress]);

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (cx: number, cy: number, startAngle: number, endAngle: number, r: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const displayValue = formatValue ? formatValue(clampedValue) : clampedValue.toLocaleString("nl-NL");

  // Determine needle color based on position relative to average
  const getNeedleColor = () => {
    if (!average) return color;
    if (value >= average) return "hsl(var(--primary))"; // green = above average
    const ratio = value / average;
    if (ratio >= 0.8) return "hsl(var(--warning, 38 92% 50%))"; // orange-ish
    return "hsl(var(--destructive))"; // red = far below
  };

  // ── XL: Modern digital display with circular progress arc ──
  if (isXL) {
    const svgSize = 320;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const radius = 130;
    const strokeW = 3;

    // Average marker angle: at 0.5 of the arc (top)
    const avgAngle = average ? 0 : -1; // 0° = top = middle of 270° arc mapped from -135 to 135

    return (
      <div className="flex flex-col items-center">
        <svg
          width={svgSize}
          height={svgSize * 0.72}
          viewBox={`0 0 ${svgSize} ${svgSize * 0.78}`}
          className="overflow-visible"
        >
          {/* Background arc — 270deg */}
          <path
            d={describeArc(cx, cy, -135, 135, radius)}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <path
            d={describeArc(cx, cy, -135, -135 + animatedProgress * 270, radius)}
            fill="none"
            stroke={getNeedleColor()}
            strokeWidth={strokeW + 1}
            strokeLinecap="round"
            style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }}
            opacity={0.7}
          />

          {/* Average marker — small tick at top (0°) */}
          {average && (() => {
            const markerOuter = polarToCartesian(cx, cy, radius + 8, avgAngle);
            const markerInner = polarToCartesian(cx, cy, radius - 8, avgAngle);
            return (
              <>
                <line
                  x1={markerOuter.x} y1={markerOuter.y}
                  x2={markerInner.x} y2={markerInner.y}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  opacity={0.6}
                />
                <text
                  x={cx}
                  y={cy - radius - 14}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontFamily="var(--font-family)"
                >
                  gem.
                </text>
              </>
            );
          })()}

          {/* Glow dot at end of progress */}
          {animatedProgress > 0.01 && (() => {
            const dotAngle = -135 + animatedProgress * 270;
            const dot = polarToCartesian(cx, cy, radius, dotAngle);
            return (
              <>
                <circle cx={dot.x} cy={dot.y} r={5} fill={getNeedleColor()} opacity={0.3}
                  style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }} />
                <circle cx={dot.x} cy={dot.y} r={2.5} fill={getNeedleColor()}
                  style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }} />
              </>
            );
          })()}

          {/* Central value */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize={42}
            fontWeight="700"
            fontFamily="var(--font-family)"
          >
            {displayValue}
          </text>

          {/* Unit */}
          {unit && (
            <text
              x={cx}
              y={cy + 28}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={14}
              fontFamily="var(--font-family)"
            >
              {unit}
            </text>
          )}
        </svg>
        <span className="text-sm font-medium text-muted-foreground -mt-2">{label}</span>
      </div>
    );
  }

  // ── SM / LG: Classic needle gauge ──
  const svgSize = isLarge ? 220 : 160;
  const cx = svgSize / 2;
  const cy = isLarge ? 120 : 88;
  const radius = isLarge ? 85 : 60;
  const needleLength = isLarge ? 70 : 48;
  const strokeW = isLarge ? 3 : 2;

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const angle = -135 + (i / tickCount) * 270;
    const outer = polarToCartesian(cx, cy, radius + 4, angle);
    const inner = polarToCartesian(cx, cy, radius - 2, angle);
    return { outer, inner, angle };
  });

  // Average marker at top (0°) when average prop is set
  const avgMarker = average ? (() => {
    const angle = 0; // top = middle of arc = average
    const outer = polarToCartesian(cx, cy, radius + 7, angle);
    const inner = polarToCartesian(cx, cy, radius - 4, angle);
    return { outer, inner };
  })() : null;

  const needleColor = getNeedleColor();

  return (
    <div className="flex flex-col items-center">
      <svg
        width={svgSize}
        height={cy + 24}
        viewBox={`0 0 ${svgSize} ${cy + 24}`}
        className="overflow-visible"
      >
        {/* Background arc */}
        <path
          d={describeArc(cx, cy, -135, 135, radius)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />

        {/* Active arc */}
        <path
          d={describeArc(cx, cy, -135, Math.min(animatedAngle, 135), radius)}
          fill="none"
          stroke={needleColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ transition: "all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          opacity={0.6}
        />

        {/* Major tick marks */}
        {ticks.map((t, i) => (
          <line
            key={`tick-${i}`}
            x1={t.outer.x}
            y1={t.outer.y}
            x2={t.inner.x}
            y2={t.inner.y}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Average marker — prominent tick at top */}
        {avgMarker && (
          <>
            <line
              x1={avgMarker.outer.x} y1={avgMarker.outer.y}
              x2={avgMarker.inner.x} y2={avgMarker.inner.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              opacity={0.7}
            />
            <text
              x={cx}
              y={cy - radius - 10}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={8}
              fontFamily="var(--font-family)"
            >
              gem.
            </text>
          </>
        )}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={4} fill={needleColor} />
        <circle cx={cx} cy={cy} r={2} fill="hsl(var(--card))" />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - needleLength}
          stroke={needleColor}
          strokeWidth={1.5}
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
          y={cy + (isLarge ? 20 : 14)}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize={isLarge ? 18 : 14}
          fontWeight="700"
          fontFamily="var(--font-family)"
        >
          {displayValue}
        </text>
        {unit && (
          <text
            x={cx}
            y={cy + (isLarge ? 34 : 25)}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={isLarge ? 11 : 9}
            fontFamily="var(--font-family)"
          >
            {unit}
          </text>
        )}
      </svg>
      <span className="text-xs font-medium text-muted-foreground mt-1">{label}</span>
    </div>
  );
}
