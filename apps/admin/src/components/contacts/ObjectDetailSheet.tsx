import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { DossierDocuments } from "@/components/documents/DossierDocuments";
import { useProjectLocation, useQuotesForLocation, useUpdateProjectLocation } from "@/hooks/useProjectLocations";

// Detail van een Object (project_location): adres, offertehistorie en SharePoint-dossier.
export function ObjectDetailSheet({ objectId, open, onOpenChange }: { objectId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const locQ = useProjectLocation(open ? objectId ?? undefined : undefined);
  const quotesQ = useQuotesForLocation(open ? objectId ?? undefined : undefined);
  const update = useUpdateProjectLocation();
  const loc = locQ.data;

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (loc) setForm({
      display_name: loc.display_name ?? "", address_street: loc.address_street ?? "", house_number: loc.house_number ?? "",
      postal_code: loc.postal_code ?? "", city: loc.city ?? "", status: loc.status ?? "actief", notes: loc.notes ?? "",
    });
  }, [loc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!objectId) return null;
  const t = (k: string) => form[k] ?? "";
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!loc) return;
    try {
      await update.mutateAsync({ id: loc.id, patch: {
        display_name: t("display_name").trim() || loc.display_name,
        address_street: t("address_street").trim() || null, house_number: t("house_number").trim() || null,
        postal_code: t("postal_code").trim() || null, city: t("city").trim() || null,
        status: t("status").trim() || "actief", notes: t("notes").trim() || null,
      } });
      toast.success("Object opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{loc?.display_name ?? "Object"}</SheetTitle>
          <SheetDescription>
            Locatie {loc?.location_number ?? "…"}{loc?.companies?.name ? ` · ${loc.companies.name}` : ""}
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
              <Field label="Weergavenaam"><Input value={t("display_name")} onChange={(e) => set("display_name")(e.target.value)} /></Field>
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
            <Field label="Notities"><Textarea rows={3} value={t("notes")} onChange={(e) => set("notes")(e.target.value)} /></Field>
            <div className="flex justify-end border-t pt-4">
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
              {quotesQ.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nog geen offertes op deze locatie.</p>}
            </div>
          </TabsContent>

          <TabsContent value="mappen" className="mt-4">
            {loc ? <DossierDocuments location={loc} /> : <p className="text-sm text-muted-foreground">Laden…</p>}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
