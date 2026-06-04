import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface ChartDataItem {
  period: string;
  gross: number;
  net: number;
  echarging: number;
  client: number;
  kwh: number;
  count: number;
}

const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Volle-breedte staafgrafiek: E-Charging-fee vs. wat er naar de klant gaat, per maand.
export function FinancialCharts({ chartData }: { chartData: ChartDataItem[] }) {
  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Verdeling per maand</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `€${v}`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => [fmt(v)]} />
              <Legend />
              <Bar dataKey="echarging" name="E-Charging" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="client" name="Naar klant" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
