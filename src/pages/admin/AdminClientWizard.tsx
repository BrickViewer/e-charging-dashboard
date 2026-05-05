import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useAdminData";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Info } from "lucide-react";

// Klant aanmaken — alleen het profiel. Locaties komen via Road-sync binnen
// en koppel je daarna via /admin/locaties/:id aan deze klant. Tarieven hier
// zijn fallback-defaults; live tarieven worden uit Road gesynced per EVSE.

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AdminClientWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useOrganization();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState({
    company_name: "",
    kvk: "",
    btw_number: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    billing_street: "",
    billing_postal: "",
    billing_city: "",
  });

  const [tariff, setTariff] = useState({
    charge_rate: "0.55",
    energy_cost: "0.25",
    revenue_share: "75",
    ere_rate: "0.10",
  });

  const [contract, setContract] = useState({
    start_date: todayISO(),
    duration_months: "36",
    auto_renew: true,
    notice_period_months: "3",
  });

  const canSubmit =
    company.company_name.trim() &&
    company.contact_name.trim() &&
    company.contact_email.trim();

  const handleSave = async () => {
    if (!org) {
      toast.error("Organisatie niet gevonden");
      return;
    }
    if (!canSubmit) {
      toast.error("Vul minimaal bedrijfsnaam, contactpersoon en e-mail in");
      return;
    }
    setSaving(true);
    try {
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({
          organization_id: org.id,
          company_name: company.company_name,
          kvk: company.kvk || null,
          btw_number: company.btw_number || null,
          contact_name: company.contact_name,
          contact_email: company.contact_email,
          contact_phone: company.contact_phone || null,
          billing_address_street: company.billing_street || null,
          billing_address_postal: company.billing_postal || null,
          billing_address_city: company.billing_city || null,
          charge_rate_per_kwh: parseFloat(tariff.charge_rate) || 0.55,
          energy_cost_per_kwh: parseFloat(tariff.energy_cost) || 0.25,
          revenue_share_percentage: parseFloat(tariff.revenue_share) || 75,
          ere_rate_per_kwh: parseFloat(tariff.ere_rate) || 0.10,
          contract_start_date: contract.start_date || null,
          contract_duration_months: parseInt(contract.duration_months) || 36,
          auto_renew: contract.auto_renew,
          notice_period_months: parseInt(contract.notice_period_months) || 3,
          status: "prospect",
        })
        .select()
        .single();

      if (clientErr) throw clientErr;
      if (!client?.id) {
        toast.warning("Klant aangemaakt maar ID niet ontvangen");
        navigate("/admin/klanten");
        return;
      }

      await supabase.from("activity_log").insert({
        client_id: client.id,
        organization_id: org.id,
        user_id: user?.id,
        action: "client_created",
        description: `Klant ${company.company_name} aangemaakt`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success("Klant aangemaakt — koppel locaties via /admin/locaties");
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
          <ArrowLeft className="w-4 h-4 mr-1" />
          Terug
        </Button>
        <h1 className="text-2xl font-semibold">Nieuwe klant</h1>
      </div>

      {/* Info-banner: locaties worden later gekoppeld */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Alleen het klantprofiel hier.</p>
            <p className="text-muted-foreground mt-1">
              Locaties en laadpunten worden automatisch uit e-Flux gesyncd. Na het
              aanmaken van deze klant koppel je z'n locaties via{" "}
              <button
                onClick={() => navigate("/admin/locaties")}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <MapPin className="w-3 h-3" /> Locaties-overzicht
              </button>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bedrijfsinformatie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bedrijfsinformatie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Bedrijfsnaam *</Label>
              <Input
                value={company.company_name}
                onChange={(e) => setCompany((p) => ({ ...p, company_name: e.target.value }))}
                placeholder="Van der Berg Vastgoed BV"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>KVK-nummer</Label>
                <Input
                  value={company.kvk}
                  onChange={(e) => setCompany((p) => ({ ...p, kvk: e.target.value }))}
                  placeholder="12345678"
                />
              </div>
              <div>
                <Label>BTW-nummer</Label>
                <Input
                  value={company.btw_number}
                  onChange={(e) => setCompany((p) => ({ ...p, btw_number: e.target.value }))}
                  placeholder="NL123456789B01"
                />
              </div>
            </div>
            <div>
              <Label>Contactpersoon *</Label>
              <Input
                value={company.contact_name}
                onChange={(e) => setCompany((p) => ({ ...p, contact_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={company.contact_email}
                  onChange={(e) => setCompany((p) => ({ ...p, contact_email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Telefoon</Label>
                <Input
                  value={company.contact_phone}
                  onChange={(e) => setCompany((p) => ({ ...p, contact_phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Factuuradres
              </Label>
              <div className="space-y-3 mt-2">
                <Input
                  value={company.billing_street}
                  onChange={(e) => setCompany((p) => ({ ...p, billing_street: e.target.value }))}
                  placeholder="Straat + huisnummer"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={company.billing_postal}
                    onChange={(e) => setCompany((p) => ({ ...p, billing_postal: e.target.value }))}
                    placeholder="Postcode"
                  />
                  <Input
                    value={company.billing_city}
                    onChange={(e) => setCompany((p) => ({ ...p, billing_city: e.target.value }))}
                    placeholder="Plaats"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tarieven & Contract */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarieven & Contract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Revenue share klant (%)</Label>
              <Input
                type="number"
                step="1"
                value={tariff.revenue_share}
                onChange={(e) => setTariff((p) => ({ ...p, revenue_share: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Klant krijgt dit percentage van de netto laadopbrengst. Default 75% (36-mnd contract).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Laadtarief (€/kWh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={tariff.charge_rate}
                  onChange={(e) => setTariff((p) => ({ ...p, charge_rate: e.target.value }))}
                />
              </div>
              <div>
                <Label>Stroominkoop (€/kWh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={tariff.energy_cost}
                  onChange={(e) => setTariff((p) => ({ ...p, energy_cost: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>ERE-tarief (€/kWh)</Label>
              <Input
                type="number"
                step="0.01"
                value={tariff.ere_rate}
                onChange={(e) => setTariff((p) => ({ ...p, ere_rate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Indicatief — Laadbeloning betaalt ERE rechtstreeks aan klant.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Contract
              </Label>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Startdatum</Label>
                    <Input
                      type="date"
                      value={contract.start_date}
                      onChange={(e) => setContract((p) => ({ ...p, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Looptijd (mnd)</Label>
                    <Input
                      type="number"
                      value={contract.duration_months}
                      onChange={(e) => setContract((p) => ({ ...p, duration_months: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-verlengen</Label>
                    <p className="text-xs text-muted-foreground">
                      Stilzwijgend verlengen na looptijd
                    </p>
                  </div>
                  <Switch
                    checked={contract.auto_renew}
                    onCheckedChange={(v) => setContract((p) => ({ ...p, auto_renew: v }))}
                  />
                </div>
                <div>
                  <Label>Opzegtermijn (mnd)</Label>
                  <Input
                    type="number"
                    value={contract.notice_period_months}
                    onChange={(e) =>
                      setContract((p) => ({ ...p, notice_period_months: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => navigate("/admin/klanten")} disabled={saving}>
          Annuleren
        </Button>
        <Button onClick={handleSave} disabled={!canSubmit || saving}>
          {saving ? "Aanmaken…" : "Klant aanmaken"}
        </Button>
      </div>
    </div>
  );
}
