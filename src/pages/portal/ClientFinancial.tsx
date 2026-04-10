import { useClientProfile, useClientSettlements } from "@/hooks/useClientData";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function ClientFinancial() {
  const { data: client } = useClientProfile();
  const { data: settlements, isLoading } = useClientSettlements(client?.id);

  const statusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle className="w-4 h-4 text-primary" />;
      case "approved": return <Clock className="w-4 h-4 text-warning" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const statusText = (status: string, paidAt?: string) => {
    switch (status) {
      case "paid": return `Uitbetaald${paidAt ? ` op ${format(new Date(paidAt), "d MMM yyyy", { locale: nl })}` : ""}`;
      case "approved": return "Goedgekeurd, uitbetaling volgt";
      case "calculated": return "Berekend";
      default: return status;
    }
  };

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Financieel overzicht</h1>

      {settlements?.map((s: any) => (
        <Card key={s.id}>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 uppercase">
              Afrekening {s.month ? format(new Date(s.month), "MMMM yyyy", { locale: nl }) : ""}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bruto laadopbrengst</span>
                <span>{fmt(Number(s.gross_revenue))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stroominkoop (schatting)</span>
                <span>-{fmt(Number(s.total_energy_cost))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">e-Flux platformkosten</span>
                <span>-{fmt(Number(s.total_platform_cost))}</span>
              </div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium">
                <span>Netto laadmarge</span>
                <span>{fmt(Number(s.net_margin))}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary">
                <span>Uw aandeel ({client?.revenue_share_percentage || 50}%)</span>
                <span>{fmt(Number(s.client_payout))}</span>
              </div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-muted-foreground">
                <span>ERE-schatting (indicatief)</span>
                <span>{fmt(Number(s.ere_estimate))}</span>
              </div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>Totaal geschat</span>
                <span className="text-primary">{fmt(Number(s.client_payout) + Number(s.ere_estimate))}</span>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-2 border-t border-border">
                {statusIcon(s.status)}
                <span className="text-sm text-muted-foreground">{statusText(s.status, s.paid_at)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 italic">
              Indicatief. Daadwerkelijke ERE-opbrengst wordt uitbetaald via uw inboekdienstverlener.
            </p>
          </CardContent>
        </Card>
      ))}

      {(!settlements || settlements.length === 0) && !isLoading && (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Nog geen afrekeningen beschikbaar.</CardContent></Card>
      )}
    </div>
  );
}
