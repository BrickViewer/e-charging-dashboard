import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { LeadPicker } from "@/components/contacts/LeadPicker";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { ObjectPicker } from "@/components/contacts/ObjectPicker";
import { ObjectCreateDialog } from "@/components/contacts/ObjectCreateDialog";
import { useCreateQuoteFromLead, useCreateQuoteStandalone } from "@/hooks/useQuotes";

type Ref = { id: string; label: string } | null;
type Mode = "lead" | "standalone";

// Nieuwe offerte aanmaken vanuit de offertemodule: vanuit een lead (voorgevuld) of
// standalone voor een object (blanco; bedrijf/persoon optioneel).
export function NewQuoteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (quoteId: string) => void }) {
  const fromLead = useCreateQuoteFromLead();
  const standalone = useCreateQuoteStandalone();
  const [mode, setMode] = useState<Mode>("lead");
  const [lead, setLead] = useState<Ref>(null);
  const [company, setCompany] = useState<Ref>(null);
  const [person, setPerson] = useState<Ref>(null);
  const [object, setObject] = useState<Ref>(null);
  const [objCreateOpen, setObjCreateOpen] = useState(false);

  useEffect(() => {
    if (open) { setMode("lead"); setLead(null); setCompany(null); setPerson(null); setObject(null); }
  }, [open]);

  const busy = fromLead.isPending || standalone.isPending;

  const create = async () => {
    try {
      if (mode === "lead") {
        if (!lead) { toast.error("Kies een lead"); return; }
        const { quoteId } = await fromLead.mutateAsync({ leadId: lead.id });
        onCreated(quoteId); onClose();
      } else {
        if (!object) { toast.error("Kies of maak een object"); return; }
        const { quoteId } = await standalone.mutateAsync({ projectLocationId: object.id, companyId: company?.id ?? null, personId: person?.id ?? null });
        onCreated(quoteId); onClose();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Offerte aanmaken mislukt"); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe offerte</DialogTitle>
          <DialogDescription>Start vanuit een bestaande lead (voorgevuld) of standalone voor een object.</DialogDescription>
        </DialogHeader>

        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(["lead", "standalone"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "lead" ? "Vanuit lead" : "Standalone"}
            </button>
          ))}
        </div>

        {mode === "lead" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Lead</Label>
            <LeadPicker value={lead?.id ?? null} valueLabel={lead?.label ?? null} onChange={(id, label) => setLead(id ? { id, label: label ?? "" } : null)} />
            <p className="text-[11px] text-muted-foreground">De offerte wordt voorgevuld met de configuratie van de lead.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Object *</Label>
              <div className="flex gap-2">
                <div className="flex-1"><ObjectPicker value={object?.id ?? null} valueLabel={object?.label ?? null} onChange={(id, label) => setObject(id ? { id, label: label ?? "" } : null)} /></div>
                <Button variant="outline" size="icon" onClick={() => setObjCreateOpen(true)} aria-label="Nieuw object"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Bedrijf (optioneel)</Label><CompanyPicker value={company?.id ?? null} valueLabel={company?.label ?? null} onChange={(id, c) => setCompany(id ? { id, label: c?.name ?? "" } : null)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Persoon (optioneel)</Label><PersonPicker value={person?.id ?? null} valueLabel={person?.label ?? null} onChange={(id, p) => setPerson(id ? { id, label: p?.full_name ?? "" } : null)} /></div>
            <p className="text-[11px] text-muted-foreground">Het object levert het offertenummer. De regels vul je daarna in het detail in.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleren</Button>
          <Button onClick={create} disabled={busy || (mode === "lead" ? !lead : !object)}>{busy ? "Aanmaken…" : "Offerte aanmaken"}</Button>
        </DialogFooter>

        <ObjectCreateDialog
          open={objCreateOpen}
          onClose={() => setObjCreateOpen(false)}
          onCreated={(id) => setObject({ id, label: "Nieuw object" })}
          defaultCompany={company}
        />
      </DialogContent>
    </Dialog>
  );
}
