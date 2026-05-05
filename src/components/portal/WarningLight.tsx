// Storinglampje in cockpit-stijl: alleen icoon, met tooltip die aantal toont.
// Wrench voor offline (rood/roze), laadpaal voor online (groen).

import type { CSSProperties } from "react";
import { Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const colorHsl = variant === "offline" ? "350 88% 62%" : "140 70% 55%";
  const tooltipText = `${count} ${count === 1 ? "laadpaal" : "laadpalen"} ${variant}`;

  const iconClass = "w-9 h-9 flex-shrink-0";
  const iconStyle: CSSProperties = {
    color: active ? `hsl(${colorHsl})` : "hsl(var(--muted-foreground) / 0.35)",
    filter: active
      ? `drop-shadow(0 0 10px hsl(${colorHsl} / 0.7)) drop-shadow(0 0 4px hsl(${colorHsl} / 0.5))`
      : "none",
    transition: "color 600ms ease, filter 600ms ease",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default select-none inline-flex">
          {variant === "offline" ? (
            <Wrench className={iconClass} strokeWidth={1.6} style={iconStyle} />
          ) : (
            <ChargerIcon className={iconClass} style={iconStyle} />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
