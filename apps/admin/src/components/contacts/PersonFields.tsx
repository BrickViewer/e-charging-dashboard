import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { usePerson, useUpdatePerson } from "@/hooks/useContacts";
import { AddressFields } from "@/components/contacts/AddressFields";

// Herbruikbare persoon-editor: schrijft direct naar het person-record (bron van waarheid),
// 1:1 met de Contacten-tab en — via de propagate-trigger — de contact-cache op leads/clients.
// Gebruikt in het PersonDetailSheet én in de lead-persoonstap.
export function PersonFields({ personId }: { personId: string }) {
  const { data: person, isLoading } = usePerson(personId);
  const update = useUpdatePerson();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (person) {
      setForm({
        first_name: person.first_name ?? "",
        last_name: person.last_name ?? "",
        email: person.email ?? "",
        phone: person.phone ?? "",
        role: person.role ?? "",
        address_street: person.address_street ?? "",
        house_number: person.house_number ?? "",
        postal_code: person.postal_code ?? "",
        city: person.city ?? "",
        notes: person.notes ?? "",
      });
    }
  }, [person]);

  if (isLoading || !person) {
    return <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;
  }

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const t = (k: string) => form[k] ?? "";

  const save = async () => {
    try {
      await update.mutateAsync({
        id: person.id,
        patch: {
          first_name: t("first_name").trim() || null,
          last_name: t("last_name").trim() || null,
          email: t("email").trim() || null,
          phone: t("phone").trim() || null,
          role: t("role").trim() || null,
          address_street: t("address_street").trim() || null,
          house_number: t("house_number").trim() || null,
          postal_code: t("postal_code").trim() || null,
          city: t("city").trim() || null,
          notes: t("notes").trim() || null,
        },
      });
      toast.success("Persoon opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Voornaam"><Input value={t("first_name")} onChange={(e) => set("first_name")(e.target.value)} /></Field>
        <Field label="Achternaam"><Input value={t("last_name")} onChange={(e) => set("last_name")(e.target.value)} /></Field>
        <Field label="E-mail"><Input type="email" value={t("email")} onChange={(e) => set("email")(e.target.value)} /></Field>
        <Field label="Telefoon"><Input value={t("phone")} onChange={(e) => set("phone")(e.target.value)} /></Field>
        <Field label="Functie" className="sm:col-span-2"><Input value={t("role")} onChange={(e) => set("role")(e.target.value)} /></Field>
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
        <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Persoon opslaan"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
