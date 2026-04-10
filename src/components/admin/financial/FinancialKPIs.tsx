import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Euro, Zap, Users } from "lucide-react";

interface FinancialKPIsProps {
  isLoading: boolean;
  totals: { gross: number; echarging: number; clientPayout: number; kwh: number };
}

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FinancialKPIs({ isLoading, totals }: FinancialKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const items = [
    { icon: Euro, label: "Totale omzet", value: fmt(totals.gross) },
    { icon: TrendingUp, label: "E-Charging omzet", value: fmt(totals.echarging), highlight: true },
    { icon: Users, label: "Uitbetalingen klant", value: fmt(totals.clientPayout) },
    { icon: Zap, label: "Totaal kWh", value: `${totals.kwh.toLocaleString("nl-NL")} kWh` },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <item.icon className="w-4 h-4" />{item.label}
            </div>
            <p className={`text-xl font-bold ${item.highlight ? "text-primary" : ""}`}>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
