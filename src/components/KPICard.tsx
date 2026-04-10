import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReactNode } from "react";

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon?: ReactNode;
  alert?: string;
}

export function KPICard({ label, value, subtitle, change, icon, alert }: KPICardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="kpi-label">{label}</span>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div className="kpi-value mb-1">{value}</div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${change > 0 ? "text-primary" : "text-destructive"}`}>
            {change > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{change > 0 ? "+" : ""}{change.toFixed(1)}% vs vorige maand</span>
          </div>
        )}
        {alert && (
          <p className="text-sm text-warning mt-2">⚠ {alert}</p>
        )}
      </CardContent>
    </Card>
  );
}
