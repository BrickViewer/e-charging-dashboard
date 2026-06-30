import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateLead, type LeadStage } from "@/hooks/useLeads";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { ObjectPicker } from "@/components/contacts/ObjectPicker";
import { CompanyFields } from "@/components/contacts/CompanyFields";
import { PersonFields } from "@/components/contacts/PersonFields";
import { useCompany } from "@/hooks/useContacts";
import { useCreateProjectLocation, useUpdateProjectLocation } from "@/hooks/useProjectLocations";

type ObjMode = "none" | "new" | "existing";

const EMPTY = {
  company_id: "", company_name: "", person_id: "", person_name: "", notes: "",
  obj_name: "", obj_street: "", obj_house: "", obj_postal: "", obj_city: "",
};

export function AddLeadDialog({
  open,
  onOpenChange,
  organizationId,
  stages,
  defaultStageId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | undefined;
  stages: LeadStage[];
  defaultStageId?: string;
}) {
  const createLead = useCreateLead();
  const createObject = useCreateProjectLocation();
  const linkObject = useUpdateProjectLocation();
  const fallbackStage = stages.find((s) => s.is_default)?.id ?? stages[0]?.id;

  const [form, setForm] = useState({ ...EMPTY });
  const [stageId, setStageId] = useState(defaultStageId ?? fallbackStage ?? "");
  const [objMode, setObjMode] = useState<ObjMode>("none");
  const [objectId, setObjectId] = useState("");
  const [objectLabel, setObjectLabel] = useState("");

  // Zet de fase bij openen; her-evalueer zodra de fasen geladen zijn (anders blijft de knop disabled hangen).
  useEffect(() => {
    if (!open) return;
    setStageId((s) => defaultStageId || s || fallbackStage || "");
  }, [open, defaultStageId, fallbackStage]);

  const company = useCompany(form.company_id || undefined).data;
  const companyHasAddress = !!(company?.address_street || company?.postal_code || company?.city);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const copyCompanyAddress = () => {
    if (!company) return;
    setForm((f) => ({
      ...f,
      obj_street: company.address_street ?? "",
      obj_postal: company.postal_code ?? "",
      obj_city: company.city ?? "",
    }));
  };

  const reset = () => { setForm({ ...EMPTY }); setObjMode("none"); setObjectId(""); setObjectLabel(""); };

  const canSubmit = (!!form.company_id || !!form.person_id) && !!organizationId && !!stageId;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const lead = await createLead.mutateAsync({
        organization_id: organizationId!,
        stage_id: stageId,
        company_id: form.company_id || null,
        person_id: form.person_id || null,
        // company_name/contact_*/adres worden door de sync-trigger gevuld vanuit het bedrijf/persoon;
        // particulier (geen bedrijf) → val terug op de persoonsnaam.
        company_name: form.company_name.trim() || form.person_name.trim() || "Particulier",
        priority: "medium",
        notes: form.notes.trim() || null,
        source: "manual",
        position: 0,
      });

      // Object (uitvoerlocatie) — optioneel: nieuw aanmaken of een bestaand object aan de lead koppelen.
      if (objMode === "new") {
        const hasAny = [form.obj_street, form.obj_city, form.obj_postal, form.obj_house, form.obj_name].some((v) => v.trim());
        if (hasAny) {
          await createObject.mutateAsync({
            display_name: form.obj_name.trim() || undefined,
            address_street: form.obj_street.trim() || null,
            postal_code: form.obj_postal.trim() || null,
            city: form.obj_city.trim() || null,
            house_number: form.obj_house.trim() || null,
            company_id: form.company_id || null,
            person_id: form.person_id || null,
            lead_id: lead.id,
          });
        }
      } else if (objMode === "existing" && objectId) {
        await linkObject.mutateAsync({ id: objectId, patch: { lead_id: lead.id } });
      }

      toast.success("Lead toegevoegd");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

  const segBtn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40"}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>Nieuwe lead</DialogTitle>
        </DialogHeader>

        <div className="ec-scroll flex-1 space-y-4 overflow-y-auto py-1 pr-1">
          {/* BEDRIJF */}
          <div className="space-y-1.5">
            <Label>Bedrijf</Label>
            <CompanyPicker
              value={form.company_id || null}
              valueLabel={form.company_name || null}
              onChange={(id, c) => setForm((f) => ({ ...f, company_id: id ?? "", company_name: c?.name ?? "" }))}
            />
            {form.company_id && (
              <div className="rounded-lg border p-2.5"><CompanyFields companyId={form.company_id} /></div>
            )}
          </div>

          {/* CONTACTPERSOON */}
          <div className="space-y-1.5">
            <Label>Contactpersoon</Label>
            <PersonPicker
              value={form.person_id || null}
              valueLabel={form.person_name || null}
              companyId={form.company_id || null}
              onChange={(id, p) => setForm((f) => ({ ...f, person_id: id ?? "", person_name: p?.full_name ?? "" }))}
            />
            {form.person_id && (
              <div className="rounded-lg border p-2.5"><PersonFields personId={form.person_id} /></div>
            )}
            <p className="text-[11px] text-muted-foreground">Kies/maak een bedrijf en/of contactpersoon — minstens één. Geen bedrijf = particulier.</p>
          </div>

          {/* OBJECT (uitvoerlocatie) */}
          <div className="space-y-1.5">
            <Label>Object / locatie (optioneel)</Label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={segBtn(objMode === "none")} onClick={() => setObjMode("none")}>Geen</button>
              <button type="button" className={segBtn(objMode === "new")} onClick={() => setObjMode("new")}>Nieuw object</button>
              <button type="button" className={segBtn(objMode === "existing")} onClick={() => setObjMode("existing")}>Bestaand koppelen</button>
            </div>

            {objMode === "existing" && (
              <ObjectPicker value={objectId || null} valueLabel={objectLabel || null}
                onChange={(id, label) => { setObjectId(id ?? ""); setObjectLabel(label ?? ""); }} />
            )}

            {objMode === "new" && (
              <div className="space-y-2 rounded-lg border p-2.5">
                <Input placeholder="Objectnaam (optioneel)" value={form.obj_name} onChange={(e) => set("obj_name")(e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><Input placeholder="Straat" value={form.obj_street} onChange={(e) => set("obj_street")(e.target.value)} /></div>
                  <Input placeholder="Huisnr." value={form.obj_house} onChange={(e) => set("obj_house")(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Postcode" value={form.obj_postal} onChange={(e) => set("obj_postal")(e.target.value)} />
                  <Input placeholder="Plaats" value={form.obj_city} onChange={(e) => set("obj_city")(e.target.value)} />
                </div>
                <Button type="button" variant="outline" size="sm" disabled={!companyHasAddress} onClick={copyCompanyAddress}>
                  Adres overnemen van bedrijf
                </Button>
                <p className="text-[11px] text-muted-foreground">De offerte gaat op naam van bedrijf + contactpersoon; het object is de uitvoerlocatie (mag afwijken van het bedrijfsadres).</p>
              </div>
            )}
          </div>

          {/* FASE + NOTITIES */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fase *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notities</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="mt-3 shrink-0 border-t pt-3">
          {!canSubmit && (
            <p className="mr-auto self-center text-xs text-muted-foreground">Kies een bedrijf en/of contactpersoon, en een fase.</p>
          )}
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Annuleren</Button>
          <Button onClick={submit} disabled={!canSubmit || createLead.isPending || createObject.isPending}>
            {createLead.isPending || createObject.isPending ? "Bezig…" : "Lead toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
