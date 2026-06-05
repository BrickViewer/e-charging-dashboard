import { useId, useMemo } from "react";

// IsometricSite — strakke, rustige 2.5D scène: een gebouw (stroombron) met daarvoor
// een net raster laadpunten, en kabels met subtiel stromende stroom van het gebouw
// naar elk laadpunt. Puur visueel/illustratief — geen invloed op de berekening.
//
// Geometrie wordt ge-memo'd op het aantal sockets. Dynamiek (flow-snelheid, gloed,
// aan/uit) loopt via CSS-variabelen / props, zonder geometrie-herbouw. Bij overgang
// naar rendement faden de kabels rustig in ("power-on").

interface IsometricSiteProps {
  /** Aantal sockets = aantal laadpunten. */
  sockets: number;
  /** 0..1 — verwacht gebruik: stuurt flow-snelheid en gloed aan. */
  intensity: number;
  /** Stroomt er stroom? (false bij netto rendement <= 0) */
  active?: boolean;
}

const HW = 46;
const HH = 23;
const BUILDING_H = 104;
const POLE_H = 50;
const MAX_RENDER = 30;

type P = { x: number; y: number };
const iso = (gx: number, gy: number): P => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });
const pts = (arr: P[]) => arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function extrude(gx0: number, gy0: number, gx1: number, gy1: number, height: number) {
  const gBack = iso(gx0, gy0);
  const gRight = iso(gx1, gy0);
  const gFront = iso(gx1, gy1);
  const gLeft = iso(gx0, gy1);
  const up = (p: P): P => ({ x: p.x, y: p.y - height });
  return {
    top: [up(gBack), up(gRight), up(gFront), up(gLeft)],
    right: [gRight, gFront, up(gFront), up(gRight)],
    left: [gLeft, gFront, up(gFront), up(gLeft)],
  };
}

