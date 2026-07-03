import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type KpiAccent = "primary" | "amber" | "blue" | "red" | "green" | "muted";

// Eén gedeelde KPI-tegel voor de Beheer-module. Vervangt de vier gedrifte kopieën
// (Dashboard/Clients/Storingen/Locations) die deels hardcoded amber-400/red-500 en
// deels de --status-* tokens gebruikten. Accenten lopen nu via de design-tokens.
const ACCENT: Record<KpiAccent, string> = {
  primary: "bg-primary/10 border-primary/20 text-primary",
  amber: "bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] text-[hsl(var(--status-amber))]",
  blue: "bg-[hsl(var(--status-blue)/var(--status-tile-alpha))] border-[hsl(var(--status-blue)/var(--status-tile-border-alpha))] text-[hsl(var(--status-blue))]",
  green: "bg-[hsl(var(--status-green,152_60%_40%)/var(--status-tile-alpha))] border-[hsl(var(--status-green,152_60%_40%)/var(--status-tile-border-alpha))] text-[hsl(var(--status-green,152_60%_40%))]",
  red: "bg-destructive/10 border-destructive/20 text-destructive",
  muted: "bg-muted/30 border-border text-muted-foreground",
};

export function KpiTile({
  label,
  value,
  subtitle,
  icon,
  accent = "muted",
}: {
  label: string;
  value: string;
  subtitle?: string | null;
  icon: ReactNode;
  accent?: KpiAccent;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${ACCENT[accent]}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1 leading-none">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
