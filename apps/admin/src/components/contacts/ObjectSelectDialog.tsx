import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, AlertCircle, Plus } from "lucide-react";
import { findMatchingLocation, type ProjectLocation } from "@/hooks/useProjectLocations";
import { ObjectPicker } from "./ObjectPicker";

export type LeadLite = {
  id: string;
  organization_id: string;
  company_id: string | null;
  company_name: string | null;
  address_street: string | null;
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
        const m = await findMatchingLocation({ org: lead.organization_id, company: lead.company_id, street: lead.address_street ?? "", postal: lead.postal_code ?? "", city: lead.city ?? "" });
        if (!cancelled) setMatch(m);
      } catch { /* match is best-effort */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null;
  const address = [lead.address_street, [lead.postal_code, lead.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "geen adres";
  const chosenId = override?.id ?? match?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Object kiezen</DialogTitle>
          <DialogDescription>De offerte wordt gekoppeld aan een object.{lead.company_name ? ` ${lead.company_name}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{address}</span>
          </div>

          {checking ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Object zoeken…</p>
          ) : override ? (
            <div className="rounded-lg border bg-muted/40 p-2.5 text-sm">Gekozen object: <span className="font-medium">{override.label}</span></div>
          ) : match ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Dit adres hoort al bij object <strong>{match.location_number}</strong>. De offerte wordt hieraan gekoppeld met een nieuw documentnummer (bv. {match.location_number}-02).</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border p-2.5 text-sm text-muted-foreground">
              <Plus className="mt-0.5 h-4 w-4 shrink-0" /><span>Er wordt een <strong>nieuw object</strong> aangemaakt voor dit adres.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Of kies een ander bestaand object</p>
            <ObjectPicker value={override?.id ?? null} valueLabel={override?.label ?? null} onChange={(id, label) => setOverride(id ? { id, label: label ?? "" } : null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Annuleren</Button>
          <Button onClick={() => onConfirm(chosenId)} disabled={pending || checking}>{pending ? "Offerte maken…" : "Offerte maken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
