import { useEffect, useState } from "react";
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
import { PhoneField } from "@/components/contacts/PhoneField";
import { AddressFields, type AddressValue } from "@/components/contacts/AddressFields";
import { useClientForCompany, usePerson, useUpdateCompany, useUpdatePerson } from "@/hooks/useContacts";

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
  });
  const [billingAddr, setBillingAddr] = useState<AddressValue>({ street: "", houseNumber: "", postalCode: "", city: "" });

  const existingClient = useClientForCompany(company.company_id || undefined).data;
  // De gekozen persoon is de bron van waarheid voor e-mail/telefoon: prefill de velden zodat de
  // gebruiker ze niet blanco hoeft te hertypen (en we bij opslaan zien of er echt iets wijzigde).
  const { data: selectedPerson } = usePerson(company.person_id || undefined);
  const updateCompany = useUpdateCompany();
  const updatePerson = useUpdatePerson();

  useEffect(() => {
    if (!selectedPerson) return;
    setCompany((p) => ({
      ...p,
      contact_email: selectedPerson.email ?? "",
      contact_phone: selectedPerson.phone ?? "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson?.id]);
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
      // Alleen schrijven wat de gebruiker daadwerkelijk wijzigde t.o.v. de canonieke persoonsvelden —
      // zo overschrijven we een bestaand e-mail/telefoon niet met een (ongewijzigde) prefill.
      // Het factuuradres hoort bij het contact: buildDebtorParams (WeFact) leest het adres
      // UITSLUITEND van company/person, dus zonder deze doorschrijving krijgt de debiteur
      // geen adresregel. Alleen schrijven als er écht een adres is ingevuld.
      const addressPatch = billingAddr.postalCode.trim() || billingAddr.street.trim()
        ? {
            address_street: billingAddr.street.trim() || null,
            house_number: billingAddr.houseNumber.trim() || null,
            postal_code: billingAddr.postalCode.trim() || null,
            city: billingAddr.city.trim() || null,
          }
        : {};

      if (company.person_id) {
        const personPatch: Record<string, string | null> = {};
        const origEmail = (selectedPerson?.email ?? "").trim();
        const origPhone = (selectedPerson?.phone ?? "").trim();
        const newEmail = company.contact_email.trim();
        const newPhone = company.contact_phone.trim();
        if (newEmail && newEmail !== origEmail) personPatch.email = newEmail;
        if (newPhone && newPhone !== origPhone) personPatch.phone = newPhone;
        // Particulier: het factuuradres ís het persoonsadres. Bij een zakelijke klant blijft
        // het bedrijfsadres leidend en laten we de persoon met rust.
        if (isParticulier) Object.assign(personPatch, addressPatch);
        if (Object.keys(personPatch).length > 0) {
          await updatePerson.mutateAsync({ id: company.person_id, patch: personPatch });
        }
      }
      // KvK/BTW horen bij het bedrijf (bron van waarheid) → daarheen schrijven; de propagate-trigger
      // synct ze daarna naar de klant. Zo ontstaat geen client-only KvK die afwijkt van het bedrijf.
      if (!isParticulier && company.company_id) {
        const companyPatch: Record<string, string | null> = { ...addressPatch };
        if (company.kvk.trim()) companyPatch.kvk = company.kvk.trim();
        if (company.btw_number.trim()) companyPatch.btw_number = company.btw_number.trim();
        if (Object.keys(companyPatch).length > 0) {
          await updateCompany.mutateAsync({ id: company.company_id, patch: companyPatch });
        }
      }

      // Factuuradres: AddressFields levert straat + huisnummer los; clients heeft één billing-straat-kolom.
      const billingStreet = [billingAddr.street.trim(), billingAddr.houseNumber.trim()].filter(Boolean).join(" ");

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
          billing_address_street: billingStreet || null,
          billing_address_postal: billingAddr.postalCode.trim() || null,
          billing_address_city: billingAddr.city.trim() || null,
          // Tarieven/opbrengstdeling worden NIET meer op de klant hardcoded (afgeschaft) — de canonieke
          // create_client_from_quote laat deze weg. Alleen de contractvelden die de canonieke shape zet.
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
        if (vatErr) {
          console.error("[client-wizard] BTW-status bevestigen mislukt:", vatErr.message);
          toast.warning("Klant aangemaakt, maar de BTW-status kon niet automatisch worden bevestigd. Bevestig deze op de klantpagina.");
        }
      }
      if (!client?.id) {
        toast.warning("Klant aangemaakt maar ID niet ontvangen");
        navigate("/beheer/klanten");
        return;
      }

      await logActivity({
        client_id: client.id,
        action: "client_created",
        description: `${client.client_number ? `Klant #${client.client_number}` : "Klant"} ${company.company_name || company.person_name} aangemaakt`,
      });

      // Alle afhankelijke caches verversen: klantoverzicht, het bedrijf→klant-lookup (voor de
      // "heeft al een account"-waarschuwing) en de contactenlijsten die de picker voedt.
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      queryClient.invalidateQueries({ queryKey: ["company-client", company.company_id] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      toast.success(client.client_number ? `Klant #${client.client_number} aangemaakt` : "Klant aangemaakt");
      navigate(`/beheer/klanten/${client.id}`);
    } catch (err) {
      // De DB dwingt "1 bedrijf = 1 klantaccount" af met een unieke index; vang de 23505 op met een
      // duidelijke melding (de client-side check kan een gelijktijdig aangemaakt account missen).
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        toast.error("Dit bedrijf heeft al een klantaccount.");
        if (company.company_id) queryClient.invalidateQueries({ queryKey: ["company-client", company.company_id] });
      } else {
        toast.error("Fout bij opslaan: " + (err instanceof Error ? err.message : "Onbekende fout"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/beheer/klanten")}>
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
            <div role="radiogroup" aria-label="Klanttype" className="grid grid-cols-2 gap-2 rounded-lg border p-1">
              <button
                type="button"
                role="radio"
                aria-checked={!isParticulier}
                onClick={() => setCustomerType("bedrijf")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${!isParticulier ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]"}`}
              >
                Bedrijf
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isParticulier}
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
                    <Button size="sm" variant="outline" onClick={() => navigate(`/beheer/klanten/${existingClient.id}`)}>
                      Open klant
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="client-kvk">KVK-nummer</Label>
                    <Input
                      id="client-kvk"
                      value={company.kvk}
                      onChange={(e) => setCompany((p) => ({ ...p, kvk: e.target.value }))}
                      placeholder="12345678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="client-btw">BTW-nummer</Label>
                    <Input
                      id="client-btw"
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
                <Label htmlFor="client-email">E-mail *</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={company.contact_email}
                  onChange={(e) => setCompany((p) => ({ ...p, contact_email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="client-phone">Telefoon</Label>
                <PhoneField
                  id="client-phone"
                  value={company.contact_phone}
                  onChange={(v) => setCompany((p) => ({ ...p, contact_phone: v ?? "" }))}
                />
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Factuuradres
              </Label>
              <div className="mt-2">
                <AddressFields
                  value={billingAddr}
                  onChange={(patch) => setBillingAddr((a) => ({ ...a, ...patch }))}
                />
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
        <Button variant="outline" onClick={() => navigate("/beheer/klanten")} disabled={saving}>
          Annuleren
        </Button>
        <Button onClick={handleSave} disabled={!canSubmit || saving}>
          {saving ? "Aanmaken..." : "Klant aanmaken"}
        </Button>
      </div>
    </div>
  );
}
