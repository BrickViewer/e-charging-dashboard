import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { CompanyPicker } from "./CompanyPicker";
import {
  useUpdatePerson,
  useDeletePerson,
  usePersonCompanies,
  useLinkPersonToCompany,
  useUnlinkPersonFromCompany,
  useLeadsForContact,
  type Person,
} from "@/hooks/useContacts";

export function PersonDetailSheet({
  person,
  open,
  onOpenChange,
}: {
  person: Person | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const update = useUpdatePerson();
  const del = useDeletePerson();
  const companies = usePersonCompanies(open ? person?.id : undefined);
  const leads = useLeadsForContact("person_id", open ? person?.id : undefined);
  const link = useLinkPersonToCompany();
  const unlink = useUnlinkPersonFromCompany();

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (person) {
      setForm({
        first_name: person.first_name ?? "",
        last_name: person.last_name ?? "",
        email: person.email ?? "",
        phone: person.phone ?? "",
        role: person.role ?? "",
        notes: person.notes ?? "",
      });
    }
  }, [person]);

  if (!person) return null;
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
          notes: t("notes").trim() || null,
        },
      });
      toast.success("Persoon opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Persoon "${person.full_name}" verwijderen?`)) return;
    await del.mutateAsync(person.id);
    toast.success("Persoon verwijderd");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{person.full_name || "(naamloos)"}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="gegevens" className="mt-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="bedrijven">Bedrijven{companies.data ? ` (${companies.data.length})` : ""}</TabsTrigger>
            <TabsTrigger value="leads">Leads{leads.data ? ` (${leads.data.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="gegevens" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Voornaam"><Input value={t("first_name")} onChange={(e) => set("first_name")(e.target.value)} /></Field>
              <Field label="Achternaam"><Input value={t("last_name")} onChange={(e) => set("last_name")(e.target.value)} /></Field>
              <Field label="E-mail"><Input type="email" value={t("email")} onChange={(e) => set("email")(e.target.value)} /></Field>
              <Field label="Telefoon"><Input value={t("phone")} onChange={(e) => set("phone")(e.target.value)} /></Field>
              <Field label="Functie"><Input value={t("role")} onChange={(e) => set("role")(e.target.value)} /></Field>
            </div>
            <Field label="Notities"><Textarea rows={3} value={t("notes")} onChange={(e) => set("notes")(e.target.value)} /></Field>
            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" size="sm" className="text-red-600" onClick={remove}><Trash2 className="mr-1.5 h-4 w-4" />Verwijderen</Button>
              <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Opslaan"}</Button>
            </div>
          </TabsContent>

          <TabsContent value="bedrijven" className="mt-4 space-y-3">
            <CompanyPicker
              value={null}
              placeholder="Bedrijf koppelen…"
              onChange={(companyId) => {
                if (companyId) link.mutate({ companyId, personId: person.id });
              }}
            />
            <div className="space-y-1.5">
              {(companies.data ?? []).map((cp) => (
                <div key={cp.id} className="group flex items-center gap-2 rounded-lg border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{cp.company.name}</p>
                    {cp.company.city && <p className="truncate text-[11px] text-muted-foreground">{cp.company.city}</p>}
                  </div>
                  <button className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => unlink.mutate({ linkId: cp.id, companyId: cp.company.id, personId: person.id })}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {companies.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nog geen bedrijven gekoppeld.</p>}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            <div className="space-y-1.5">
              {(leads.data ?? []).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <span className="truncate text-foreground">{l.company_name}</span>
                  <span className="text-[11px] text-muted-foreground">{l.status}</span>
                </div>
              ))}
              {leads.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Geen leads.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
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