export function IsometricSite({ sockets, intensity, active = true }: IsometricSiteProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const geo = useMemo(() => {
    const total = Math.max(1, Math.round(sockets));
    const rendered = Math.min(total, MAX_RENDER);
    const extra = total - rendered;

    const cols = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(rendered * 1.5))));
    const rows = Math.ceil(rendered / cols);

    const bGx0 = -0.6;
    const bGx1 = cols - 0.4;
    const bGy0 = -2.8;
    const bGy1 = -0.7;
    const building = extrude(bGx0, bGy0, bGx1, bGy1, BUILDING_H);

    const nodeBase = iso((bGx0 + bGx1) / 2, bGy1);
    const node: P = { x: nodeBase.x, y: nodeBase.y - BUILDING_H * 0.42 };

    const bL = iso(bGx0, bGy1);
    const bF = iso(bGx1, bGy1);
    const buildingShadow = { x: (bL.x + bF.x) / 2, y: (bL.y + bF.y) / 2, rx: Math.abs(bF.x - bL.x) / 2 + 28, ry: 15 };

    const windows: P[] = [];
    const winCols = Math.max(3, Math.min(6, cols));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < winCols; c++) {
        const gx = lerp(bGx0 + 0.5, bGx1 - 0.5, winCols === 1 ? 0.5 : c / (winCols - 1));
        const base = iso(gx, bGy1);
        windows.push({ x: base.x, y: base.y - BUILDING_H * (0.74 - r * 0.28) });
      }
    }

    type Pole = {
      key: number;
      depth: number;
      faces: ReturnType<typeof extrude>;
      base: P;
      pad: P[];
      screen: { x: number; y: number };
      dot: P;
      cable: string;
    };
    const poles: Pole[] = [];
    for (let i = 0; i < rendered; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const half = 0.16;
      const faces = extrude(c - half, r - half, c + half, r + half, POLE_H);
      const padR = 0.4;
      const pad = [iso(c, r - padR), iso(c + padR, r), iso(c, r + padR), iso(c - padR, r)];
      const base = iso(c, r);
      const screen = { x: base.x - 7, y: base.y - POLE_H + 8 };
      const dot: P = { x: base.x, y: base.y - POLE_H + 3 };
      const target = iso(c, r + 0.18);
      const ctrlX = (node.x + target.x) / 2;
      const ctrlY = Math.min(node.y, target.y) - 48;
      const cable = `M ${node.x.toFixed(1)} ${node.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
      poles.push({ key: i, depth: c + r, faces, base, pad, screen, dot, cable });
    }
    poles.sort((a, b) => a.depth - b.depth);

    const groundPlate = [
      iso(-1.2, -3.2),
      iso(cols + 0.4, -3.2),
      iso(cols + 0.4, rows + 0.2),
      iso(-1.2, rows + 0.2),
    ];

    const allPts: P[] = [
      ...groundPlate,
      ...building.top,
      ...building.left,
      ...building.right,
      ...poles.flatMap((p) => [...p.faces.top, p.dot]),
      node,
    ];
    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);
    const pad = 44;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;

    return {
      viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
      minX,
      minY,
      poles,
      building,
      buildingShadow,
      windows,
      node,
      groundPlate,
      extra,
    };
  }, [sockets]);

  const t = Math.max(0, Math.min(1, intensity));
  const flowDuration = `${lerp(2.6, 1.2, t).toFixed(2)}s`;
  const flowOpacity = active ? lerp(0.5, 0.85, t) : 0;
  const statusOn = active;
  const fade = { transition: "opacity 500ms ease, fill 400ms ease" } as React.CSSProperties;

  return (
    <svg
      viewBox={geo.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Scène met ${geo.poles.length} laadpunten verbonden met het gebouw`}
      style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
    >
      <defs>
        <filter id={`glow${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`ground${uid}`} cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="hsl(140 24% 14% / 0.4)" />
          <stop offset="55%" stopColor="hsl(222 18% 9% / 0.85)" />
          <stop offset="100%" stopColor="hsl(222 22% 5%)" />
        </radialGradient>
        <linearGradient id={`bTop${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222 14% 21%)" />
          <stop offset="100%" stopColor="hsl(222 14% 16%)" />
        </linearGradient>
        <linearGradient id={`bRight${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222 16% 13%)" />
          <stop offset="100%" stopColor="hsl(222 18% 9%)" />
        </linearGradient>
        <linearGradient id={`bLeft${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222 16% 10%)" />
          <stop offset="100%" stopColor="hsl(222 20% 7%)" />
        </linearGradient>
        <linearGradient id={`pole${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222 12% 22%)" />
          <stop offset="100%" stopColor="hsl(222 16% 13%)" />
        </linearGradient>
      </defs>

      <g style={{ "--flow-duration": flowDuration } as React.CSSProperties}>
        {/* Grondplaat */}
        <polygon points={pts(geo.groundPlate)} fill={`url(#ground${uid})`} stroke="hsl(222 14% 14%)" strokeWidth={1} />

        {/* Contactschaduw gebouw */}
        <ellipse cx={geo.buildingShadow.x} cy={geo.buildingShadow.y + 4} rx={geo.buildingShadow.rx} ry={geo.buildingShadow.ry} fill="hsl(0 0% 0% / 0.32)" />

        {/* Gebouw */}
        <polygon points={pts(geo.building.left)} fill={`url(#bLeft${uid})`} />
        <polygon points={pts(geo.building.right)} fill={`url(#bRight${uid})`} />
        <polygon points={pts(geo.building.top)} fill={`url(#bTop${uid})`} stroke="hsl(222 14% 22%)" strokeWidth={1} />
        {geo.windows.map((w, i) => (
          <rect key={`win${i}`} x={w.x - 7} y={w.y - 9} width={14} height={18} rx={2}
            fill="hsl(200 80% 70% / 0.12)" stroke="hsl(200 80% 72% / 0.22)" strokeWidth={0.8} />
        ))}
        {/* Power-node (bron) */}
        <circle cx={geo.node.x} cy={geo.node.y} r={11} fill="hsl(var(--gauge-green) / 0.16)" style={fade} />
        <circle className={statusOn ? "node-pulse" : undefined} cx={geo.node.x} cy={geo.node.y} r={6}
          fill={statusOn ? "hsl(var(--gauge-green))" : "hsl(222 8% 38%)"} filter={statusOn ? `url(#glow${uid})` : undefined} style={fade} />

        {/* Kabels (onder de palen) — crisp, geen glow; energie faedt in bij power-on */}
        {geo.poles.map((p) => (
          <g key={`cable${p.key}`}>
            <path d={p.cable} fill="none" stroke="hsl(222 12% 22%)" strokeWidth={2.4} strokeLinecap="round" />
            <path className="energy-flow" d={p.cable} fill="none" stroke="hsl(var(--gauge-green))"
              strokeWidth={1.8} strokeLinecap="round" opacity={flowOpacity} style={fade} />
          </g>
        ))}

        {/* Laadpunten (van achter naar voor) */}
        {geo.poles.map((p) => (
          <g key={`pole${p.key}`}>
            {/* Contactschaduw */}
            <ellipse cx={p.base.x} cy={p.base.y + 2} rx={15} ry={6} fill="hsl(0 0% 0% / 0.28)" />
            {/* Subtiele neutrale pad */}
            <polygon points={pts(p.pad)} fill="hsl(222 14% 11%)" stroke="hsl(222 12% 18%)" strokeWidth={0.7} />
            <polygon points={pts(p.faces.left)} fill="hsl(222 18% 10%)" />
            <polygon points={pts(p.faces.right)} fill={`url(#pole${uid})`} />
            <polygon points={pts(p.faces.top)} fill="hsl(222 12% 24%)" />
            <rect x={p.screen.x} y={p.screen.y} width={14} height={10} rx={1.6}
              fill={statusOn ? "hsl(var(--gauge-green) / 0.3)" : "hsl(222 10% 22%)"}
              stroke={statusOn ? "hsl(var(--gauge-green) / 0.5)" : "hsl(222 12% 28%)"} strokeWidth={0.7} style={fade} />
            <circle className={statusOn ? "pulse-glow" : undefined} cx={p.dot.x} cy={p.dot.y} r={3.4}
              fill={statusOn ? "hsl(var(--gauge-green))" : "hsl(222 8% 36%)"} filter={statusOn ? `url(#glow${uid})` : undefined} style={fade} />
          </g>
        ))}
      </g>

      {geo.extra > 0 && (
        <text x={geo.minX + 12} y={geo.minY + 24} fill="hsl(var(--muted-foreground))" fontSize={12} fontFamily="JetBrains Mono, monospace">
          +{geo.extra} laadpunten meer — vereenvoudigd weergegeven
        </text>
      )}
    </svg>
  );
}
