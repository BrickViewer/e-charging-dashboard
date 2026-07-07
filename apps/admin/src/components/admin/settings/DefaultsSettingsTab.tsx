import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganization, useUpdateOrganization, useAvgRevenuePerChargePoint } from "@/hooks/useAdminData";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function DefaultsSettingsTab() {
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const avgCp = useAvgRevenuePerChargePoint();
  const queryClient = useQueryClient();
  const fmtEur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

  const [defaults, setDefaults] = useState({
    default_echarging_fee_per_kwh: "",
    avg_annual_revenue_per_charge_point: "",
    lead_estimate_source: "computed",
    handoff_notification_email: "",
  });
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    if (!org) return;
    setDefaults({
      default_echarging_fee_per_kwh: String(org.default_echarging_fee_per_kwh ?? "0.10"),
      avg_annual_revenue_per_charge_point: org.avg_annual_revenue_per_charge_point != null ? String(org.avg_annual_revenue_per_charge_point) : "",
      lead_estimate_source: org.lead_estimate_source === "manual" ? "manual" : "computed",
      handoff_notification_email: org.handoff_notification_email ?? "willi-jan.jonkers@e-group.nl",
    });
  }, [org]);

  const handleSaveDefaults = async () => {
    if (!org) return;
    setSavingDefaults(true);
    try {
      const avgRaw = defaults.avg_annual_revenue_per_charge_point.trim();
      const avgParsed = avgRaw === "" ? NaN : parseFloat(avgRaw);
      // Een expliciete 0-fee is geldig (bv. fee kwijtgescholden): alleen terugvallen
      // op de standaard 0,10 bij een ongeldige/lege of negatieve invoer, niet bij 0.
      const feeParsed = parseFloat(defaults.default_echarging_fee_per_kwh);
      const fee = Number.isFinite(feeParsed) && feeParsed >= 0 ? feeParsed : 0.10;
      await updateOrg.mutateAsync({
        id: org.id,
        patch: {
          default_echarging_fee_per_kwh: fee,
          avg_annual_revenue_per_charge_point: Number.isFinite(avgParsed) && avgParsed > 0 ? avgParsed : null,
          lead_estimate_source: defaults.lead_estimate_source === "manual" ? "manual" : "computed",
          handoff_notification_email: defaults.handoff_notification_email.trim() || "willi-jan.jonkers@e-group.nl",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["admin-avg-revenue-per-cp"] });
      toast.success("Standaardwaarden opgeslagen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout bij opslaan");
    } finally {
      setSavingDefaults(false);
    }
  };

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Service-fee</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            De standaard E-Charging-fee per kWh, gebruikt bij het berekenen van de maandafrekeningen
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="default-fee">E-Charging fee per kWh (€)</Label>
            <Input id="default-fee" type="number" step="0.01" min="0" value={defaults.default_echarging_fee_per_kwh} onChange={e => setDefaults(p => ({ ...p, default_echarging_fee_per_kwh: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground mt-1.5">Standaard 0,10; een expliciete 0 wordt gerespecteerd. Per klant te overschrijven op de klantpagina.</p>
          </div>
          <div className="text-xs text-muted-foreground self-center leading-relaxed rounded-md border border-border bg-muted/30 p-3">
            <strong className="text-foreground">BTW</strong> is 21% en wordt per klant ingesteld (BTW-plichtig ja/nee) op de klantpagina. De ERE-laadbeloning is een indicatieve schatting in het klantportaal.
          </div>
        </div>
        <div className="space-y-3 rounded-md border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold">Lead-schatting</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              De geschatte beheeropbrengst per jaar in de leads-module = dit bedrag per laadpaal maal het aantal palen op de offerte.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            Berekend gemiddelde (o.b.v. afrekeningen):{" "}
            <strong className="text-foreground">
              {avgCp.data?.computedValue != null ? `${fmtEur(avgCp.data.computedValue)} per paal/jaar` : "nog onvoldoende data"}
            </strong>
            {avgCp.data?.computedValue != null && (
              <span className="text-muted-foreground"> — o.b.v. {avgCp.data.months} maand(en), {avgCp.data.charge_points} palen</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Rekenen met</Label>
              <Select value={defaults.lead_estimate_source} onValueChange={v => setDefaults(p => ({ ...p, lead_estimate_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="computed">Berekend gemiddelde</SelectItem>
                  <SelectItem value="manual">Vaste waarde</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5">Bij 'Berekend gemiddelde' is de vaste waarde de terugval zolang er te weinig data is.</p>
            </div>
            <div>
              <Label htmlFor="avg-revenue">Vaste waarde per paal/jaar (€)</Label>
              <Input id="avg-revenue" type="number" step="0.01" min="0" value={defaults.avg_annual_revenue_per_charge_point} onChange={e => setDefaults(p => ({ ...p, avg_annual_revenue_per_charge_point: e.target.value }))} placeholder="bijv. 180" />
              <p className="text-[11px] text-muted-foreground mt-1.5">Gebruikt bij modus 'Vaste waarde' en als terugval bij 'Berekend'. Leeg = geen schatting zonder data.</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-md border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold">Opdrachten doorsturen (e-portal)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Zodra je een opdracht doorstuurt naar de e-portal gaat er automatisch een branded mail naar dit adres, met de opdrachtdetails en het ordernummer.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="handoff-email">Notificatie-mailadres</Label>
              <Input id="handoff-email" type="email" value={defaults.handoff_notification_email} onChange={e => setDefaults(p => ({ ...p, handoff_notification_email: e.target.value }))} placeholder="willi-jan.jonkers@e-group.nl" />
              <p className="text-[11px] text-muted-foreground mt-1.5">Standaard willi-jan.jonkers@e-group.nl. De opdracht wordt niet geblokkeerd als de mail onverhoopt faalt.</p>
            </div>
          </div>
        </div>
        <Button onClick={handleSaveDefaults} disabled={savingDefaults}>
          <Save className="w-4 h-4 mr-2" />{savingDefaults ? "Opslaan…" : "Opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
