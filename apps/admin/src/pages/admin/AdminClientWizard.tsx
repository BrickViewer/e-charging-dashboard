import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useAdminData";
import { logActivity } from "@/services/activityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Building2, Mail } from "lucide-react";

// Klant aanmaken: alleen de basis die nodig is om de klant uit te nodigen.
// Tarieven en contractdefaults blijven technisch gevuld, maar staan niet in deze startflow.

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AdminClientWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useOrganization();
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
          charge_rate_per_kwh: 0.55,
          energy_cost_per_kwh: 0.25,
          revenue_share_percentage: 75,
          ere_rate_per_kwh: 0.10,
          contract_start_date: todayISO(),
          contract_duration_months: 36,
          auto_renew: true,
          notice_period_months: 3,
          status: "actief",
        })
        .select()
        .single();

      if (clientErr) throw clientErr;
      if (!client?.id) {
        toast.warning("Klant aangemaakt maar ID niet ontvangen");
        navigate("/admin/klanten");
        return;
      }

      await logActivity({
        client_id: client.id,
        action: "client_created",
        description: `${client.client_number ? `Klant #${client.client_number}` : "Klant"} ${company.company_name} aangemaakt`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success(client.client_number ? `Klant #${client.client_number} aangemaakt` : "Klant aangemaakt");
      navigate(`/admin/klanten/${client.id}`);
    } catch (err) {
      toast.error("Fout bij opslaan: " + (err instanceof Error ? err.message : "Onbekende fout"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/klanten")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Terug
        </Button>
        <h1 className="text-2xl font-semibold">Nieuwe klant</h1>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Klant klaarzetten
            </CardTitle>
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

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-sm text-muted-foreground flex gap-3">
            <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p>
              Na aanmaken stuur je vanuit de klantdetailpagina de branded uitnodiging.
              De klant activeert daarna zelf het portaal en vult de ontbrekende gegevens aan.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => navigate("/admin/klanten")} disabled={saving}>
          Annuleren
        </Button>
        <Button onClick={handleSave} disabled={!canSubmit || saving}>
          {saving ? "Aanmaken..." : "Klant aanmaken"}
        </Button>
      </div>
    </div>
  );
}
