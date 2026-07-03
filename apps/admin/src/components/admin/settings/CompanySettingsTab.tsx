import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/contacts/PhoneField";
import { AddressFields, type AddressValue } from "@/components/contacts/AddressFields";
import { useOrganization, useUpdateOrganization } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function CompanySettingsTab() {
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [company, setCompany] = useState({
    name: "", kvk: "", address: "", phone: "", email: "", logo_url: "", dashboard_url: "",
    btw_number: "", iban: "", bic: "", country: "Nederland",
  });
  // Adres via het gedeelde AddressFields-blok (postcode → straat/plaats-autofill).
  // De organizations-tabel kent geen los huisnummer-veld; straat + huisnummer worden
  // bij opslaan samengevoegd tot address_street en bij laden weer ingeladen.
  const [companyAddr, setCompanyAddr] = useState<AddressValue>({ street: "", houseNumber: "", postalCode: "", city: "" });
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    if (!org) return;
    setCompany({
      name: org.name || "", kvk: org.kvk || "", address: org.address || "",
      phone: org.phone || "", email: org.email || "", logo_url: org.logo_url || "",
      dashboard_url: org.dashboard_url || "http://localhost:8080",
      btw_number: org.btw_number || "", iban: org.iban || "", bic: org.bic || "",
      country: org.country || "Nederland",
    });
    // Straat + huisnummer zitten gecombineerd in address_street; die gaat in het
    // straatveld. Huisnummer blijft leeg tot de gebruiker het los invult.
    setCompanyAddr({
      street: org.address_street || "", houseNumber: "",
      postalCode: org.address_postal || "", city: org.address_city || "",
    });
  }, [org]);

  const handleSaveCompany = async () => {
    if (!org) return;
    setSavingCompany(true);
    try {
      // De organizations-tabel heeft geen los huisnummer-veld: straat + huisnummer
      // samenvoegen tot address_street (bron voor de factuur).
      const streetLine = [companyAddr.street.trim(), companyAddr.houseNumber.trim()]
        .filter(Boolean).join(" ");
      // Legacy enkelvoudig adres meeschrijven (samengesteld) zolang oudere
      // consumenten dat veld nog lezen; de factuur gebruikt de gesplitste velden.
      const composedAddress = [
        streetLine,
        [companyAddr.postalCode.trim(), companyAddr.city.trim()].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      await updateOrg.mutateAsync({
        id: org.id,
        patch: {
          name: company.name, kvk: company.kvk || null,
          address: composedAddress || company.address || null,
          address_street: streetLine || null,
          address_postal: companyAddr.postalCode.trim() || null,
          address_city: companyAddr.city.trim() || null,
          country: company.country || "Nederland",
          phone: company.phone || null, email: company.email || null, logo_url: company.logo_url || null,
          dashboard_url: company.dashboard_url || null,
          btw_number: company.btw_number || null, iban: company.iban || null, bic: company.bic || null,
        },
      });
      toast.success("Bedrijfsgegevens opgeslagen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout bij opslaan");
    } finally {
      setSavingCompany(false);
    }
  };

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Bedrijfsgegevens</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            E-Group BV — gegevens die verschijnen in offertes, mails en het klantportaal
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label htmlFor="company-name">Bedrijfsnaam</Label><Input id="company-name" value={company.name} onChange={e => setCompany(p => ({ ...p, name: e.target.value }))} /></div>
          <div>
            <Label htmlFor="company-kvk">KVK-nummer</Label>
            <Input id="company-kvk" value={company.kvk} onChange={e => setCompany(p => ({ ...p, kvk: e.target.value }))} />
            {(company.kvk === "12345678" || !company.kvk.trim()) && (
              <p className="text-[11px] text-[hsl(var(--status-amber))] mt-1.5">
                Placeholder/ontbrekend KVK-nummer — vul het echte nummer in; goedkeuren van afrekeningen is anders geblokkeerd.
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <AddressFields value={companyAddr} onChange={(patch) => setCompanyAddr((a) => ({ ...a, ...patch }))} />
          </div>
          <div><Label htmlFor="company-country">Land</Label><Input id="company-country" value={company.country} onChange={e => setCompany(p => ({ ...p, country: e.target.value }))} /></div>
          <div><Label htmlFor="company-phone">Telefoon</Label><PhoneField value={company.phone} onChange={v => setCompany(p => ({ ...p, phone: v ?? "" }))} /></div>
          <div><Label htmlFor="company-email">E-mail</Label><Input id="company-email" type="email" value={company.email} onChange={e => setCompany(p => ({ ...p, email: e.target.value }))} /></div>
          <div><Label htmlFor="company-logo">Logo URL</Label><Input id="company-logo" value={company.logo_url} onChange={e => setCompany(p => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." /></div>
        </div>
        <div className="pt-4 border-t border-border space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Factuurgegevens (self-billing)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verschijnen in het "Naar"-blok van de vergoedingsfacturen die jij namens de klant uitreikt
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label htmlFor="company-btw">BTW-nummer</Label><Input id="company-btw" value={company.btw_number} onChange={e => setCompany(p => ({ ...p, btw_number: e.target.value }))} placeholder="NL857756618B01" /></div>
            <div><Label htmlFor="company-iban">IBAN</Label><Input id="company-iban" value={company.iban} onChange={e => setCompany(p => ({ ...p, iban: e.target.value }))} placeholder="NL00BANK0123456789" /></div>
            <div><Label htmlFor="company-bic">BIC</Label><Input id="company-bic" value={company.bic} onChange={e => setCompany(p => ({ ...p, bic: e.target.value }))} placeholder="INGBNL2A" /></div>
          </div>
        </div>
        <div className="pt-4 border-t border-border">
          <Label htmlFor="company-dashboard-url">
            Dashboard-URL <span className="text-xs text-muted-foreground font-normal">(voor invitatie-links in mails)</span>
          </Label>
          <Input
            id="company-dashboard-url"
            value={company.dashboard_url}
            onChange={e => setCompany(p => ({ ...p, dashboard_url: e.target.value }))}
            placeholder="https://app.e-charging.nl"
            className="mt-1.5"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Bepaalt waar invitatie-links naartoe wijzen. In dev:{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">http://localhost:8080</code>. In productie: jouw publieke domein.
          </p>
        </div>
        <Button onClick={handleSaveCompany} disabled={savingCompany}>
          <Save className="w-4 h-4 mr-2" />{savingCompany ? "Opslaan…" : "Opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
