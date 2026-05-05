import { useClientProfile, useClientSettlements } from "@/hooks/useClientData";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CheckCircle, Clock, AlertCircle, Euro, Leaf, TrendingUp } from "lucide-react";
import { useState, useMemo } from "react";

export default function ClientFinancial() {
  const { data: client } = useClientProfile();
  const { data: settlements, isLoading } = useClientSettlements(client?.id);
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!settlements) return [];
    if (statusFilter === "all") return settlements;
    return settlements.filter((s: any) => s.status === statusFilter);
  }, [settlements, statusFilter]);

  const kpis = useMemo(() => {
    if (!settlements || settlements.length === 0) return { totalPaid: 0, totalEre: 0, avgQuarterly: 0 };
    const paid = settlements.filter((s: any) => s.status === "paid");
    const totalPaid = paid.reduce((sum: number, s: any) => sum + Number(s.client_payout || 0), 0);
    const totalEre = settlements.reduce((sum: number, s: any) => sum + Number(s.ere_estimate || 0), 0);
    const avgQuarterly = settlements.length > 0
      ? settlements.reduce((sum: number, s: any) => sum + Number(s.client_payout || 0), 0) / settlements.length
      : 0;
    return { totalPaid, totalEre, avgQuarterly };
  }, [settlements]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle className="w-4 h-4 text-primary" />;
      case "approved": return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const statusText = (status: string, paidAt?: string) => {
    switch (status) {
      case "paid": return `Uitbetaald${paidAt ? ` op ${format(new Date(paidAt), "d MMM yyyy", { locale: nl })}` : ""}`;
      case "approved": return "Goedgekeurd, uitbetaling volgt";
      case "calculated": return "Berekend";
      case "charged_back": return "Geïncasseerd (vaste kosten)";
      default: return status;
    }
  };

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const periodLabel = (year: number, quarter: number) => `Q${quarter} ${year}`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI-strip — cockpit-stijl tegels met grote bedragen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="portal-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Euro className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Totaal uitbetaald</p>
                <p className="text-xl font-semibold text-primary mt-1 tabular-nums">{fmt(kpis.totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Leaf className="w-4 h-4 text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Geschat ERE — via Laadbeloning</p>
                <p className="text-xl font-semibold mt-1 tabular-nums">{fmt(kpis.totalEre)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Indicatief, separate uitbetaling</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="portal-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="cockpit-section-label">Gem. opbrengst per kwartaal</p>
                <p className="text-xl font-semibold mt-1 tabular-nums">{fmt(kpis.avgQuarterly)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter — gecentreerd boven de afrekeningen */}
      <div className="flex justify-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px] portal-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="calculated">Berekend</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
            <SelectItem value="paid">Uitbetaald</SelectItem>
            <SelectItem value="charged_back">Geïncasseerd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Afrekeningen */}
      <div className="space-y-4">
        {filtered.map((s: any) => {
          // ERE-commissie loopt niet via e-charging — niet meer aftrekken in onze breakdown.
          const subscriptionCosts = Number(s.total_platform_fee || 0) + Number(s.total_transaction_fees || 0);
          const ereEstimate = Number(s.ere_estimate || 0);
          return (
            <Card key={s.id} className="portal-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="cockpit-section-label tracking-[0.28em] text-foreground/90">
                    Afrekening {periodLabel(s.year, s.quarter)}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {statusIcon(s.status)}
                    <span>{statusText(s.status, s.paid_at)}</span>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bruto laadopbrengst</span>
                    <span className="tabular-nums">{fmt(Number(s.gross_revenue))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stroominkoop (vergoeding)</span>
                    <span className="tabular-nums">-{fmt(Number(s.total_energy_cost))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Abonnementskosten E-Charging</span>
                    <span className="tabular-nums">-{fmt(subscriptionCosts)}</span>
                  </div>
                  <div className="border-t border-border my-3" />
                  <div className="flex justify-between font-medium">
                    <span>Netto laadopbrengst</span>
                    <span className="tabular-nums">{fmt(Number(s.net_margin))}</span>
                  </div>
                  <div className="border-t border-border my-3" />
                  <div className="flex justify-between text-lg font-bold pt-1">
                    <span>Uw uitbetaling via E-Charging ({client?.revenue_share_percentage || 75}%)</span>
                    <span className="text-primary tabular-nums">{fmt(Number(s.client_payout))}</span>
                  </div>
                </div>

                {/* Aparte ERE-sectie — separate cashflow via Laadbeloning */}
                {ereEstimate > 0 && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-foreground/90">Geschatte ERE-opbrengst</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Via Laadbeloning — niet via E-Charging uitbetaald
                        </p>
                      </div>
                      <span className="tabular-nums text-base font-semibold text-green-400">
                        ~{fmt(ereEstimate)}
                      </span>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-5 pt-4 border-t border-border italic leading-relaxed">
                  Uw E-Charging-uitbetaling is uw revenue-share-deel op de laadopbrengst. ERE's worden door Laadbeloning bij de NEa ingeboekt en separaat aan u uitbetaald — het bedrag hierboven is een indicatie. Stroominkoop wordt afzonderlijk vergoed op basis van het contract-tarief.
                </p>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && !isLoading && (
          <Card className="portal-card">
            <CardContent className="p-12 text-center text-muted-foreground">
              Geen afrekeningen gevonden.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
