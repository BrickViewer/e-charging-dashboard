import { Zap } from "lucide-react";

interface LogoProps {
  variant?: "light" | "dark";
  subtitle?: string;
}

export function Logo({ variant = "light", subtitle }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
        <Zap className="w-5 h-5 text-primary-foreground" />
      </div>
      <div>
        <span className="text-lg font-bold text-foreground">E-Charging</span>
        {subtitle && (
          <span className="ml-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
