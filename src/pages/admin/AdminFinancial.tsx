import { useAllSettlements } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function AdminFinancial() {
  const { data: settlements, isLoading } = useAllSettlements();

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Financieel</h1>

      <Card>
        <CardHeader><CardTitle>Maandelijkse afrekeningen</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Maand</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Bruto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">E-Charging</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Klant uitbet.</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements?.map((s: any) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="p-3">{s.month ? format(new Date(s.month), "MMM yyyy", { locale: nl }) : "-"}</td>
                    <td className="p-3">{s.clients?.company_name || "-"}</td>
                    <td className="p-3 text-right">{fmt(Number(s.gross_revenue))}</td>
                    <td className="p-3 text-right">{fmt(Number(s.net_margin))}</td>
                    <td className="p-3 text-right font-medium">{fmt(Number(s.echarging_revenue))}</td>
                    <td className="p-3 text-right">{fmt(Number(s.client_payout))}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        s.status === "paid" ? "bg-primary/10 text-primary" :
                        s.status === "approved" ? "bg-warning/10 text-warning" :
                        "bg-muted text-muted-foreground"
                      }`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
