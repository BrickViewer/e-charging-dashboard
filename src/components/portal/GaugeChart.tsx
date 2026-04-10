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
  averageLabel?: string;
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
  averageLabel,
}: GaugeChartProps) {
  const [animatedAngle, setAnimatedAngle] = useState(-135);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [showAvgTooltip, setShowAvgTooltip] = useState(false);

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

  const displayValue = formatValue ? formatValue(value) : value.toLocaleString("nl-NL");

  // Format average for tooltip
  const avgTooltipText = averageLabel
    ? averageLabel
    : average
      ? (formatValue ? `Gem: ${formatValue(average)}` : `Gem: ${average.toLocaleString("nl-NL")}`)
      : "";

  // Always use the provided color (primary green)
  const arcColor = color;

  // Shared tooltip renderer (SVG foreignObject for clean rendering)
  const renderAvgTooltip = (cx: number, cy: number, radius: number) => {
    if (!showAvgTooltip || !average) return null;
    const tooltipWidth = avgTooltipText.length * 8 + 24;
    return (
      <g>
        <rect
          x={cx - tooltipWidth / 2}
          y={cy - radius - 38}
          width={tooltipWidth}
          height={24}
          rx={6}
          fill="hsl(var(--popover))"
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
        <text
          x={cx}
          y={cy - radius - 22}
          textAnchor="middle"
          fill="hsl(var(--popover-foreground))"
          fontSize={11}
          fontWeight="500"
          fontFamily="var(--font-family)"
        >
          {avgTooltipText}
        </text>
      </g>
    );
  };

  // ── XL: Modern digital display with circular progress arc ──
  if (isXL) {
    const svgSize = 320;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const radius = 130;
    const strokeW = 3;
    const avgAngle = 0; // top = average

    return (
      <div className="flex flex-col items-center">
        <svg
          width={svgSize}
          height={svgSize * 0.78}
          viewBox={`0 0 ${svgSize} ${svgSize * 0.82}`}
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

          {/* Progress arc — delta between average and value */}
          {average && Math.abs(animatedProgress - 0.5) > 0.005 && (() => {
            const avgAngleDeg = 0; // middle of 270° arc
            const valueAngleDeg = -135 + animatedProgress * 270;
            const startA = Math.min(avgAngleDeg, valueAngleDeg);
            const endA = Math.max(avgAngleDeg, valueAngleDeg);
            return (
              <path
                d={describeArc(cx, cy, startA, endA, radius)}
                fill="none"
                stroke={arcColor}
                strokeWidth={strokeW + 1}
                strokeLinecap="round"
                style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }}
                opacity={0.7}
              />
            );
          })()}
          {/* Progress arc — full from start when no average */}
          {!average && animatedProgress > 0.005 && (
            <path
              d={describeArc(cx, cy, -135, -135 + animatedProgress * 270, radius)}
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeW + 1}
              strokeLinecap="round"
              style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }}
              opacity={0.7}
            />
          )}

          {/* Average marker — interactive tick at top (0°) */}
          {average && (() => {
            const markerOuter = polarToCartesian(cx, cy, radius + 10, avgAngle);
            const markerInner = polarToCartesian(cx, cy, radius - 10, avgAngle);
            return (
              <g
                onMouseEnter={() => setShowAvgTooltip(true)}
                onMouseLeave={() => setShowAvgTooltip(false)}
                style={{ cursor: "pointer" }}
              >
                {/* Invisible hit area */}
                <line
                  x1={markerOuter.x} y1={markerOuter.y - 8}
                  x2={markerInner.x} y2={markerInner.y + 8}
                  stroke="transparent"
                  strokeWidth={16}
                />
                <line
                  x1={markerOuter.x} y1={markerOuter.y}
                  x2={markerInner.x} y2={markerInner.y}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  opacity={0.6}
                />
                <text
                  x={cx}
                  y={cy - radius - 16}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontFamily="var(--font-family)"
                >
                  gem.
                </text>
                {renderAvgTooltip(cx, cy, radius)}
              </g>
            );
          })()}

          {/* Glow dot at end of progress */}
          {animatedProgress > 0.01 && (() => {
            const dotAngle = -135 + animatedProgress * 270;
            const dot = polarToCartesian(cx, cy, radius, dotAngle);
            return (
              <>
                <circle cx={dot.x} cy={dot.y} r={5} fill={arcColor} opacity={0.3}
                  style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }} />
                <circle cx={dot.x} cy={dot.y} r={2.5} fill={arcColor}
                  style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }} />
              </>
            );
          })()}

          {/* Central value — large and prominent */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize={56}
            fontWeight="700"
            fontFamily="var(--font-family)"
          >
            {displayValue}
          </text>

          {/* Unit */}
          {unit && (
            <text
              x={cx}
              y={cy + 34}
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
  const svgSize = isLarge ? 240 : 180;
  const cx = svgSize / 2;
  const cy = isLarge ? 125 : 92;
  const radius = isLarge ? 90 : 65;
  const needleLength = isLarge ? 72 : 42;
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
    const angle = 0;
    const outer = polarToCartesian(cx, cy, radius + 8, angle);
    const inner = polarToCartesian(cx, cy, radius - 5, angle);
    return { outer, inner };
  })() : null;

  const needleColor = arcColor;

  // More space below for value text
  const svgHeight = cy + (isLarge ? 48 : 42);

  return (
    <div className="flex flex-col items-center">
      <svg
        width={svgSize}
        height={svgHeight}
        viewBox={`0 0 ${svgSize} ${svgHeight}`}
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

        {/* Active arc — delta between average and value */}
        {average && Math.abs(animatedProgress - 0.5) > 0.005 && (() => {
          const avgAngleDeg = 0;
          const valueAngleDeg = -135 + animatedProgress * 270;
          const startA = Math.min(avgAngleDeg, valueAngleDeg);
          const endA = Math.max(avgAngleDeg, valueAngleDeg);
          return (
            <path
              d={describeArc(cx, cy, startA, endA, radius)}
              fill="none"
              stroke={needleColor}
              strokeWidth={strokeW}
              strokeLinecap="round"
              style={{ transition: "all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
              opacity={0.5}
            />
          );
        })()}
        {!average && animatedAngle > -134 && (
          <path
            d={describeArc(cx, cy, -135, Math.min(animatedAngle, 135), radius)}
            fill="none"
            stroke={needleColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ transition: "all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            opacity={0.5}
          />
        )}

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

        {/* Average marker — interactive tick at top */}
        {avgMarker && (
          <g
            onMouseEnter={() => setShowAvgTooltip(true)}
            onMouseLeave={() => setShowAvgTooltip(false)}
            style={{ cursor: "pointer" }}
          >
            {/* Invisible hit area */}
            <line
              x1={avgMarker.outer.x} y1={avgMarker.outer.y - 6}
              x2={avgMarker.inner.x} y2={avgMarker.inner.y + 6}
              stroke="transparent"
              strokeWidth={14}
            />
            <line
              x1={avgMarker.outer.x} y1={avgMarker.outer.y}
              x2={avgMarker.inner.x} y2={avgMarker.inner.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              opacity={0.7}
            />
            <text
              x={cx}
              y={cy - radius - 12}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={9}
              fontFamily="var(--font-family)"
            >
              gem.
            </text>
            {renderAvgTooltip(cx, cy, radius)}
          </g>
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

        {/* Value text — more space, larger font */}
        <text
          x={cx}
          y={cy + (isLarge ? 24 : 20)}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize={isLarge ? 20 : 16}
          fontWeight="700"
          fontFamily="var(--font-family)"
        >
          {displayValue}
        </text>
        {unit && (
          <text
            x={cx}
            y={cy + (isLarge ? 40 : 33)}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={isLarge ? 12 : 11}
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
