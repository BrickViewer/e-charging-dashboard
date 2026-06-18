import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, MapPin, Star, Trash2, X } from "lucide-react";
import { PersonPicker } from "./PersonPicker";
import { DossierDocuments } from "@/components/documents/DossierDocuments";
import {
  useUpdateCompany,
  useDeleteCompany,
  useCompanyPersons,
  useLinkPersonToCompany,
  useUnlinkPersonFromCompany,
  useLeadsForContact,
  useClientForCompany,
  useClientLocations,
  type Company,
} from "@/hooks/useContacts";

export function CompanyDetailSheet({
  company,
  open,
  onOpenChange,
}: {
  company: Company | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const update = useUpdateCompany();
  const del = useDeleteCompany();
  const persons = useCompanyPersons(open ? company?.id : undefined);
  const leads = useLeadsForContact("company_id", open ? company?.id : undefined);
  const account = useClientForCompany(open ? company?.id : undefined);
  const locations = useClientLocations(open ? account.data?.id : undefined);
  const link = useLinkPersonToCompany();
  const unlink = useUnlinkPersonFromCompany();
  const navigate = useNavigate();

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
        postal_code: company.postal_code ?? "",
        city: company.city ?? "",
        notes: company.notes ?? "",
      });
    }
  }, [company]);

  if (!company) return null;
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

  const remove = async () => {
    if (!window.confirm(`Bedrijf "${company.name}" verwijderen? Gekoppelde leads/klanten verliezen de koppeling.`)) return;
    await del.mutateAsync(company.id);
    toast.success("Bedrijf verwijderd");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{company.name}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="gegevens" className="mt-5">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="personen">Personen{persons.data ? ` (${persons.data.length})` : ""}</TabsTrigger>
            <TabsTrigger value="leads">Leads{leads.data ? ` (${leads.data.length})` : ""}</TabsTrigger>
            <TabsTrigger value="mappen">Mappen</TabsTrigger>
          </TabsList>

          <TabsContent value="gegevens" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bedrijfsnaam"><Input value={t("name")} onChange={(e) => set("name")(e.target.value)} /></Field>
              <Field label="KvK"><Input value={t("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>
              <Field label="BTW-nummer"><Input value={t("btw_number")} onChange={(e) => set("btw_number")(e.target.value)} /></Field>
              <Field label="Sector"><Input value={t("sector")} onChange={(e) => set("sector")(e.target.value)} /></Field>
              <Field label="Website"><Input value={t("website")} onChange={(e) => set("website")(e.target.value)} /></Field>
              <Field label="Straat"><Input value={t("address_street")} onChange={(e) => set("address_street")(e.target.value)} /></Field>
              <Field label="Postcode"><Input value={t("postal_code")} onChange={(e) => set("postal_code")(e.target.value)} /></Field>
              <Field label="Plaats"><Input value={t("city")} onChange={(e) => set("city")(e.target.value)} /></Field>
            </div>
            <Field label="Notities"><Textarea rows={3} value={t("notes")} onChange={(e) => set("notes")(e.target.value)} /></Field>
            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" size="sm" className="text-red-600" onClick={remove}><Trash2 className="mr-1.5 h-4 w-4" />Verwijderen</Button>
              <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Opslaan"}</Button>
            </div>
          </TabsContent>

          <TabsContent value="account" className="mt-4 space-y-3">
            {account.data ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Klantaccount{account.data.client_number ? ` #${account.data.client_number}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Status: {account.data.status ?? "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/klanten/${account.data!.id}`)}>
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Open klant
                  </Button>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Locaties</p>
                  <div className="space-y-1.5">
                    {(locations.data ?? []).map((l) => (
                      <button
                        key={l.id}
                        onClick={() => navigate(`/admin/locaties/${l.id}`)}
                        className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/40"
                      >
                        <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{l.name || l.address || "Locatie"}</span>
                        {l.city && <span className="text-[11px] text-muted-foreground">{l.city}</span>}
                      </button>
                    ))}
                    {locations.data?.length === 0 && <p className="py-2 text-xs text-muted-foreground">Nog geen locaties gekoppeld.</p>}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Dit bedrijf heeft nog geen klantaccount. Maak er een aan via een lead-conversie of de klant-wizard.
              </div>
            )}
          </TabsContent>

          <TabsContent value="personen" className="mt-4 space-y-3">
            <PersonPicker
              value={null}
              companyId={company.id}
              placeholder="Persoon koppelen…"
              onChange={() => persons.refetch()}
            />
            <div className="space-y-1.5">
              {(persons.data ?? []).map((cp) => (
                <div key={cp.id} className="group flex items-center gap-2 rounded-lg border p-2">
                  {cp.is_primary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{cp.person.full_name || "(naamloos)"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{[cp.person.email, cp.person.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                  {!cp.is_primary && (
                    <button
                      className="text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      onClick={() => link.mutate({ companyId: company.id, personId: cp.person.id, isPrimary: true })}
                    >
                      Hoofdcontact
                    </button>
                  )}
                  <button className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => unlink.mutate({ linkId: cp.id, companyId: company.id, personId: cp.person.id })}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {persons.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nog geen personen gekoppeld.</p>}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            <div className="space-y-1.5">
              {(leads.data ?? []).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <span className="truncate text-foreground">{l.contact_name || l.company_name}</span>
                  <span className="text-[11px] text-muted-foreground">{l.status}</span>
                </div>
              ))}
              {leads.data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Geen leads.</p>}
            </div>
          </TabsContent>

          <TabsContent value="mappen" className="mt-4">
            <DossierDocuments companyId={company.id} />
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
