import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { findMatchingLocation, type ProjectLocation } from "@/hooks/useProjectLocations";
import { ObjectPicker } from "./ObjectPicker";
import { formatObjectAddress } from "@/lib/objectLabel";

export type LeadLite = {
  id: string;
  organization_id: string;
  company_id: string | null;
  company_name: string | null;
  address_street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
};

// Bij het maken van een offerte: expliciet het object kiezen/bevestigen (e-portal-stijl),
// met "dit adres bestaat al"-melding. onConfirm(null) → de edge-fn maakt/koppelt zelf het object.
export function ObjectSelectDialog({ open, onClose, lead, onConfirm, pending }: {
  open: boolean; onClose: () => void; lead: LeadLite | null;
  onConfirm: (projectLocationId: string | null) => void; pending?: boolean;
}) {
  const [match, setMatch] = useState<ProjectLocation | null>(null);
  const [checking, setChecking] = useState(false);
  const [override, setOverride] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setOverride(null); setMatch(null);
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const m = await findMatchingLocation({ org: lead.organization_id, company: lead.company_id, street: lead.address_street ?? "", postal: lead.postal_code ?? "", city: lead.city ?? "", lead: lead.id });
        if (!cancelled) setMatch(m);
      } catch { /* match is best-effort */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null;
  const address = (lead.address_street || lead.city) ? formatObjectAddress(lead) : "geen adres";
  const chosenId = override?.id ?? match?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Object kiezen</DialogTitle>
          <DialogDescription>De offerte wordt aan dit object gekoppeld. Klik om een ander object te kiezen.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {checking ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Adres controleren…</p>
          ) : (
            <ObjectPicker
              value={override?.id ?? match?.id ?? null}
              valueLabel={override?.label ?? (match ? match.display_name : address)}
              onChange={(id, label) => setOverride(id ? { id, label: label ?? "" } : null)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Annuleren</Button>
          <Button onClick={() => onConfirm(chosenId)} disabled={pending || checking}>{pending ? "Offerte maken…" : "Offerte maken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
