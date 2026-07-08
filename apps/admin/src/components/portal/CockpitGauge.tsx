import { useEffect, useId, useRef, useState } from "react";
import { fitGaugeFontSize } from "./gaugeUtils";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const ANIM_DURATION_MS = 1100;

interface CockpitGaugeProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  note?: string;
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
  note,
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
    ? "clamp(460px, 67vh, 760px)"
    : "clamp(205px, 28vh, 340px)";
  const strokeWidth = isXl ? 6 : 3;
  const tickInner = radius - (isXl ? 16 : 10);
  const tickOuter = radius + (isXl ? 7 : 4);
  const labelRadius = radius + (isXl ? 26 : 18);

  const clamped = Math.min(Math.max(value, 0), max);
  const targetProgress = max > 0 ? clamped / max : 0;

  // We animeren één numerieke progress en hertekenen elke frame de boog tot die
  // waarde + de punt op exact die hoek. Daardoor groeit de vulling LANGS de cirkel
  // (0 -> waarde), in plaats van dat de browser het SVG-pad lineair interpoleert
  // (de oude "fly-in" als rechte koorde). Werkt ook vloeiend bij maandwissel.
  // Start op 0 zodat de gauge bij laden van 0 -> waarde langs de boog vult.
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const progressRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = progressRef.current;
    const to = targetProgress;
    if (from === to) return;

    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      progressRef.current = to;
      setAnimatedProgress(to);
      return;
    }

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / ANIM_DURATION_MS, 1);
      const current = from + (to - from) * easeOutCubic(t);
      progressRef.current = current;
      setAnimatedProgress(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
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

  // Auto-fit: lange bedragen (10k+) krimpen zodat ze netjes binnen de gauge
  // passen. De bindende grens is niet de boog maar de binnenste tips van de
  // bijna-horizontale ticks op ±101,25° (x = ±tickInner·cos(11,25°)); 6 units
  // marge aan weerszijden. Effectief ≈ 300 (xl) / 165 (md) viewBox-units.
  const valueBaseFontSize = isXl ? 72 : 38;
  const valueLetterSpacingEm = isXl ? 0.02 : 0.01;
  const valueMaxWidth = 2 * (tickInner * Math.cos((11.25 * Math.PI) / 180) - 6);
  const valueFontSize = fitGaugeFontSize(display, valueBaseFontSize, valueMaxWidth, valueLetterSpacingEm);

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
          {/* Alleen-blur filter; de gloedlaag wordt als apart pad onder de
              scherpe boog getekend zodat de sterkte per thema dimbaar is
              (--gauge-glow-opacity: vol in nachtmodus, gedimd in dagmodus). */}
          <filter id={`glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={isXl ? 4 : 2.5} />
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

        {/* Active arc — per frame opnieuw getekend tot animatedProgress, dus de vulling
            volgt de cirkel (geen CSS-pad-interpolatie). Gloed als aparte blur-laag
            onder de scherpe boog, dimbaar per thema. */}
        {animatedProgress > 0.005 && (
          <>
            <path
              d={describeArc(cx, cy, -135, -135 + animatedProgress * 270, radius)}
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidth + 1}
              strokeLinecap="round"
              filter={`url(#glow-${id})`}
              style={{ opacity: "var(--gauge-glow-opacity)" }}
            />
            <path
              d={describeArc(cx, cy, -135, -135 + animatedProgress * 270, radius)}
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidth + 1}
              strokeLinecap="round"
            />
          </>
        )}

        {/* End-point glow dot — staat per frame op de exacte tip van de boog */}
        {animatedProgress > 0.005 && (() => {
          const dotAngle = -135 + animatedProgress * 270;
          const dot = polarToCartesian(cx, cy, radius, dotAngle);
          return (
            <g>
              {/* Halo volgt de gloed-instelling van het thema (dagmodus: 0 = vlak) */}
              <circle cx={dot.x} cy={dot.y} r={isXl ? 8 : 5} fill={arcColor} style={{ opacity: "calc(var(--gauge-glow-opacity, 1) * 0.25)" }} />
              <circle cx={dot.x} cy={dot.y} r={isXl ? 4 : 2.5} fill={arcColor} />
            </g>
          );
        })()}

        {/* Central value */}
        <text
          x={cx}
          y={cy + (isXl ? 8 : 4) * (valueFontSize / valueBaseFontSize)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="hsl(var(--foreground))"
          fontSize={valueFontSize}
          fontWeight="700"
          fontFamily="var(--font-family)"
          letterSpacing={`${valueLetterSpacingEm}em`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {display}
        </text>

        {/* Sublabel (kWh / €) — meer afstand van het getal voor rustigere uitstraling */}
        {sublabel && (
          <text
            x={cx}
            y={cy + (isXl ? 68 : 42)}
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
        className={`${isXl ? "text-sm mt-8" : "text-xs mt-6"} font-medium uppercase tracking-wider text-muted-foreground/85 text-center px-2 leading-relaxed break-words`}
        style={{ letterSpacing: "0.14em", maxWidth: renderWidth }}
      >
        {label}
      </span>
      {note && (
        <span className={`${isXl ? "text-xs mt-1.5" : "text-[11px] mt-1"} text-muted-foreground/70 text-center px-2`}>
          {note}
        </span>
      )}
    </div>
  );
}
