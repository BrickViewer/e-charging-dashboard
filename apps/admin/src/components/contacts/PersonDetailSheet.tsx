import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { CompanyPicker } from "./CompanyPicker";
import { ObjectCreateDialog } from "./ObjectCreateDialog";
import { useProjectLocationsByPerson } from "@/hooks/useProjectLocations";
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
  const objecten = useProjectLocationsByPerson(open ? person?.id : undefined);
  const navigate = useNavigate();
  const [objCreateOpen, setObjCreateOpen] = useState(false);

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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="bedrijven">Bedrijven{companies.data ? ` (${companies.data.length})` : ""}</TabsTrigger>
            <TabsTrigger value="objecten">Objecten{objecten.data ? ` (${objecten.data.length})` : ""}</TabsTrigger>
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

          <TabsContent value="objecten" className="mt-4 space-y-3">
            <Button variant="outline" size="sm" onClick={() => setObjCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Object koppelen/aanmaken
            </Button>
            <div className="space-y-1.5">
              {(objecten.data ?? []).map((o) => (
                <button key={o.id} onClick={() => navigate(`/sales/contacten?object=${o.id}`)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/40">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{o.location_number} · {[o.address_street, o.city].filter(Boolean).join(", ") || o.display_name}</span>
                  <span className="text-[11px] text-muted-foreground">{o.quotes?.[0]?.count ?? 0} offertes</span>
                </button>
              ))}
              {objecten.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nog geen objecten gekoppeld.</p>}
            </div>
          </TabsContent>
        </Tabs>

        <ObjectCreateDialog
          open={objCreateOpen}
          onClose={() => setObjCreateOpen(false)}
          onCreated={() => objecten.refetch()}
          defaultPerson={{ id: person.id, label: person.full_name || "Persoon" }}
        />
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
