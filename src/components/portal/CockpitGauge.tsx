import { useEffect, useId, useState } from "react";

interface CockpitGaugeProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  color?: "red" | "blue" | "green";
  size?: "md" | "xl";
  formatValue?: (v: number) => string;
  formatLabelValue?: (v: number) => string;
}

const COLOR_VAR: Record<NonNullable<CockpitGaugeProps["color"]>, string> = {
  red: "var(--gauge-red)",
  blue: "var(--gauge-blue)",
  green: "var(--gauge-green)",
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, startAngle: number, endAngle: number, r: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function formatTick(v: number): string {
  if (v >= 1000 && v % 1000 === 0) return `${v / 1000}k`;
  if (v >= 100 && Number.isInteger(v)) return v.toString();
  return v.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

export function CockpitGauge({
  value,
  max,
  label,
  sublabel,
  color = "blue",
  size = "md",
  formatValue,
  formatLabelValue,
}: CockpitGaugeProps) {
  const id = useId();
  const isXl = size === "xl";

  const svgSize = isXl ? 440 : 250;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = isXl ? 175 : 100;
  const renderWidth = isXl
    ? "clamp(480px, 72vh, 1320px)"
    : "clamp(220px, 30vh, 480px)";
  const strokeWidth = isXl ? 6 : 3;
  const tickInner = radius - (isXl ? 16 : 10);
  const tickOuter = radius + (isXl ? 7 : 4);
  const labelRadius = radius + (isXl ? 26 : 18);

  const [animatedProgress, setAnimatedProgress] = useState(0);
  const clamped = Math.min(Math.max(value, 0), max);
  const targetProgress = max > 0 ? clamped / max : 0;

  useEffect(() => {
    const t = setTimeout(() => setAnimatedProgress(targetProgress), 100);
    return () => clearTimeout(t);
  }, [targetProgress]);

  const arcColor = `hsl(${COLOR_VAR[color]})`;
  const trackColor = "hsl(var(--gauge-track))";

  // 9 tick marks (8 segments) over 270°
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const angle = -135 + (i / 8) * 270;
    const showLabel = i % 2 === 0; // labels at 0%, 25%, 50%, 75%, 100%
    return { angle, showLabel, fraction: i / 8 };
  });

  const display = formatValue ? formatValue(value) : value.toLocaleString("nl-NL");
  const labelFmt = formatLabelValue ?? formatTick;

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        style={{
          width: renderWidth,
          height: `calc(${renderWidth} * 0.78)`,
        }}
        viewBox={`0 0 ${svgSize} ${svgSize * 0.82}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        <defs>
          <filter id={`glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={isXl ? 4 : 2.5} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d={describeArc(cx, cy, -135, 135, radius)}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {ticks.map((t, i) => {
          const inner = polarToCartesian(cx, cy, tickInner, t.angle);
          const outer = polarToCartesian(cx, cy, tickOuter, t.angle);
          const isMajor = t.showLabel;
          return (
            <line
              key={`tick-${i}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={isMajor ? "hsl(var(--muted-foreground))" : "hsl(var(--border))"}
              strokeWidth={isMajor ? 1.5 : 1}
              strokeLinecap="round"
              opacity={isMajor ? 0.7 : 0.45}
            />
          );
        })}

        {/* Tick labels (0, 25%, 50%, 75%, 100%) */}
        {ticks.filter(t => t.showLabel).map((t, i) => {
          const pos = polarToCartesian(cx, cy, labelRadius, t.angle);
          const tickValue = t.fraction * max;
          return (
            <text
              key={`label-${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={isXl ? 12 : 10}
              fontFamily="var(--font-family)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {labelFmt(tickValue)}
            </text>
          );
        })}

        {/* Active arc */}
        {animatedProgress > 0.005 && (
          <path
            d={describeArc(cx, cy, -135, -135 + animatedProgress * 270, radius)}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
            filter={`url(#glow-${id})`}
            style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }}
          />
        )}

        {/* End-point glow dot */}
        {animatedProgress > 0.005 && (() => {
          const dotAngle = -135 + animatedProgress * 270;
          const dot = polarToCartesian(cx, cy, radius, dotAngle);
          return (
            <g style={{ transition: "all 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)" }}>
              <circle cx={dot.x} cy={dot.y} r={isXl ? 8 : 5} fill={arcColor} opacity={0.25} />
              <circle cx={dot.x} cy={dot.y} r={isXl ? 4 : 2.5} fill={arcColor} />
            </g>
          );
        })()}

        {/* Central value */}
        <text
          x={cx}
          y={cy + (isXl ? 8 : 4)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="hsl(var(--foreground))"
          fontSize={isXl ? 72 : 38}
          fontWeight="700"
          fontFamily="var(--font-family)"
          letterSpacing={isXl ? "0.02em" : "0.01em"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {display}
        </text>

        {/* Sublabel (kWh / €) */}
        {sublabel && (
          <text
            x={cx}
            y={cy + (isXl ? 50 : 30)}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={isXl ? 15 : 11}
            fontFamily="var(--font-family)"
            letterSpacing="0.08em"
          >
            {sublabel}
          </text>
        )}
      </svg>
      <span
        className={`${isXl ? "text-sm mt-6" : "text-xs mt-5"} font-medium uppercase tracking-wider text-muted-foreground/85 text-center px-2`}
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
    </div>
  );
}

// Bereken een visueel "nice" gauge-max op basis van waarde en (optioneel) historisch gemiddelde.
export function niceGaugeMax(value: number, hint?: number): number {
  const candidate = Math.max(value, hint ?? 0) * 1.3;
  if (candidate <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(candidate)));
  const normalized = candidate / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 1.5) nice = 1.5;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 3) nice = 3;
  else if (normalized <= 5) nice = 5;
  else if (normalized <= 7.5) nice = 7.5;
  else nice = 10;
  return nice * magnitude;
}
