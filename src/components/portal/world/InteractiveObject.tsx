import { Link } from "react-router-dom";
import { type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InteractiveObjectProps {
  to: string;
  tooltip: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

// Wrapper voor alle klikbare wereld-objecten in de windshield-scene.
// Geeft hover-glow + cursor + tooltip + routing.
export function InteractiveObject({
  to,
  tooltip,
  ariaLabel,
  children,
  className = "",
}: InteractiveObjectProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          aria-label={ariaLabel}
          className={`absolute group cursor-pointer
            transition-transform duration-300 ease-out
            hover:scale-[1.06] active:scale-[0.98]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
            ${className}`}
        >
          <div className="relative">
            {/* Hover-glow halo */}
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none"
              style={{ background: "hsl(var(--object-glow) / 0.5)", transform: "scale(1.4)" }}
            />
            {children}
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
