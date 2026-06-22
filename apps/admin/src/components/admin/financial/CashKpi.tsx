import { Card, CardContent } from "@/components/ui/card";

// Cashflow-KPI-tegel (gedeeld door het maandoverzicht en de afrekeningen-tab).
export function CashKpi({
  label,
  value,
  subtitle,
  icon,
  accent,
  changePositive,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "primary" | "amber" | "muted";
  changePositive?: boolean;
}) {
  const accentBg = {
    primary: "bg-primary/10 border-primary/20 text-primary",
    amber: "bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] text-[hsl(var(--status-amber))]",
    muted: "bg-muted/30 border-border text-muted-foreground",
  }[accent ?? "muted"];

  const subtitleColor =
    changePositive === undefined
      ? "text-muted-foreground"
      : changePositive
      ? "text-primary"
      : "text-[hsl(var(--status-red))]";

  return (
    <Card className="portal-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${accentBg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="cockpit-section-label">{label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1.5 leading-none">{value}</p>
            {subtitle && <p className={`text-xs mt-1.5 ${subtitleColor}`}>{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
