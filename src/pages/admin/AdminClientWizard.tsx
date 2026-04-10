import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useAdminData";
import { useAuth } from "@/contexts/AuthContext";
import { calculateMonthly } from "@/services/calculations";
import { formatEuro } from "@/services/calculations";
import { StepperWizard } from "@/components/admin/StepperWizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Plus, Trash2, Pencil } from "lucide-react";

const STEPS = ["Klantgegevens", "Locaties", "Laadpunten", "Tarieven", "Bevestigen"];

interface LocationData {
  name: string; address: string; postal_code: string; city: string;
  property_type: string; parking_spots: string; ean_code: string;
  has_solar: boolean; solar_capacity_kwp: string;
  chargePointCount: string;
  chargePoints: { name: string; type: string; brand: string; model: string }[];
}

const emptyLocation = (): LocationData => ({
  name: "", address: "", postal_code: "", city: "",
  property_type: "kantoor", parking_spots: "", ean_code: "",
  has_solar: false, solar_capacity_kwp: "",
  chargePointCount: "2",
  chargePoints: [
    { name: "LP-001", type: "ac_11", brand: "", model: "" },
    { name: "LP-002", type: "ac_11", brand: "", model: "" },
  ],
});

export default function AdminClientWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useOrganization();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [company, setCompany] = useState({ company_name: "", kvk: "", contact_name: "", contact_email: "", contact_phone: "", billing_street: "", billing_postal: "", billing_city: "" });

  // Step 2
  const [locations, setLocations] = useState<LocationData[]>([emptyLocation()]);

  // Step 4
  const [tariff, setTariff] = useState({
    charge_rate: "0.45", energy_cost: "0.25", revenue_share: "50", ere_rate: "0.10",
  });

  const updateLocation = (idx: number, partial: Partial<LocationData>) => {
    setLocations(prev => prev.map((l, i) => i === idx ? { ...l, ...partial } : l));
  };

  const updateChargePointCount = (locIdx: number, count: string) => {
    const n = Math.max(0, Math.min(50, parseInt(count) || 0));
    setLocations(prev => prev.map((l, i) => {
      if (i !== locIdx) return l;
      const cps = Array.from({ length: n }, (_, j) => (
        l.chargePoints[j] || { name: `LP-${String(j + 1).padStart(3, "0")}`, type: "ac_11", brand: "", model: "" }
      ));
      return { ...l, chargePointCount: String(n), chargePoints: cps };
    }));
  };

  const updateCP = (locIdx: number, cpIdx: number, partial: Partial<LocationData["chargePoints"][0]>) => {
    setLocations(prev => prev.map((l, i) => {
      if (i !== locIdx) return l;
      const cps = l.chargePoints.map((cp, j) => j === cpIdx ? { ...cp, ...partial } : cp);
      return { ...l, chargePoints: cps };
    }));
  };

  // Calculation preview
  const totalCPs = locations.reduce((s, l) => s + l.chargePoints.length, 0);
  const calc = calculateMonthly({
    numChargePoints: totalCPs,
    kwhPerPointPerMonth: 500,
    chargeRatePerKwh: parseFloat(tariff.charge_rate) || 0.45,
    energyCostPerKwh: parseFloat(tariff.energy_cost) || 0.25,
    revenueSharePct: parseFloat(tariff.revenue_share) || 50,
    efluxCostPerSocket: 5.50,
    ereRatePerKwh: parseFloat(tariff.ere_rate) || 0.10,
    hasSolar: locations.some(l => l.has_solar),
    solarPercentage: 0,
  });

  const canNext = () => {
    if (step === 0) return company.company_name.trim() && company.contact_name.trim() && company.contact_email.trim();
    if (step === 1) return locations.length > 0 && locations.every(l => l.name.trim() && l.address.trim());
    return true;
  };

  const handleSave = async () => {
    if (!org) { toast.error("Organisatie niet gevonden"); return; }
    setSaving(true);
    try {
      // 1. Insert client
      const { data: client, error: clientErr } = await supabase.from("clients").insert({
        organization_id: org.id,
        company_name: company.company_name,
        kvk: company.kvk || null,
        contact_name: company.contact_name,
        contact_email: company.contact_email,
        contact_phone: company.contact_phone || null,
        billing_address_street: company.billing_street || null,
        billing_address_postal: company.billing_postal || null,
        billing_address_city: company.billing_city || null,
        charge_rate_per_kwh: parseFloat(tariff.charge_rate) || 0.45,
        energy_cost_per_kwh: parseFloat(tariff.energy_cost) || 0.25,
        revenue_share_percentage: parseFloat(tariff.revenue_share) || 50,
        ere_rate_per_kwh: parseFloat(tariff.ere_rate) || 0.10,
        status: "prospect",
      }).select().single();
      if (clientErr) throw clientErr;

      // 2. Insert locations + charge_points
      for (const loc of locations) {
        const { data: locData, error: locErr } = await supabase.from("locations").insert({
          client_id: client.id,
          name: loc.name,
          address: loc.address,
          postal_code: loc.postal_code || null,
          city: loc.city || null,
          property_type: loc.property_type,
          parking_spots: parseInt(loc.parking_spots) || null,
          ean_code: loc.ean_code || null,
          has_solar: loc.has_solar,
          solar_capacity_kwp: loc.has_solar ? (parseFloat(loc.solar_capacity_kwp) || null) : null,
        }).select().single();
        if (locErr) throw locErr;

        if (loc.chargePoints.length > 0) {
          const cpRows = loc.chargePoints.map(cp => ({
            location_id: locData.id,
            name: cp.name,
            type: cp.type,
            brand: cp.brand || null,
            model: cp.model || null,
          }));
          const { error: cpErr } = await supabase.from("charge_points").insert(cpRows);
          if (cpErr) throw cpErr;
        }
      }

      // 3. Insert tariff profile
      await supabase.from("tariff_profiles").insert({
        client_id: client.id,
        charge_rate_per_kwh: parseFloat(tariff.charge_rate) || 0.45,
        energy_cost_per_kwh: parseFloat(tariff.energy_cost) || 0.25,
        ere_rate_per_kwh: parseFloat(tariff.ere_rate) || 0.10,
      });

      // 4. Activity log
      await supabase.from("activity_log").insert({
        client_id: client.id,
        organization_id: org.id,
        user_id: user?.id,
        action: "client_created",
        description: `Klant ${company.company_name} aangemaakt`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success("Klant succesvol aangemaakt");
      navigate(`/admin/klanten/${client.id}`);
    } catch (err: any) {
      toast.error("Fout bij opslaan: " + (err.message || "Onbekende fout"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/klanten")}>
          <ArrowLeft className="w-4 h-4 mr-1" />Terug
        </Button>
        <h1 className="text-2xl font-semibold">Nieuwe klant</h1>
      </div>

      <StepperWizard steps={STEPS} currentStep={step} />

      {/* Step 1: Klantgegevens */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Klantgegevens</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Bedrijfsnaam *</Label><Input value={company.company_name} onChange={e => setCompany(p => ({ ...p, company_name: e.target.value }))} /></div>
              <div><Label>KVK-nummer</Label><Input value={company.kvk} onChange={e => setCompany(p => ({ ...p, kvk: e.target.value }))} /></div>
              <div><Label>Contactpersoon *</Label><Input value={company.contact_name} onChange={e => setCompany(p => ({ ...p, contact_name: e.target.value }))} /></div>
              <div><Label>E-mail *</Label><Input type="email" value={company.contact_email} onChange={e => setCompany(p => ({ ...p, contact_email: e.target.value }))} /></div>
              <div><Label>Telefoon</Label><Input value={company.contact_phone} onChange={e => setCompany(p => ({ ...p, contact_phone: e.target.value }))} /></div>
            </div>
            <div className="pt-2">
              <p className="text-sm font-medium mb-2">Factuuradres</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label>Straat + nr</Label><Input value={company.billing_street} onChange={e => setCompany(p => ({ ...p, billing_street: e.target.value }))} /></div>
                <div><Label>Postcode</Label><Input value={company.billing_postal} onChange={e => setCompany(p => ({ ...p, billing_postal: e.target.value }))} /></div>
                <div><Label>Stad</Label><Input value={company.billing_city} onChange={e => setCompany(p => ({ ...p, billing_city: e.target.value }))} /></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Locaties */}
      {step === 1 && (
        <div className="space-y-4">
          {locations.map((loc, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Locatie {i + 1}</CardTitle>
                {locations.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setLocations(prev => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Naam *</Label><Input value={loc.name} onChange={e => updateLocation(i, { name: e.target.value })} /></div>
                  <div><Label>Adres *</Label><Input value={loc.address} onChange={e => updateLocation(i, { address: e.target.value })} /></div>
                  <div><Label>Postcode</Label><Input value={loc.postal_code} onChange={e => updateLocation(i, { postal_code: e.target.value })} /></div>
                  <div><Label>Stad</Label><Input value={loc.city} onChange={e => updateLocation(i, { city: e.target.value })} /></div>
                  <div>
                    <Label>Pandtype</Label>
                    <Select value={loc.property_type} onValueChange={v => updateLocation(i, { property_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kantoor">Kantoor</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="hotel">Hotel</SelectItem>
                        <SelectItem value="wooncomplex">Wooncomplex</SelectItem>
                        <SelectItem value="parkeergarage">Parkeergarage</SelectItem>
                        <SelectItem value="overig">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Parkeerplaatsen</Label><Input type="number" value={loc.parking_spots} onChange={e => updateLocation(i, { parking_spots: e.target.value })} /></div>
                  <div><Label>EAN-code</Label><Input value={loc.ean_code} onChange={e => updateLocation(i, { ean_code: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={loc.has_solar} onCheckedChange={v => updateLocation(i, { has_solar: v })} />
                    <Label>Zonnepanelen</Label>
                  </div>
                  {loc.has_solar && (
                    <div className="flex items-center gap-2">
                      <Label>Capaciteit (kWp)</Label>
                      <Input type="number" className="w-24" value={loc.solar_capacity_kwp} onChange={e => updateLocation(i, { solar_capacity_kwp: e.target.value })} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={() => setLocations(prev => [...prev, emptyLocation()])}>
            <Plus className="w-4 h-4 mr-2" />Locatie toevoegen
          </Button>
        </div>
      )}

      {/* Step 3: Laadpunten */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Laadpunten per locatie</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="0">
              <TabsList>
                {locations.map((l, i) => (
                  <TabsTrigger key={i} value={String(i)}>{l.name || `Locatie ${i + 1}`}</TabsTrigger>
                ))}
              </TabsList>
              {locations.map((loc, locIdx) => (
                <TabsContent key={locIdx} value={String(locIdx)} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Label>Aantal laadpunten</Label>
                    <Input type="number" className="w-20" value={loc.chargePointCount}
                      onChange={e => updateChargePointCount(locIdx, e.target.value)} />
                  </div>
                  {loc.chargePoints.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Naam</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Merk</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Model</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loc.chargePoints.map((cp, cpIdx) => (
                          <tr key={cpIdx} className="border-b border-border last:border-0">
                            <td className="p-2"><Input value={cp.name} onChange={e => updateCP(locIdx, cpIdx, { name: e.target.value })} className="h-8" /></td>
                            <td className="p-2">
                              <Select value={cp.type} onValueChange={v => updateCP(locIdx, cpIdx, { type: v })}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ac_11">AC 11 kW</SelectItem>
                                  <SelectItem value="ac_22">AC 22 kW</SelectItem>
                                  <SelectItem value="dc_50">DC 50 kW</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2"><Input value={cp.brand} onChange={e => updateCP(locIdx, cpIdx, { brand: e.target.value })} className="h-8" placeholder="Bijv. Alfen" /></td>
                            <td className="p-2"><Input value={cp.model} onChange={e => updateCP(locIdx, cpIdx, { model: e.target.value })} className="h-8" placeholder="Bijv. Eve Single" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Tarieven */}
      {step === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Tariefstructuur</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Laadtarief per kWh (€)</Label><Input type="number" step="0.01" value={tariff.charge_rate} onChange={e => setTariff(p => ({ ...p, charge_rate: e.target.value }))} /></div>
              <div><Label>Energiekost per kWh (€)</Label><Input type="number" step="0.01" value={tariff.energy_cost} onChange={e => setTariff(p => ({ ...p, energy_cost: e.target.value }))} /></div>
              <div><Label>Revenue share klant (%)</Label><Input type="number" step="1" value={tariff.revenue_share} onChange={e => setTariff(p => ({ ...p, revenue_share: e.target.value }))} /></div>
              <div><Label>ERE-tarief per kWh (€)</Label><Input type="number" step="0.01" value={tariff.ere_rate} onChange={e => setTariff(p => ({ ...p, ere_rate: e.target.value }))} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Maandelijkse schatting</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">Op basis van {totalCPs} laadpunten × 500 kWh/mnd</p>
              <div className="space-y-2">
                <div className="flex justify-between"><span>Bruto omzet</span><span className="font-medium">{formatEuro(calc.grossRevenue)}</span></div>
                <div className="flex justify-between"><span>Energiekosten</span><span className="font-medium text-destructive">-{formatEuro(calc.energyCost)}</span></div>
                <div className="flex justify-between"><span>e-Flux kosten</span><span className="font-medium text-destructive">-{formatEuro(calc.efluxCost)}</span></div>
                <div className="border-t border-border pt-2 flex justify-between font-medium"><span>Nettomarge</span><span>{formatEuro(calc.netMargin)}</span></div>
                <div className="flex justify-between"><span>Klantdeel ({tariff.revenue_share}%)</span><span className="font-medium">{formatEuro(calc.clientShare)}</span></div>
                <div className="flex justify-between"><span>e-Charging deel</span><span className="font-medium">{formatEuro(calc.echargingShare)}</span></div>
                <div className="flex justify-between"><span>ERE-schatting</span><span className="font-medium">{formatEuro(calc.ereEstimate)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 5: Bevestigen */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Klantgegevens</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}><Pencil className="w-3 h-3 mr-1" />Wijzig</Button>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Bedrijf:</span> {company.company_name}</p>
              <p><span className="text-muted-foreground">Contact:</span> {company.contact_name} — {company.contact_email}</p>
              {company.kvk && <p><span className="text-muted-foreground">KVK:</span> {company.kvk}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Locaties & Laadpunten</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}><Pencil className="w-3 h-3 mr-1" />Wijzig</Button>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {locations.map((l, i) => (
                <div key={i} className="p-2 rounded bg-muted/50">
                  <p className="font-medium">{l.name} — {l.address}{l.city ? `, ${l.city}` : ""}</p>
                  <p className="text-muted-foreground">{l.chargePoints.length} laadpunten • {l.property_type} {l.has_solar ? `• Solar ${l.solar_capacity_kwp} kWp` : ""}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tarieven</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setStep(3)}><Pencil className="w-3 h-3 mr-1" />Wijzig</Button>
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-2 gap-2">
              <p><span className="text-muted-foreground">Laadtarief:</span> €{tariff.charge_rate}/kWh</p>
              <p><span className="text-muted-foreground">Energiekost:</span> €{tariff.energy_cost}/kWh</p>
              <p><span className="text-muted-foreground">Revenue share:</span> {tariff.revenue_share}%</p>
              <p><span className="text-muted-foreground">ERE-tarief:</span> €{tariff.ere_rate}/kWh</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          <ArrowLeft className="w-4 h-4 mr-1" />Vorige
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            Volgende<ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Opslaan..." : "Klant opslaan"}
          </Button>
        )}
      </div>
    </div>
  );
}
