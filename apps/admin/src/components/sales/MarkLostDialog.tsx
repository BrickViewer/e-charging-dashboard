import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useMarkLeadLost, type Lead } from "@/hooks/useLeads";

// Vaste redenen → aggregeerbaar voor analyse. "Anders" vereist een toelichting.
const LOST_REASONS = [
  "Prijs / te duur",
  "Gekozen voor concurrent",
  "Geen budget",
  "Timing / uitgesteld",
  "Geen respons",
  "Geen fit",
  "Anders",
];

export function MarkLostDialog({
  lead,
  lostStageId,
  open,
  onOpenChange,
  onDone,
}: {
  lead: Lead | null;
  lostStageId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const markLost = useMarkLeadLost();

  const noteRequired = reason === "Anders";
  const canSubmit = !!reason && (!noteRequired || note.trim() !== "") && !!lostStageId && !!lead;

  const reset = () => { setReason(""); setNote(""); };

  const submit = async () => {
    if (!lead || !lostStageId || !reason) return;
    const finalReason = reason === "Anders" ? note.trim() : note.trim() ? `${reason} — ${note.trim()}` : reason;
    try {
      await markLost.mutateAsync({ id: lead.id, lostStageId, reason: finalReason });
      toast.success("Lead naar archief (verloren)");
      reset();
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Markeren mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lead markeren als verloren</DialogTitle>
          <DialogDescription>
            {lead?.company_name ? `"${lead.company_name}" ` : ""}gaat naar het archief. Noteer waarom we deze lead
            verloren — zo verzamelen we die data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Reden</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Kies een reden…" /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Toelichting{noteRequired ? "" : " (optioneel)"}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Korte toelichting…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={!canSubmit || markLost.isPending}>
            {markLost.isPending ? "Opslaan…" : "Markeer verloren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
