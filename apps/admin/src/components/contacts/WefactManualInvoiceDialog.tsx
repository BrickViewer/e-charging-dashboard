import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";

interface ManualLine { description: string; priceExcl: string }

// Herbruikbare "handmatige factuur"-dialoog. Werkt voor een bedrijf, persoon of klant;
// de edge borgt de WeFact-debiteur automatisch (ensureDebtorCode). Vrije regels +
// optioneel direct per e-mail versturen naar de debiteur.
export function WefactManualInvoiceDialog({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectType: "company" | "person" | "client";
  subjectId: string;
  onCreated?: () => void;
}) {
  const [lines, setLines] = useState<ManualLine[]>([{ description: "", priceExcl: "" }]);
  const [sendByEmail, setSendByEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setLines([{ description: "", priceExcl: "" }]);
    setSendByEmail(false);
  };

  const create = async () => {
    const payloadLines = lines
      .map((l) => ({ description: l.description.trim(), priceExcl: Number(l.priceExcl) }))
      .filter((l) => l.description && Number.isFinite(l.priceExcl));
    if (payloadLines.length === 0) { toast.error("Voeg minstens één geldige regel toe"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-create-invoice", {
        body: { kind: "handmatig", subjectType, subjectId, lines: payloadLines, sendByEmail },
      });
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd.");
      if (data?.status !== "ok") throw new Error(data?.message ?? "Aanmaken mislukt");
      if (data.warning) toast.warning(`Factuur ${data.invoiceCode} aangemaakt, maar versturen mislukt: ${data.warning}`);
      else toast.success(`Factuur ${data.invoiceCode} aangemaakt${sendByEmail ? " en verstuurd" : ""}`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nieuwe factuur</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {idx === 0 && <Label className="text-xs">Omschrijving</Label>}
                <Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
              </div>
              <div className="w-32 space-y-1">
                {idx === 0 && <Label className="text-xs">Bedrag excl. btw</Label>}
                <Input type="number" step="0.01" value={l.priceExcl} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, priceExcl: e.target.value } : x))} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { description: "", priceExcl: "" }])}>
            <Plus className="mr-1.5 h-4 w-4" />Regel toevoegen
          </Button>
          <div className="flex items-center gap-2 pt-1">
            <input id="wefact-manual-send" type="checkbox" checked={sendByEmail} onChange={(e) => setSendByEmail(e.target.checked)} />
            <Label htmlFor="wefact-manual-send" className="cursor-pointer text-sm font-normal">Direct per e-mail versturen</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={create} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}Aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
