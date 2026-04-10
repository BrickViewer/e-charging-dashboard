import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Calculator } from "lucide-react";
import { useOrganization, useAllClients } from "@/hooks/useAdminData";
import { calculateMonthly, formatEuro } from "@/services/calculations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function AdminQuoteCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: org } = useOrganization();
  const { data: clients } = useAllClients();
  const [saving, setSaving] = useState(false);

  // Prospect fields
  const [prospectCompany, setProspectCompany] = useState("");
  const [prospectContact, setProspectContact] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [linkedClientId, setLinkedClientId] = useState<string>("none");

  // Parameters from URL or defaults
  const [chargePoints, setChargePoints] = useState(Number(params.get("cp")) || 10);
  const [kwhPerMonth, setKwhPerMonth] = useState(Number(params.get("kwh")) || 500);
  const [chargeRate, setChargeRate] = useState(Number(params.get("rate")) || Number(org?.default_charge_rate_per_kwh || 0.45));
  const [energyCost, setEnergyCost] = useState(Number(params.get("energy")) || Number(org?.default_energy_cost_per_kwh || 0.25));
  const [cpType, setCpType] = useState<string>(params.get("type") || "ac");
  const [revenueShare, setRevenueShare] = useState(Number(params.get("share")) || Number(org?.default_revenue_share_pct || 50));
  const [ereRate, setEreRate] = useState(Number(params.get("ere")) || Number(org?.default_ere_rate_per_kwh || 0.10));
  const [hasSolar, setHasSolar] = useState(Number(params.get("solar")) > 0);
  const [solarPct, setSolarPct] = useState(Number(params.get("solar")) || 30);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });

  const platformCost = cpType === "ac" ? Number(org?.default_eflux_cost_ac || 5.50) : Number(org?.default_eflux_cost_dc || 10.40);

  const calc = useMemo(() => {
    const monthly = calculateMonthly({
      numChargePoints: chargePoints,
      kwhPerPointPerMonth: kwhPerMonth,
      chargeRatePerKwh: chargeRate,
      energyCostPerKwh: energyCost,
      revenueSharePct: revenueShare,
      efluxCostPerSocket: platformCost,
      ereRatePerKwh: ereRate,
      hasSolar,
      solarPercentage: solarPct,
    });
    return {
      ...monthly,
      grossRevenueYear: monthly.grossRevenue * 12,
      energyCostYear: monthly.energyCost * 12,
      efluxCostYear: monthly.efluxCost * 12,
      netMarginYear: monthly.netMargin * 12,
      clientShareYear: monthly.clientShare * 12,
      echargingShareYear: monthly.echargingShare * 12,
      ereEstimateYear: monthly.ereEstimate * 12,
      clientTotalYear: monthly.totalClientIncome * 12,
      echargingTotalYear: monthly.totalEchargingIncome * 12,
    };
  }, [chargePoints, kwhPerMonth, chargeRate, energyCost, revenueShare, platformCost, ereRate, hasSolar, solarPct]);

  const fmt = (v: number) => formatEuro(v);
  const fmtRound = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleSave = async () => {
    const company = linkedClientId !== "none"
      ? clients?.find(c => c.id === linkedClientId)?.company_name || prospectCompany
      : prospectCompany;

    if (!company.trim()) {
      toast.error("Vul een bedrijfsnaam in");
      return;
    }
    if (!org?.id) {
      toast.error("Organisatie niet gevonden");
      return;
    }

    setSaving(true);
    try {
      const quoteNumber = `OFF-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase.from("quotes").insert({
        organization_id: org.id,
        client_id: linkedClientId !== "none" ? linkedClientId : null,
        prospect_company: company,
        prospect_contact: prospectContact || null,
        prospect_email: prospectEmail || null,
        quote_number: quoteNumber,
        num_charge_points: chargePoints,
        charge_point_type: cpType,
        estimated_kwh_per_point: kwhPerMonth,
        charge_rate_per_kwh: chargeRate,
        energy_cost_per_kwh: energyCost,
        revenue_share_pct: revenueShare,
        ere_rate_per_kwh: ereRate,
        has_solar: hasSolar,
        solar_percentage: hasSolar ? solarPct : 0,
        notes: notes || null,
        valid_until: validUntil,
        status: "concept",
        calculation_snapshot: {
          grossRevenueYear: calc.grossRevenueYear,
          energyCostYear: calc.energyCostYear,
          efluxCostYear: calc.efluxCostYear,
          netMarginYear: calc.netMarginYear,
          clientShareYear: calc.clientShareYear,
          echargingShareYear: calc.echargingShareYear,
          ereEstimateYear: calc.ereEstimateYear,
          clientTotalYear: calc.clientTotalYear,
          echargingTotalYear: calc.echargingTotalYear,
        },
      }).select().single();

      if (error) throw error;
      toast.success("Offerte aangemaakt");
      navigate(`/admin/offertes/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/admin/offertes">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-2xl font-semibold">Nieuwe offerte</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Prospect / Klant</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Koppel aan bestaande klant</Label>
                <Select value={linkedClientId} onValueChange={setLinkedClientId}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nieuwe prospect —</SelectItem>
                    {(clients || []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {linkedClientId === "none" && (
                <>
                  <div>
                    <Label>Bedrijfsnaam *</Label>
                    <Input value={prospectCompany} onChange={e => setProspectCompany(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Contactpersoon</Label>
                      <Input value={prospectContact} onChange={e => setProspectContact(e.target.value)} />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input type="email" value={prospectEmail} onChange={e => setProspectEmail(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="w-4 h-4" /> Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Aantal laadpunten</Label>
                  <Input type="number" value={chargePoints} onChange={e => setChargePoints(Number(e.target.value))} min={1} />
                </div>
                <div>
                  <Label>kWh/punt/maand</Label>
                  <Input type="number" value={kwhPerMonth} onChange={e => setKwhPerMonth(Number(e.target.value))} min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Laadtarief (€/kWh)</Label>
                  <Input type="number" step="0.01" value={chargeRate} onChange={e => setChargeRate(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Energiekost (€/kWh)</Label>
                  <Input type="number" step="0.01" value={energyCost} onChange={e => setEnergyCost(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={cpType} onValueChange={setCpType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ac">AC</SelectItem>
                      <SelectItem value="dc">DC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Klantaandeel (%)</Label>
                  <Input type="number" value={revenueShare} onChange={e => setRevenueShare(Number(e.target.value))} min={0} max={100} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ERE-tarief (€/kWh)</Label>
                  <Input type="number" step="0.01" value={ereRate} onChange={e => setEreRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={hasSolar} onCheckedChange={setHasSolar} />
                    <Label>Zonnepanelen</Label>
                  </div>
                  {hasSolar && (
                    <Input type="number" value={solarPct} onChange={e => setSolarPct(Number(e.target.value))} min={0} max={100} placeholder="%" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Extra</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Geldig tot</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
              <div>
                <Label>Notities</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Calculation preview */}
        <div className="space-y-4">
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-primary text-base">Berekening — Jaarbasis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Bruto laadopbrengst</span><span>{fmtRound(calc.grossRevenueYear)}</span></div>
              <div className="flex justify-between"><span>Stroomkosten</span><span className="text-destructive">-{fmtRound(calc.energyCostYear)}</span></div>
              <div className="flex justify-between"><span>Platformkosten</span><span className="text-destructive">-{fmtRound(calc.efluxCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Netto marge</span><span>{fmtRound(calc.netMarginYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-semibold"><span>Klantaandeel ({revenueShare}%)</span><span>{fmtRound(calc.clientShareYear)}</span></div>
              <div className="flex justify-between"><span>ERE-schatting</span><span>{fmtRound(calc.ereEstimateYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Totaal klant/jaar</span><span>{fmtRound(calc.clientTotalYear)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Per maand</span><span>{fmt(calc.clientTotalYear / 12)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">E-Charging resultaat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>E-Charging marge ({100 - revenueShare}%)</span><span>{fmtRound(calc.echargingShareYear)}</span></div>
              <div className="flex justify-between"><span>Platformkosten doorbelasting</span><span>{fmtRound(calc.efluxCostYear)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-bold"><span>E-Charging omzet/jaar</span><span>{fmtRound(calc.echargingTotalYear)}</span></div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Opslaan..." : "Offerte opslaan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
