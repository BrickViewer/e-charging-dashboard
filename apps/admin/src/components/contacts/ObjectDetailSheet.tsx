import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Trash2, X } from "lucide-react";
import { DossierDocuments } from "@/components/documents/DossierDocuments";
import { useProjectLocation, useQuotesForLocation, useUpdateProjectLocation, useDeleteProjectLocation, useLeadsForObject, useLinkLeadObject, useUnlinkLeadObject } from "@/hooks/useProjectLocations";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { LeadPicker } from "@/components/contacts/LeadPicker";

type LinkRef = { id: string; label: string } | null;

// Detail van een Object (project_location): adres, offertehistorie en SharePoint-dossier.
export function ObjectDetailSheet({ objectId, open, onOpenChange }: { objectId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const locQ = useProjectLocation(open ? objectId ?? undefined : undefined);
  const quotesQ = useQuotesForLocation(open ? objectId ?? undefined : undefined);
  const leadsQ = useLeadsForObject(open ? objectId ?? undefined : undefined);
  const update = useUpdateProjectLocation();
  const del = useDeleteProjectLocation();
  const linkLead = useLinkLeadObject();
  const unlinkLead = useUnlinkLeadObject();
  const loc = locQ.data;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteSp, setDeleteSp] = useState(true);

  const doDelete = async () => {
    if (!loc) return;
    try {
      await del.mutateAsync({ id: loc.id, deleteSharepoint: deleteSp });
      toast.success("Object verwijderd");
      setConfirmOpen(false);
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  const [form, setForm] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<LinkRef>(null);
  const [person, setPerson] = useState<LinkRef>(null);
  useEffect(() => {
    if (loc) {
      setForm({
        display_name: loc.display_name ?? "", address_street: loc.address_street ?? "", house_number: loc.house_number ?? "",
        postal_code: loc.postal_code ?? "", city: loc.city ?? "", status: loc.status ?? "actief", notes: loc.notes ?? "",
      });
      setCompany(loc.company_id ? { id: loc.company_id, label: loc.companies?.name ?? "Bedrijf" } : null);
      setPerson(loc.person_id ? { id: loc.person_id, label: loc.persons?.full_name ?? "Persoon" } : null);
    }
  }, [loc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!objectId) return null;
  const t = (k: string) => form[k] ?? "";
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!loc) return;
    try {
      await update.mutateAsync({ id: loc.id, patch: {
        // display_name is afgeleid (server-trigger uit adres + objectnummer) — niet meesturen.
        address_street: t("address_street").trim() || null, house_number: t("house_number").trim() || null,
        postal_code: t("postal_code").trim() || null, city: t("city").trim() || null,
        status: t("status").trim() || "actief", notes: t("notes").trim() || null,
        company_id: company?.id ?? null, person_id: person?.id ?? null,
      } });
      toast.success("Object opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  // Leads koppelen/ontkoppelen (N:M) — direct, los van "Opslaan".
  const addLead = async (leadId: string) => {
    if (!loc) return;
    try { await linkLead.mutateAsync({ leadId, objectId: loc.id }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Koppelen mislukt"); }
  };
  const removeLead = async (leadId: string) => {
    if (!loc) return;
    try { await unlinkLead.mutateAsync({ leadId, objectId: loc.id }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ontkoppelen mislukt"); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{loc?.display_name ?? "Object"}</SheetTitle>
          <SheetDescription>
            Object {loc?.location_number ?? "…"}{loc?.companies?.name ? ` · ${loc.companies.name}` : ""}
            {loc?.folder_web_url ? <> · <a href={loc.folder_web_url} target="_blank" rel="noopener" className="text-primary hover:underline">Open in SharePoint</a></> : null}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="gegevens" className="mt-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
            <TabsTrigger value="offertes">Offertes{quotesQ.data ? ` (${quotesQ.data.length})` : ""}</TabsTrigger>
            <TabsTrigger value="mappen">Mappen</TabsTrigger>
          </TabsList>

          <TabsContent value="gegevens" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Objectnaam (automatisch)"><p className="flex h-9 items-center px-1 text-sm font-medium">{loc?.display_name ?? "—"}</p></Field>
              <Field label="Status">
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={t("status")} onChange={(e) => set("status")(e.target.value)}>
                  <option value="actief">Actief</option>
                  <option value="afgerond">Afgerond</option>
                </select>
              </Field>
              <Field label="Straat"><Input value={t("address_street")} onChange={(e) => set("address_street")(e.target.value)} /></Field>
              <Field label="Huisnummer"><Input value={t("house_number")} onChange={(e) => set("house_number")(e.target.value)} /></Field>
              <Field label="Postcode"><Input value={t("postal_code")} onChange={(e) => set("postal_code")(e.target.value)} /></Field>
              <Field label="Plaats"><Input value={t("city")} onChange={(e) => set("city")(e.target.value)} /></Field>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Koppelingen</p>
              <Field label="Bedrijf"><CompanyPicker value={company?.id ?? null} valueLabel={company?.label ?? null} onChange={(id, c) => setCompany(id ? { id, label: c?.name ?? "" } : null)} /></Field>
              <Field label="Persoon"><PersonPicker value={person?.id ?? null} valueLabel={person?.label ?? null} onChange={(id, p) => setPerson(id ? { id, label: p?.full_name ?? "" } : null)} /></Field>
              <div className="space-y-1.5">
                <Label className="text-xs">Leads <span className="font-normal text-muted-foreground">(gedeeld dossier)</span></Label>
                <div className="space-y-1">
                  {(leadsQ.data ?? []).map((r) => (
                    <div key={r.lead_id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-sm">
                      <span className="truncate">{r.leads?.company_name ?? "Lead"}</span>
                      <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => removeLead(r.lead_id)} aria-label="Lead ontkoppelen"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {(leadsQ.data ?? []).length === 0 && <p className="text-[11px] text-muted-foreground">Nog geen lead gekoppeld.</p>}
                </div>
                <LeadPicker value={null} valueLabel={null} onChange={(id) => { if (id) addLead(id); }} />
              </div>
            </div>
            <Field label="Notities"><Textarea rows={3} value={t("notes")} onChange={(e) => set("notes")(e.target.value)} /></Field>
            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setConfirmOpen(true)} disabled={!loc}>
                <Trash2 className="mr-1.5 h-4 w-4" />Verwijderen
              </Button>
              <Button onClick={save} disabled={update.isPending || !loc}>{update.isPending ? "Opslaan…" : "Opslaan"}</Button>
            </div>
          </TabsContent>

          <TabsContent value="offertes" className="mt-4">
            <div className="space-y-1.5">
              {(quotesQ.data ?? []).map((q) => {
                const total = (q.total_hardware_cost ?? 0) + (q.total_installation_cost ?? 0);
                return (
                  <div key={q.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums">{q.quote_number ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleDateString("nl-NL")}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">{q.status ?? "—"}</Badge>
                    <span className="tabular-nums text-muted-foreground">€ {total.toLocaleString("nl-NL")}</span>
                    {q.off_web_url ? <a href={q.off_web_url} target="_blank" rel="noopener" className="text-primary" aria-label="Offerte in SharePoint"><FileText className="h-4 w-4" /></a> : null}
                  </div>
                );
              })}
              {quotesQ.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nog geen offertes op dit object.</p>}
            </div>
          </TabsContent>

          <TabsContent value="mappen" className="mt-4">
            {loc ? <DossierDocuments location={loc} /> : <p className="text-sm text-muted-foreground">Laden…</p>}
          </TabsContent>
        </Tabs>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Object verwijderen?</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p>Object <strong>{loc?.location_number}</strong> ({loc?.display_name}) wordt verwijderd. Het nummer komt weer vrij voor een volgend object.</p>
              {(quotesQ.data?.length ?? 0) > 0 && (
                <p className="rounded-md bg-amber-50 p-2 text-amber-800">Let op: {quotesQ.data!.length} offerte(s) verliezen hun koppeling met dit object (ze blijven verder bestaan).</p>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={deleteSp} onChange={(e) => setDeleteSp(e.target.checked)} />
                Ook de SharePoint-map verwijderen
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={del.isPending}>Annuleren</Button>
              <Button variant="destructive" onClick={doDelete} disabled={del.isPending}>{del.isPending ? "Verwijderen…" : "Verwijderen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
