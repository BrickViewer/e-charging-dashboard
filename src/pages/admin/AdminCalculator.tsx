import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, FileText } from "lucide-react";

export default function AdminCalculator() {
  const [chargePoints, setChargePoints] = useState(10);
  const [kwhPerMonth, setKwhPerMonth] = useState(500);
  const [energyCost, setEnergyCost] = useState(0.25);
  const [chargeRate, setChargeRate] = useState(0.45);
  const [type, setType] = useState<"ac" | "dc">("ac");
  const [revenueShare, setRevenueShare] = useState(50);

  const calc = useMemo(() => {
    const platformCostPerSocket = type === "ac" ? 5.50 : 10.40;
    const totalKwhYear = chargePoints * kwhPerMonth * 12;
    const grossRevenueYear = totalKwhYear * chargeRate;
    const energyCostYear = totalKwhYear * energyCost;
    const platformCostYear = chargePoints * platformCostPerSocket * 12;
    const netMarginYear = grossRevenueYear - energyCostYear - platformCostYear;
    const clientShareYear = netMarginYear * (revenueShare / 100);
    const echargingShareYear = netMarginYear * ((100 - revenueShare) / 100);
    const ereEstimateYear = totalKwhYear * 0.10;
    const clientTotalYear = clientShareYear + ereEstimateYear;

    return {
      totalKwhYear,
      grossRevenueYear,
      energyCostYear,
      platformCostYear,
      netMarginYear,
      clientShareYear,
      echargingShareYear,
      ereEstimateYear,
      clientTotalYear,
      echargingTotalYear: echargingShareYear + platformCostYear,
    };
  }, [chargePoints, kwhPerMonth, energyCost, chargeRate, type, revenueShare]);

  const fmt = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Offertes & Calculator</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Invoer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <Label>Stroominkoop (€/kWh)</Label>
                <Input type="number" step="0.01" value={energyCost} onChange={e => setEnergyCost(Number(e.target.value))} />
              </div>
              <div>
                <Label>Laadtarief (€/kWh)</Label>
                <Input type="number" step="0.01" value={chargeRate} onChange={e => setChargeRate(Number(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type laadpunt</Label>
                <Select value={type} onValueChange={(v: "ac" | "dc") => setType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ac">AC (11/22 kW)</SelectItem>
                    <SelectItem value="dc">DC (snellader)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Klantaandeel (%)</Label>
                <Input type="number" value={revenueShare} onChange={e => setRevenueShare(Number(e.target.value))} min={0} max={100} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary">Resultaat voor de klant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Bruto laadopbrengst/jaar</span><span>{fmt(calc.grossRevenueYear)}</span></div>
              <div className="flex justify-between"><span>Stroomkosten/jaar</span><span>-{fmt(calc.energyCostYear)}</span></div>
              <div className="flex justify-between"><span>e-Flux kosten/jaar</span><span>-{fmt(calc.platformCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Netto laadmarge/jaar</span><span>{fmt(calc.netMarginYear)}</span></div>
              <div className="flex justify-between font-semibold"><span>Klantaandeel ({revenueShare}%)</span><span>{fmt(calc.clientShareYear)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>ERE-schatting/jaar</span><span>{fmt(calc.ereEstimateYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Totaal geschat/jaar</span><span>{fmt(calc.clientTotalYear)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultaat voor E-Charging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>E-Charging marge ({100 - revenueShare}%)</span><span>{fmt(calc.echargingShareYear)}</span></div>
              <div className="flex justify-between"><span>Doorberekening e-Flux kosten</span><span>{fmt(calc.platformCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-bold"><span>E-Charging omzet/jaar</span><span>{fmt(calc.echargingTotalYear)}</span></div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg">
            <FileText className="w-4 h-4 mr-2" />
            Maak offerte
          </Button>
        </div>
      </div>
    </div>
  );
}
