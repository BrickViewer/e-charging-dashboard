import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { useLostReasons, useUpdateLead, useBulkPatchLeads } from "@/hooks/useLeads";

// Verplichte verlies-reden bij het markeren van één of meer leads als verloren.
// Zet de lead op de is_lost-fase + lost_reason_id (+ optionele notitie in lost_reason).
// De DB-guard weigert een is_lost-fase zonder reden, dus dit is het enige nette pad.
export function MarkLostDialog({
  open,
  onOpenChange,
  leadIds,
  lostStageId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadIds: string[];
  lostStageId: string | null;
  onDone?: () => void;
}) {
  const reasonsQ = useLostReasons();
  const reasons = (reasonsQ.data ?? []).filter((r) => r.is_active);
  const updateLead = useUpdateLead();
  const bulkPatch = useBulkPatchLeads();
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) { setReasonId(""); setNote(""); }
  }, [open]);

  const pending = updateLead.isPending || bulkPatch.isPending;
  const count = leadIds.length;

  const submit = async () => {
    if (!reasonId) { toast.error("Kies een reden."); return; }
    if (!lostStageId) { toast.error("Er is geen 'Verloren'-fase ingesteld."); return; }
    const patch = { stage_id: lostStageId, lost_reason_id: reasonId, lost_reason: note.trim() || null };
    try {
      if (count === 1) await updateLead.mutateAsync({ id: leadIds[0], patch });
      else await bulkPatch.mutateAsync({ ids: leadIds, patch });
      toast.success(count > 1 ? `${count} leads gemarkeerd als verloren` : "Lead gemarkeerd als verloren");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Markeren mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" /> Lead verloren markeren
          </DialogTitle>
          <DialogDescription>
            {count > 1 ? `${count} leads worden op 'Verloren' gezet.` : "Waarom is deze lead niet doorgegaan?"} Dit voedt de win/loss-analyse.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="lost-reason">Reden *</Label>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger id="lost-reason" className="mt-1"><SelectValue placeholder="Kies een reden…" /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {reasons.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Nog geen redenen ingesteld — voeg ze toe via "Fasen beheren".</p>
            )}
          </div>
          <div>
            <Label htmlFor="lost-note">Toelichting (optioneel)</Label>
            <Textarea id="lost-note" className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bijv. koos voor concurrent vanwege levertijd" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !reasonId}>
            {pending ? "Bezig…" : "Markeer verloren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
