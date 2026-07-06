import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LeadPicker } from "@/components/contacts/LeadPicker";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { ObjectPicker } from "@/components/contacts/ObjectPicker";
import { useCreateQuoteFromLead, useCreateQuoteStandalone } from "@/hooks/useQuotes";
import { useLeadsForObject } from "@/hooks/useProjectLocations";

type Ref = { id: string; label: string } | null;
type Mode = "lead" | "standalone";

// Nieuwe offerte aanmaken vanuit de offertemodule: vanuit een lead (voorgevuld) of
// standalone voor een BESTAAND object. Elke offerte hoort in de leads-pipeline: standalone
// koppelt de server aan de (gekozen) lead van het object of maakt er automatisch één aan.
// Nieuwe objecten maak je hier bewust niet aan — een nieuwe klant start als lead.
export function NewQuoteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (quoteId: string) => void }) {
  const fromLead = useCreateQuoteFromLead();
  const standalone = useCreateQuoteStandalone();
  const [mode, setMode] = useState<Mode>("lead");
  const [lead, setLead] = useState<Ref>(null);
  const [company, setCompany] = useState<Ref>(null);
  const [person, setPerson] = useState<Ref>(null);
  const [object, setObject] = useState<Ref>(null);
  const [objectLeadId, setObjectLeadId] = useState<string | null>(null);

  const objectLeads = useLeadsForObject(mode === "standalone" ? object?.id : undefined);
  const links = objectLeads.data ?? [];

  useEffect(() => {
    if (open) { setMode("lead"); setLead(null); setCompany(null); setPerson(null); setObject(null); setObjectLeadId(null); }
  }, [open]);

  // Default: de oudste gekoppelde lead van het gekozen object (zelfde keuze als de server).
  useEffect(() => {
    setObjectLeadId(links[0]?.lead_id ?? null);
  }, [object?.id, objectLeads.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = fromLead.isPending || standalone.isPending;

  const create = async () => {
    try {
      if (mode === "lead") {
        if (!lead) { toast.error("Kies een lead"); return; }
        const { quoteId } = await fromLead.mutateAsync({ leadId: lead.id });
        onCreated(quoteId); onClose();
      } else {
        if (!object) { toast.error("Kies een object"); return; }
        const res = await standalone.mutateAsync({
          projectLocationId: object.id,
          companyId: company?.id ?? null,
          personId: person?.id ?? null,
          leadId: objectLeadId,
        });
        if (res.leadCreated) toast.success("Automatisch een lead aangemaakt in de pipeline");
        onCreated(res.quoteId); onClose();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Offerte aanmaken mislukt"); }
  };

  const leadName = (l: (typeof links)[number]) => l.leads?.company_name || "Naamloze lead";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe offerte</DialogTitle>
          <DialogDescription>Start vanuit een bestaande lead (voorgevuld) of standalone voor een bestaand object.</DialogDescription>
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
              <ObjectPicker allowCreate={false} value={object?.id ?? null} valueLabel={object?.label ?? null} onChange={(id, label) => setObject(id ? { id, label: label ?? "" } : null)} />
              <p className="text-[11px] text-muted-foreground">
                Alleen bestaande objecten. Nieuwe klant? <Link to="/sales/leads" className="underline underline-offset-2" onClick={onClose}>Maak eerst een lead aan</Link> — daar maak je ook het object aan.
              </p>
            </div>

            {object && !objectLeads.isLoading && (
              links.length === 0 ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                  Dit object heeft nog geen lead — er wordt <strong>automatisch een lead</strong> in de pipeline aangemaakt zodat de offerte zichtbaar blijft in de leadlijst.
                </p>
              ) : links.length === 1 ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                  Wordt gekoppeld aan lead <strong>{leadName(links[0])}</strong>.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Lead (dit object heeft er meerdere)</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={objectLeadId ?? ""}
                    onChange={(e) => setObjectLeadId(e.target.value || null)}
                  >
                    {links.map((l) => (
                      <option key={l.lead_id} value={l.lead_id}>{leadName(l)}</option>
                    ))}
                  </select>
                </div>
              )
            )}

            <div className="space-y-1.5"><Label className="text-xs">Bedrijf (optioneel)</Label><CompanyPicker value={company?.id ?? null} valueLabel={company?.label ?? null} onChange={(id, c) => setCompany(id ? { id, label: c?.name ?? "" } : null)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Persoon (optioneel)</Label><PersonPicker value={person?.id ?? null} valueLabel={person?.label ?? null} onChange={(id, p) => setPerson(id ? { id, label: p?.full_name ?? "" } : null)} /></div>
            <p className="text-[11px] text-muted-foreground">Het object levert het offertenummer. Voor een <strong>particulier</strong> laat je het bedrijf leeg en kies je alleen een persoon.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleren</Button>
          <Button onClick={create} disabled={busy || (mode === "lead" ? !lead : !object)}>{busy ? "Aanmaken…" : "Offerte aanmaken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
