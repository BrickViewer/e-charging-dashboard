import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { ObjectFields } from "@/components/contacts/ObjectFields";
import { useUpdateProjectLocation } from "@/hooks/useProjectLocations";

const EMPTY = { company_id: "", company_name: "", person_id: "", person_name: "", notes: "" };

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
  const linkObject = useUpdateProjectLocation();
  const fallbackStage = stages.find((s) => s.is_default)?.id ?? stages[0]?.id;

  const [form, setForm] = useState({ ...EMPTY });
  const [stageId, setStageId] = useState(defaultStageId ?? fallbackStage ?? "");
  const [objectId, setObjectId] = useState("");
  const [objectLabel, setObjectLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    setStageId((s) => defaultStageId || s || fallbackStage || "");
  }, [open, defaultStageId, fallbackStage]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { setForm({ ...EMPTY }); setObjectId(""); setObjectLabel(""); };

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

      // Object (uitvoerlocatie) optioneel aan de lead koppelen — laat eventuele bestaande bedrijf/persoon op het object staan.
      if (objectId) await linkObject.mutateAsync({ id: objectId, patch: { lead_id: lead.id } });

      toast.success("Lead toegevoegd");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

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
            <ObjectPicker
              value={objectId || null}
              valueLabel={objectLabel || null}
              onChange={(id, label) => { setObjectId(id ?? ""); setObjectLabel(label ?? ""); }}
            />
            {objectId && (
              <div className="rounded-lg border p-2.5"><ObjectFields objectId={objectId} /></div>
            )}
            <p className="text-[11px] text-muted-foreground">De offerte gaat op naam van bedrijf + contactpersoon; het object is de uitvoerlocatie (mag een ander adres hebben).</p>
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
          <Button onClick={submit} disabled={!canSubmit || createLead.isPending}>
            {createLead.isPending ? "Bezig…" : "Lead toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
