import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, MapPin, Plus, Trash2, X } from "lucide-react";
import { CompanyPicker } from "./CompanyPicker";
import { PersonFields } from "./PersonFields";
import { WefactDebtorPanel } from "./WefactDebtorPanel";
import { WefactContactInvoices } from "./WefactContactInvoices";
import { useAuth } from "@/hooks/useAuth";
import { ObjectCreateDialog } from "./ObjectCreateDialog";
import { useProjectLocationsByPerson } from "@/hooks/useProjectLocations";
import { formatObjectAddress } from "@/lib/objectLabel";
import {
  useDeletePerson,
  usePersonCompanies,
  useLinkPersonToCompany,
  useUnlinkPersonFromCompany,
  useLeadsForContact,
  useClientForPerson,
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
  const del = useDeletePerson();
  const companies = usePersonCompanies(open ? person?.id : undefined);
  const leads = useLeadsForContact("person_id", open ? person?.id : undefined);
  const link = useLinkPersonToCompany();
  const unlink = useUnlinkPersonFromCompany();
  const { role, isSuperadmin } = useAuth();
  const canBill = role === "admin" || role === "manager" || isSuperadmin;
  const objecten = useProjectLocationsByPerson(open ? person?.id : undefined);
  const account = useClientForPerson(open ? person?.id : undefined);
  const navigate = useNavigate();
  const [objCreateOpen, setObjCreateOpen] = useState(false);

  if (!person) return null;

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
            {/* Particuliere klanten hebben geen bedrijf, dus deze koppeling was nergens
                zichtbaar — terwijl juist zij zo werken. Bovenaan i.p.v. in een eigen tab,
                omdat "is dit dezelfde als mijn klant?" de eerste vraag is bij het openen. */}
            {account.data && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Klantaccount{account.data.client_number ? ` #${account.data.client_number}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Deze persoon is de klant · status: {account.data.status ?? "—"}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate(`/beheer/klanten/${account.data!.id}`)}>
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Open klant
                </Button>
              </div>
            )}
            {/* Gedeelde persoon-editor (incl. adres — nodig voor de WeFact-debiteur). */}
            <PersonFields personId={person.id} />
            <div className="border-t pt-3">
              <Button variant="ghost" size="sm" className="text-red-600" onClick={remove}><Trash2 className="mr-1.5 h-4 w-4" />Verwijderen</Button>
            </div>
            {canBill && person && <WefactDebtorPanel table="persons" subjectId={person.id} allowInvoice />}
            {canBill && person && <WefactContactInvoices table="persons" subjectId={person.id} />}
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
                  <span className="flex-1 truncate">{o.location_number} · {formatObjectAddress(o)}</span>
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
