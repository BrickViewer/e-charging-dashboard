import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useRejectQuote, REJECT_CATEGORIES } from "@/hooks/useQuotes";

// Intern een verstuurde offerte afwijzen mét reden (categorie verplicht + optionele toelichting).
// Optioneel de lead ook op Verloren zetten. De reden wordt opgeslagen voor analyse van
// terugkerende afwijsredenen; de klant ziet hier niets van.
export function RejectQuoteDialog({ quoteId, quoteNumber, open, onClose, onRejected }: {
  quoteId: string;
  quoteNumber: string;
  open: boolean;
  onClose: () => void;
  onRejected: () => void;
}) {
  const reject = useRejectQuote();
  const [category, setCategory] = useState<string>("");
  const [reason, setReason] = useState("");
  const [markLeadLost, setMarkLeadLost] = useState(false);

  const submit = async () => {
    if (!category) { toast.error("Kies een reden"); return; }
    try {
      const res = await reject.mutateAsync({ quoteId, reasonCategory: category, reason: reason.trim() || null, markLeadLost });
      toast.success(res.leadMarkedLost ? "Offerte afgewezen en lead op Verloren gezet" : "Offerte afgewezen");
      onRejected(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Afwijzen mislukt"); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Offerte {quoteNumber} afwijzen</DialogTitle>
          <DialogDescription>Leg intern vast waarom de klant deze offerte niet aanneemt. De ondertekenlink wordt ingetrokken; de klant krijgt hier geen bericht van.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Reden *</Label>
            <div className="grid gap-1.5">
              {REJECT_CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${category === c.value ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/40"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Toelichting (optioneel)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Bijv. 15% goedkoper bij concurrent, of: wacht tot volgend boekjaar." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={markLeadLost} onCheckedChange={(v) => setMarkLeadLost(v === true)} />
            Zet de lead ook op <strong>Verloren</strong>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={reject.isPending}>Annuleren</Button>
          <Button variant="destructive" onClick={submit} disabled={reject.isPending || !category}>
            {reject.isPending ? "Afwijzen…" : "Offerte afwijzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
