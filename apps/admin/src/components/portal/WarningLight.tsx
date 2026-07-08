// Storinglampje in cockpit-stijl: alleen icoon, met tooltip die aantal toont.
// Wrench voor offline (rood/roze), laadpaal voor online (groen).
//
// Custom CSS-tooltip (group-hover) ipv Radix Tooltip — die laatste werkt niet
// betrouwbaar binnen fixed-positioned wrappers + drop-shadow filters van de gauges.
// Plus native `title` attribute als hard fallback voor screenreaders/oude browsers.

import type { CSSProperties } from "react";
import { Wrench } from "lucide-react";

interface WarningLightProps {
  count: number;
  variant: "offline" | "online";
}

function ChargerIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="3" width="11" height="18" rx="1.4" />
      <rect x="8" y="5.5" width="7" height="3" rx="0.4" />
      <path d="M12.5 11.5 L10.5 15 L13 15 L11 18.5" />
    </svg>
  );
}

export function WarningLight({ count, variant }: WarningLightProps) {
  const active = count > 0;
  // Theme-aware: volgt de --gauge-* overrides van de dagmodus
  const colorHsl = variant === "offline" ? "var(--gauge-red)" : "var(--gauge-green)";
  const woord = count === 1 ? "laadpaal" : "laadpalen";
  const tooltipText = variant === "offline"
    ? (count === 0 ? "Geen storingen" : `${count} ${woord} buiten gebruik`)
    : (count === 0 ? "Geen palen actief" : `${count} ${woord} actief`);

  // Gloed via CSS-klasse (.warning-light-active in index.css) zodat de
  // dagmodus hem kan uitzetten; kleur als custom property voor de filter.
  const iconClass = `w-9 h-9 flex-shrink-0${active ? " warning-light-active" : ""}`;
  const iconStyle: CSSProperties = {
    color: active ? `hsl(${colorHsl})` : "hsl(var(--muted-foreground) / 0.35)",
    ["--wl-color" as string]: colorHsl,
    transition: "color 600ms ease, filter 600ms ease",
  };

  return (
    <div className="relative group inline-flex" title={tooltipText}>
      <div className="cursor-default select-none inline-flex">
        {variant === "offline" ? (
          <Wrench className={iconClass} strokeWidth={1.6} style={iconStyle} />
        ) : (
          <ChargerIcon className={iconClass} style={iconStyle} />
        )}
      </div>
      {/* CSS-only tooltip — verschijnt bij hover op de wrapper */}
      <div
        role="tooltip"
        className="
          pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2
          whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5
          text-xs text-popover-foreground shadow-lg
          opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
          transition-opacity duration-150 z-[100]
        "
      >
        {tooltipText}
      </div>
    </div>
  );
}
