import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateLead, type LeadStage } from "@/hooks/useLeads";

const LOCATION_TYPES = [
  { value: "workplace", label: "Werkplek" },
  { value: "destination", label: "Bestemming" },
  { value: "fleet", label: "Vloot/depot" },
  { value: "public", label: "Publiek" },
  { value: "other", label: "Anders" },
];

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

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
  const fallbackStage = stages.find((s) => s.is_default)?.id ?? stages[0]?.id;
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    contact_role: "",
    contact_email: "",
    contact_phone: "",
    city: "",
    location_type: "",
    estimated_charge_points: "",
    estimated_value: "",
    priority: "medium",
    expected_close_date: "",
    notes: "",
    stage_id: defaultStageId ?? fallbackStage ?? "",
  });

  // Zet de fase bij openen; her-evalueer ook zodra de fasen geladen zijn
  // (fallbackStage) zodat de "Toevoegen"-knop niet disabled blijft hangen.
  useEffect(() => {
    if (!open) return;
    // `||` (niet `??`): een lege string moet doorvallen naar fallbackStage zodra
    // de fasen geladen zijn — anders blijft de fase leeg en de knop disabled.
    setForm((f) => ({ ...f, stage_id: defaultStageId || f.stage_id || fallbackStage || "" }));
  }, [open, defaultStageId, fallbackStage]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.company_name.trim().length > 0 && !!organizationId && !!form.stage_id;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await createLead.mutateAsync({
        organization_id: organizationId!,
        stage_id: form.stage_id,
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_role: form.contact_role.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        city: form.city.trim() || null,
        location_type: form.location_type || null,
        estimated_charge_points: form.estimated_charge_points ? Math.round(num(form.estimated_charge_points) ?? 0) : null,
        estimated_value: num(form.estimated_value),
        priority: form.priority,
        expected_close_date: form.expected_close_date || null,
        notes: form.notes.trim() || null,
        source: "manual",
        position: 0,
      });
      toast.success("Lead toegevoegd");
      onOpenChange(false);
      setForm((f) => ({
        ...f,
        company_name: "", contact_name: "", contact_role: "", contact_email: "", contact_phone: "",
        city: "", location_type: "", estimated_charge_points: "", estimated_value: "",
        priority: "medium", expected_close_date: "", notes: "",
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe lead</DialogTitle>
        </DialogHeader>

        <div
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
              submit();
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>Bedrijfsnaam *</Label>
            <Input value={form.company_name} onChange={(e) => set("company_name")(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Contactpersoon</Label>
              <Input value={form.contact_name} onChange={(e) => set("contact_name")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Functie</Label>
              <Input value={form.contact_role} onChange={(e) => set("contact_role")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plaats</Label>
              <Input value={form.city} onChange={(e) => set("city")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type locatie</Label>
              <Select value={form.location_type} onValueChange={set("location_type")}>
                <SelectTrigger><SelectValue placeholder="Kies…" /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Geschat aantal laadpunten</Label>
              <Input inputMode="numeric" value={form.estimated_charge_points} onChange={(e) => set("estimated_charge_points")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Geschatte waarde (€)</Label>
              <Input inputMode="decimal" value={form.estimated_value} onChange={(e) => set("estimated_value")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioriteit</Label>
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Laag</SelectItem>
                  <SelectItem value="medium">Gemiddeld</SelectItem>
                  <SelectItem value="high">Hoog</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Verwachte sluitdatum</Label>
              <Input type="date" value={form.expected_close_date} onChange={(e) => set("expected_close_date")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fase *</Label>
              <Select value={form.stage_id} onValueChange={set("stage_id")}>
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

        <DialogFooter>
          {!canSubmit && (
            <p className="mr-auto self-center text-xs text-muted-foreground">Vul een bedrijfsnaam in en kies een fase.</p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={!canSubmit || createLead.isPending}>
            {createLead.isPending ? "Bezig…" : "Lead toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
