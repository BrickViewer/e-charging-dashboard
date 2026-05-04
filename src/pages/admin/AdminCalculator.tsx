import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, FileText, Info, UserPlus } from "lucide-react";
import { useOrganization } from "@/hooks/useAdminData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { calculateYearly, formatEuro } from "@/services/calculations";

export default function AdminCalculator() {
  const { data: org } = useOrganization();
  const navigate = useNavigate();

  const [chargePoints, setChargePoints] = useState(10);
  const [kwhPerMonth, setKwhPerMonth] = useState(500);
  const [energyCost, setEnergyCost] = useState<number | null>(null);
  const [chargeRate, setChargeRate] = useState<number | null>(null);
  const [type, setType] = useState<"ac" | "dc">("ac");
  const [revenueShare, setRevenueShare] = useState<number | null>(null);
  const [ereRate, setEreRate] = useState<number | null>(null);

  const effectiveEnergyCost = energyCost ?? Number(org?.default_energy_cost_per_kwh || 0.25);
  const effectiveChargeRate = chargeRate ?? Number(org?.default_charge_rate_per_kwh || 0.55);
  const effectiveRevenueShare = revenueShare ?? Number(org?.default_revenue_share_pct || 75);
  const effectiveEreRate = ereRate ?? Number(org?.default_ere_rate_per_kwh || 0.10);

  const calc = useMemo(() => {
    const platformCostPerSocket = type === "ac"
      ? Number(org?.default_eflux_cost_ac || 5.50)
      : Number(org?.default_eflux_cost_dc || 10.40);

    return calculateYearly({
      numChargePoints: chargePoints,
      kwhPerPointPerMonth: kwhPerMonth,
      chargeRatePerKwh: effectiveChargeRate,
      energyCostPerKwh: effectiveEnergyCost,
      revenueSharePct: effectiveRevenueShare,
      efluxCostPerSocket: platformCostPerSocket,
      ereRatePerKwh: effectiveEreRate,
    });
  }, [chargePoints, kwhPerMonth, effectiveEnergyCost, effectiveChargeRate, type, effectiveRevenueShare, effectiveEreRate, org]);

  const fmt = (v: number) => formatEuro(v);
  const fmtRound = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const marginPerKwh = calc.totalKwh > 0 ? calc.netLaadmarge / calc.totalKwh : 0;
  const platformCostPerSocket = type === "ac"
    ? Number(org?.default_eflux_cost_ac || 5.50)
    : Number(org?.default_eflux_cost_dc || 10.40);

  const handleCreateQuote = () => {
    const params = new URLSearchParams({
      cp: String(chargePoints),
      kwh: String(kwhPerMonth),
      energy: String(effectiveEnergyCost),
      rate: String(effectiveChargeRate),
      type,
      share: String(effectiveRevenueShare),
      ere: String(effectiveEreRate),
    });
    navigate(`/admin/offertes/nieuw?${params.toString()}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calculator</h1>
        <span className="text-sm text-muted-foreground">12-maanden contract · 75/25 verdeling</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="w-5 h-5" />
              Invoer parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aantal laadpunten</Label>
                <Input type="number" value={chargePoints} onChange={e => setChargePoints(Number(e.target.value))} min={1} />
              </div>
              <div>
                <Label>kWh/laadpunt/maand</Label>
                <Input type="number" value={kwhPerMonth} onChange={e => setKwhPerMonth(Number(e.target.value))} min={0} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-1">
                  Stroominkoop (€/kWh)
                  <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>Standaard: {fmt(Number(org?.default_energy_cost_per_kwh || 0.25))}</TooltipContent></Tooltip>
                </Label>
                <Input type="number" step="0.01" placeholder={String(Number(org?.default_energy_cost_per_kwh || 0.25))} value={energyCost ?? ""} onChange={e => setEnergyCost(e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Laadtarief (€/kWh)
                  <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>Standaard: {fmt(Number(org?.default_charge_rate_per_kwh || 0.55))}</TooltipContent></Tooltip>
                </Label>
                <Input type="number" step="0.01" placeholder={String(Number(org?.default_charge_rate_per_kwh || 0.55))} value={chargeRate ?? ""} onChange={e => setChargeRate(e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type laadpunt</Label>
                <Select value={type} onValueChange={(v: "ac" | "dc") => setType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ac">AC (11/22 kW) — {fmt(Number(org?.default_eflux_cost_ac || 5.50))}/mnd</SelectItem>
                    <SelectItem value="dc">DC (snellader) — {fmt(Number(org?.default_eflux_cost_dc || 10.40))}/mnd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Klantaandeel (%)</Label>
                <Input type="number" placeholder={String(Number(org?.default_revenue_share_pct || 75))} value={revenueShare ?? ""} onChange={e => setRevenueShare(e.target.value ? Number(e.target.value) : null)} min={0} max={100} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ERE-tarief (€/kWh)</Label>
                <Input type="number" step="0.01" placeholder={String(Number(org?.default_ere_rate_per_kwh || 0.10))} value={ereRate ?? ""} onChange={e => setEreRate(e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              {chargePoints} laadpunten × {kwhPerMonth} kWh/mnd = <strong className="text-foreground">{(chargePoints * kwhPerMonth).toLocaleString("nl-NL")} kWh/mnd</strong>
              {" "}({calc.totalKwh.toLocaleString("nl-NL")} kWh/jaar)
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-primary text-base">Resultaat voor de klant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Bruto laadopbrengst/jaar</span><span>{fmtRound(calc.grossRevenue)}</span></div>
              <div className="flex justify-between"><span>Stroominkoop/jaar</span><span className="text-destructive">-{fmtRound(calc.energyCost)}</span></div>
              <div className="flex justify-between"><span>e-Flux platformkosten/jaar</span><span className="text-destructive">-{fmtRound(calc.efluxPlatformFee)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Netto laadmarge/jaar</span><span>{fmtRound(calc.netLaadmarge)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Marge per kWh</span><span>{fmt(marginPerKwh)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between"><span>Bruto ERE-opbrengst/jaar</span><span>{fmtRound(calc.grossEre)}</span></div>
              <div className="flex justify-between"><span>Laadbeloning commissie (10%)</span><span className="text-destructive">-{fmtRound(calc.ereCommission)}</span></div>
              <div className="flex justify-between font-medium"><span>Netto ERE/jaar</span><span>{fmtRound(calc.netEre)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Totaal netto opbrengst</span><span>{fmtRound(calc.netMargin)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Klant ontvangt ({effectiveRevenueShare}%)</span><span>{fmtRound(calc.clientPayout)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Per kwartaal</span><span>{fmt(calc.clientPayout / 4)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resultaat voor E-Charging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between font-bold"><span>E-Charging omzet ({100 - effectiveRevenueShare}%)</span><span>{fmtRound(calc.echargingRevenue)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Per maand</span><span>{fmt(calc.echargingRevenue / 12)}</span>
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                Recurring uit revenue-share. Hardware-marge (eenmalig bij plaatsing) en partner-kickbacks staan los hiervan.
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button className="flex-1" size="lg" onClick={handleCreateQuote}>
              <FileText className="w-4 h-4 mr-2" />Maak offerte
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/admin/klanten/nieuw", { state: { fromCalculator: true, chargeRate: effectiveChargeRate, energyCost: effectiveEnergyCost, revenueShare: effectiveRevenueShare, ereRate: effectiveEreRate, numChargePoints: chargePoints, chargePointType: type } })}>
              <UserPlus className="w-4 h-4 mr-2" />Maak klant aan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
