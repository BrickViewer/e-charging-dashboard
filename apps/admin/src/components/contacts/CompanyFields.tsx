import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useCompany, useUpdateCompany } from "@/hooks/useContacts";
import { AddressFields } from "@/components/contacts/AddressFields";

// Herbruikbare bedrijfs-editor: schrijft direct naar het company-record (bron van waarheid),
// zodat dezelfde gegevens 1:1 terugkomen in de Contacten-tab en — via de propagate-trigger —
// in de inline-cache op leads/clients. Gebruikt in het CompanyDetailSheet én in de lead-bedrijfstap.
export function CompanyFields({ companyId }: { companyId: string }) {
  const { data: company, isLoading } = useCompany(companyId);
  const update = useUpdateCompany();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        kvk: company.kvk ?? "",
        btw_number: company.btw_number ?? "",
        website: company.website ?? "",
        sector: company.sector ?? "",
        address_street: company.address_street ?? "",
        house_number: company.house_number ?? "",
        postal_code: company.postal_code ?? "",
        city: company.city ?? "",
        notes: company.notes ?? "",
      });
    }
  }, [company]);

  if (isLoading || !company) {
    return <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;
  }

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const t = (k: string) => form[k] ?? "";

  const save = async () => {
    try {
      await update.mutateAsync({
        id: company.id,
        patch: {
          name: t("name").trim() || company.name,
          kvk: t("kvk").trim() || null,
          btw_number: t("btw_number").trim() || null,
          website: t("website").trim() || null,
          sector: t("sector").trim() || null,
          address_street: t("address_street").trim() || null,
          house_number: t("house_number").trim() || null,
          postal_code: t("postal_code").trim() || null,
          city: t("city").trim() || null,
          notes: t("notes").trim() || null,
        },
      });
      toast.success("Bedrijf opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bedrijfsnaam"><Input value={t("name")} onChange={(e) => set("name")(e.target.value)} /></Field>
        <Field label="KvK"><Input value={t("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>
        <Field label="BTW-nummer"><Input value={t("btw_number")} onChange={(e) => set("btw_number")(e.target.value)} /></Field>
        <Field label="Sector"><Input value={t("sector")} onChange={(e) => set("sector")(e.target.value)} /></Field>
        <Field label="Website"><Input value={t("website")} onChange={(e) => set("website")(e.target.value)} /></Field>
      </div>
      <AddressFields
        value={{ street: t("address_street"), houseNumber: t("house_number"), postalCode: t("postal_code"), city: t("city") }}
        onChange={(p) => setForm((f) => ({ ...f,
          ...(p.street !== undefined ? { address_street: p.street } : {}),
          ...(p.houseNumber !== undefined ? { house_number: p.houseNumber } : {}),
          ...(p.postalCode !== undefined ? { postal_code: p.postalCode } : {}),
          ...(p.city !== undefined ? { city: p.city } : {}),
        }))}
      />
      <Field label="Notities"><Textarea rows={3} value={t("notes")} onChange={(e) => set("notes")(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Bedrijf opslaan"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
