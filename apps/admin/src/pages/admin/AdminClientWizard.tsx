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
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { useClientForCompany, useUpdateCompany, useUpdatePerson } from "@/hooks/useContacts";

// Klant aanmaken: alleen de basis die nodig is om de klant uit te nodigen.
// Tarieven en contractdefaults blijven technisch gevuld, maar staan niet in deze startflow.

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AdminClientWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useOrganization();
  const [saving, setSaving] = useState(false);
  const [customerType, setCustomerType] = useState<"bedrijf" | "particulier">("bedrijf");
  const isParticulier = customerType === "particulier";

  const [company, setCompany] = useState({
    company_id: "",
    company_name: "",
    person_id: "",
    person_name: "",
    kvk: "",
    btw_number: "",
    contact_email: "",
    contact_phone: "",
    billing_street: "",
    billing_postal: "",
    billing_city: "",
  });

  const existingClient = useClientForCompany(company.company_id || undefined).data;
  const updateCompany = useUpdateCompany();
  const updatePerson = useUpdatePerson();
  const canSubmit = isParticulier
    ? !!company.person_id && !!company.person_name.trim() && !!company.contact_email.trim()
    : !!company.company_id && !!company.person_id && !!company.contact_email.trim() && !existingClient;

  const handleSave = async () => {
    if (!org) {
      toast.error("Organisatie niet gevonden");
      return;
    }
    if (!canSubmit) {
      toast.error(isParticulier ? "Vul een naam en e-mail in" : "Kies een bedrijf en contactpersoon en vul een e-mail in");
      return;
    }
    setSaving(true);
    try {
      // E-mail/telefoon vastleggen op de persoon (bron van waarheid) via de mutatie (cache-invalidatie);
      // de sync-trigger vult daarna company_name/contact_* op de klant vanuit company_id/person_id.
      if (company.person_id && (company.contact_email.trim() || company.contact_phone.trim())) {
        const personPatch: { email?: string; phone?: string } = {};
        if (company.contact_email.trim()) personPatch.email = company.contact_email.trim();
        if (company.contact_phone.trim()) personPatch.phone = company.contact_phone.trim();
        await updatePerson.mutateAsync({ id: company.person_id, patch: personPatch });
      }
      // KvK/BTW horen bij het bedrijf (bron van waarheid) → daarheen schrijven; de propagate-trigger
      // synct ze daarna naar de klant. Zo ontstaat geen client-only KvK die afwijkt van het bedrijf.
      if (!isParticulier && company.company_id && (company.kvk.trim() || company.btw_number.trim())) {
        const companyPatch: { kvk?: string; btw_number?: string } = {};
        if (company.kvk.trim()) companyPatch.kvk = company.kvk.trim();
        if (company.btw_number.trim()) companyPatch.btw_number = company.btw_number.trim();
        await updateCompany.mutateAsync({ id: company.company_id, patch: companyPatch });
      }

      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({
          organization_id: org.id,
          company_id: isParticulier ? null : company.company_id,
          person_id: company.person_id || null,
          // Particulier: naam = de persoonsnaam (geen bedrijf); btw-status 'private' (0%, betaalspecificatie).
          company_name: isParticulier ? (company.person_name || "Particulier") : (company.company_name || "Onbekend bedrijf"),
          vat_status: isParticulier ? "private" : null,
          kvk: isParticulier ? null : (company.kvk || null),
          btw_number: isParticulier ? null : (company.btw_number || null),
          billing_address_street: company.billing_street || null,
          billing_address_postal: company.billing_postal || null,
          billing_address_city: company.billing_city || null,
          charge_rate_per_kwh: 0.55,
          energy_cost_per_kwh: 0.25,
          revenue_share_percentage: 75,
          ere_rate_per_kwh: 0.10,
          contract_start_date: todayISO(),
          contract_duration_months: 12,
          auto_renew: true,
          notice_period_months: 3,
          status: "actief",
        })
        .select()
        .single();

      if (clientErr) throw clientErr;

      // Particulier: btw-status meteen bevestigen (0%, betaalspecificatie) zodat de klant compleet-klaar is.
      if (isParticulier && client?.id) {
        const { error: vatErr } = await supabase.rpc("confirm_client_vat_status", { p_client_id: client.id, p_vat_status: "private" });
        if (vatErr) console.error("[client-wizard] BTW-status bevestigen mislukt:", vatErr.message);
      }
      if (!client?.id) {
        toast.warning("Klant aangemaakt maar ID niet ontvangen");
        navigate("/admin/klanten");
        return;
      }

      await logActivity({
        client_id: client.id,
        action: "client_created",
        description: `${client.client_number ? `Klant #${client.client_number}` : "Klant"} ${company.company_name || company.person_name} aangemaakt`,
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
            {/* Klanttype: bedrijf of particulier */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
              <button
                type="button"
                onClick={() => setCustomerType("bedrijf")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${!isParticulier ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]"}`}
              >
                Bedrijf
              </button>
              <button
                type="button"
                onClick={() => setCustomerType("particulier")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${isParticulier ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]"}`}
              >
                Particulier
              </button>
            </div>

            {isParticulier ? (
              <div>
                <Label>Naam *</Label>
                <PersonPicker
                  value={company.person_id || null}
                  valueLabel={company.person_name || null}
                  companyId={null}
                  placeholder="Kies of typ de naam van de particulier…"
                  onChange={(id, person) => setCompany((p) => ({ ...p, person_id: id ?? "", person_name: person?.full_name ?? "" }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Particulier (geen bedrijf) — 0% btw, ontvangt een betaalspecificatie.</p>
              </div>
            ) : (
              <>
                <div>
                  <Label>Bedrijf *</Label>
                  <CompanyPicker
                    value={company.company_id || null}
                    valueLabel={company.company_name || null}
                    onChange={(id, c) => setCompany((p) => ({ ...p, company_id: id ?? "", company_name: c?.name ?? "" }))}
                  />
                </div>
                {existingClient && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                    <span className="text-amber-900">
                      Dit bedrijf heeft al een klantaccount{existingClient.client_number ? ` (#${existingClient.client_number})` : ""}.
                    </span>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/klanten/${existingClient.id}`)}>
                      Open klant
                    </Button>
                  </div>
                )}
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
                  <PersonPicker
                    value={company.person_id || null}
                    valueLabel={company.person_name || null}
                    companyId={company.company_id || null}
                    onChange={(id, person) => setCompany((p) => ({ ...p, person_id: id ?? "", person_name: person?.full_name ?? "" }))}
                  />
                </div>
              </>
            )}
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
