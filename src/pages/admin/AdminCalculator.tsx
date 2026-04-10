import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calculator, FileText, Info, UserPlus } from "lucide-react";
import { useOrganization } from "@/hooks/useAdminData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

export default function AdminCalculator() {
  const { data: org } = useOrganization();
  const navigate = useNavigate();

  const [chargePoints, setChargePoints] = useState(10);
  const [kwhPerMonth, setKwhPerMonth] = useState(500);
  const [energyCost, setEnergyCost] = useState<number | null>(null);
  const [chargeRate, setChargeRate] = useState<number | null>(null);
  const [type, setType] = useState<"ac" | "dc">("ac");
  const [revenueShare, setRevenueShare] = useState<number | null>(null);
  const [hasSolar, setHasSolar] = useState(false);
  const [solarPct, setSolarPct] = useState(30);
  const [ereRate, setEreRate] = useState<number | null>(null);

  // Use org defaults as fallbacks
  const effectiveEnergyCost = energyCost ?? Number(org?.default_energy_cost_per_kwh || 0.25);
  const effectiveChargeRate = chargeRate ?? Number(org?.default_charge_rate_per_kwh || 0.45);
  const effectiveRevenueShare = revenueShare ?? Number(org?.default_revenue_share_pct || 50);
  const effectiveEreRate = ereRate ?? Number(org?.default_ere_rate_per_kwh || 0.10);

  const calc = useMemo(() => {
    const platformCostPerSocket = type === "ac" ? Number(org?.default_eflux_cost_ac || 5.50) : Number(org?.default_eflux_cost_dc || 10.40);
    const totalKwhMonth = chargePoints * kwhPerMonth;
    const totalKwhYear = totalKwhMonth * 12;
    const grossRevenueYear = totalKwhYear * effectiveChargeRate;
    const energyCostYear = totalKwhYear * effectiveEnergyCost;
    const platformCostYear = chargePoints * platformCostPerSocket * 12;
    const netMarginYear = grossRevenueYear - energyCostYear - platformCostYear;
    const clientShareYear = netMarginYear * (effectiveRevenueShare / 100);
    const echargingShareYear = netMarginYear * ((100 - effectiveRevenueShare) / 100);

    // ERE berekening
    let ereMultiplier = 0.505;
    if (hasSolar && solarPct > 0) {
      ereMultiplier = Math.min(1, 0.505 + (solarPct / 100) * 0.495);
    }
    const ereEstimateYear = totalKwhYear * effectiveEreRate * ereMultiplier;
    const clientTotalYear = clientShareYear + ereEstimateYear;

    // Per maand
    const clientShareMonth = clientShareYear / 12;
    const echargingShareMonth = echargingShareYear / 12;
    const ereMonth = ereEstimateYear / 12;

    return {
      totalKwhYear,
      grossRevenueYear,
      energyCostYear,
      platformCostYear,
      platformCostPerSocket,
      netMarginYear,
      clientShareYear,
      echargingShareYear,
      ereEstimateYear,
      clientTotalYear,
      echargingTotalYear: echargingShareYear + platformCostYear,
      clientShareMonth,
      echargingShareMonth,
      ereMonth,
      marginPerKwh: totalKwhYear > 0 ? netMarginYear / totalKwhYear : 0,
    };
  }, [chargePoints, kwhPerMonth, effectiveEnergyCost, effectiveChargeRate, type, effectiveRevenueShare, hasSolar, solarPct, effectiveEreRate, org]);

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRound = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleCreateQuote = () => {
    const params = new URLSearchParams({
      cp: String(chargePoints),
      kwh: String(kwhPerMonth),
      energy: String(effectiveEnergyCost),
      rate: String(effectiveChargeRate),
      type,
      share: String(effectiveRevenueShare),
      solar: hasSolar ? String(solarPct) : "0",
      ere: String(effectiveEreRate),
    });
    navigate(`/admin/offertes/nieuw?${params.toString()}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calculator</h1>
        <span className="text-sm text-muted-foreground">Standaardwaarden uit organisatie-instellingen</span>
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
                  <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>Standaard: {fmt(Number(org?.default_charge_rate_per_kwh || 0.45))}</TooltipContent></Tooltip>
                </Label>
                <Input type="number" step="0.01" placeholder={String(Number(org?.default_charge_rate_per_kwh || 0.45))} value={chargeRate ?? ""} onChange={e => setChargeRate(e.target.value ? Number(e.target.value) : null)} />
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
                <Input type="number" placeholder={String(Number(org?.default_revenue_share_pct || 50))} value={revenueShare ?? ""} onChange={e => setRevenueShare(e.target.value ? Number(e.target.value) : null)} min={0} max={100} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ERE-tarief (€/kWh)</Label>
                <Input type="number" step="0.01" placeholder={String(Number(org?.default_ere_rate_per_kwh || 0.10))} value={ereRate ?? ""} onChange={e => setEreRate(e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={hasSolar} onCheckedChange={setHasSolar} />
                  <Label>Zonnepanelen</Label>
                </div>
                {hasSolar && (
                  <div>
                    <Label className="text-xs">Zonnepercentage (%)</Label>
                    <Input type="number" value={solarPct} onChange={e => setSolarPct(Number(e.target.value))} min={0} max={100} />
                  </div>
                )}
              </div>
            </div>

            {/* Summary strip */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              {chargePoints} laadpunten × {kwhPerMonth} kWh/mnd = <strong className="text-foreground">{(chargePoints * kwhPerMonth).toLocaleString("nl-NL")} kWh/mnd</strong>
              {" "}({(chargePoints * kwhPerMonth * 12).toLocaleString("nl-NL")} kWh/jaar)
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
              <div className="flex justify-between"><span>Bruto laadopbrengst/jaar</span><span>{fmtRound(calc.grossRevenueYear)}</span></div>
              <div className="flex justify-between"><span>Stroomkosten/jaar</span><span className="text-destructive">-{fmtRound(calc.energyCostYear)}</span></div>
              <div className="flex justify-between"><span>e-Flux platformkosten/jaar</span><span className="text-destructive">-{fmtRound(calc.platformCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Netto laadmarge/jaar</span><span>{fmtRound(calc.netMarginYear)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Marge per kWh</span><span>{fmt(calc.marginPerKwh)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-semibold"><span>Klantaandeel ({effectiveRevenueShare}%)</span><span>{fmtRound(calc.clientShareYear)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>ERE-schatting/jaar</span><span>{fmtRound(calc.ereEstimateYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Totaal geschat/jaar</span><span>{fmtRound(calc.clientTotalYear)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Per maand</span><span>{fmt(calc.clientShareMonth + calc.ereMonth)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resultaat voor E-Charging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>E-Charging marge ({100 - effectiveRevenueShare}%)</span><span>{fmtRound(calc.echargingShareYear)}</span></div>
              <div className="flex justify-between"><span>Doorberekening platformkosten</span><span>{fmtRound(calc.platformCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-bold"><span>E-Charging omzet/jaar</span><span>{fmtRound(calc.echargingTotalYear)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Per maand</span><span>{fmt(calc.echargingShareMonth + calc.platformCostYear / 12)}</span>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" onClick={handleCreateQuote}>
            <FileText className="w-4 h-4 mr-2" />
            Maak offerte met deze parameters
          </Button>
        </div>
      </div>
    </div>
  );
}
