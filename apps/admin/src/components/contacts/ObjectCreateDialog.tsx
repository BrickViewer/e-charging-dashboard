import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { findMatchingLocation, useCreateProjectLocation, type ProjectLocation } from "@/hooks/useProjectLocations";
import { AddressFields, type AddressValue } from "./AddressFields";
import { CompanyPicker } from "./CompanyPicker";
import { PersonPicker } from "./PersonPicker";
import { LeadPicker } from "./LeadPicker";

type Ref = { id: string; label: string } | null;
const EMPTY_ADDR: AddressValue = { street: "", houseNumber: "", postalCode: "", city: "" };

async function resolveOrgId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
    if (prof?.organization_id) return prof.organization_id as string;
  }
  const { data: org } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (org?.id as string | undefined) ?? null;
}

// Handmatig een object (adres/pand) toevoegen, optioneel gekoppeld aan een bedrijf,
// persoon en/of lead. De naam is afgeleid van het adres; waarschuwt als het adres al bestaat.
export function ObjectCreateDialog({ open, onClose, onCreated, defaultCompany = null, defaultPerson = null, defaultLead = null, defaultAddress = null }: {
  open: boolean;
  onClose: () => void;
  onCreated: (objectId: string) => void;
  defaultCompany?: Ref;
  defaultPerson?: Ref;
  defaultLead?: Ref;
  defaultAddress?: AddressValue | null;
}) {
  const create = useCreateProjectLocation();
  const [addr, setAddr] = useState<AddressValue>({ ...EMPTY_ADDR });
  const [company, setCompany] = useState<Ref>(defaultCompany);
  const [person, setPerson] = useState<Ref>(defaultPerson);
  const [lead, setLead] = useState<Ref>(defaultLead);
  const [match, setMatch] = useState<ProjectLocation | null>(null);
  const [checking, setChecking] = useState(false);

  // Reset/prefill bij openen.
  useEffect(() => {
    if (open) {
      setAddr(defaultAddress ? { ...EMPTY_ADDR, ...defaultAddress } : { ...EMPTY_ADDR });
      setCompany(defaultCompany); setPerson(defaultPerson); setLead(defaultLead);
      setMatch(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const dStreet = useDebouncedValue(addr.street, 350);
  const dPostal = useDebouncedValue(addr.postalCode, 350);
  const dCity = useDebouncedValue(addr.city, 350);

  // Best-effort "bestaat dit adres al?"-check via dezelfde DB-functie als de offerteflow.
  useEffect(() => {
    if (!open) return;
    const s = dStreet.trim(); const p = dPostal.trim(); const c = dCity.trim();
    if (!s && !p && !c && !lead) { setMatch(null); return; }
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const org = await resolveOrgId();
        if (!org) return;
        const m = await findMatchingLocation({ org, company: company?.id ?? null, street: s, postal: p, city: c, house: addr.houseNumber || null, lead: lead?.id ?? null });
        if (!cancelled) setMatch(m);
      } catch { /* best-effort */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [open, dStreet, dPostal, dCity, company?.id, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = !create.isPending && Boolean(addr.street.trim() || addr.postalCode.trim() || company || person);

  const submit = async () => {
    try {
      const created = await create.mutateAsync({
        // display_name is afgeleid (server-trigger) — niet meesturen.
        address_street: addr.street.trim() || null,
        postal_code: addr.postalCode.trim() || null,
        city: addr.city.trim() || null,
        house_number: addr.houseNumber.trim() || null,
        company_id: company?.id ?? null,
        person_id: person?.id ?? null,
        lead_id: lead?.id ?? null,
      });
      toast.success(`Object ${created.location_number} aangemaakt`);
      onCreated(created.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Object aanmaken mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Object toevoegen</DialogTitle>
          <DialogDescription>Een object is een adres/pand (de uitvoerlocatie). De naam wordt automatisch opgebouwd uit het adres + objectnummer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <AddressFields value={addr} onChange={(p) => setAddr((a) => ({ ...a, ...p }))} />

          {checking ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Adres controleren…</p>
          ) : match ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Dit adres hoort al bij object <strong>{match.location_number}</strong>.{" "}
                <button type="button" className="underline" onClick={() => { onCreated(match.id); onClose(); }}>Open dat object</button>{" "}
                of maak hieronder toch een nieuw object aan.
              </span>
            </div>
          ) : null}

          <div className="space-y-2 border-t pt-3">
            <div className="space-y-1"><Label>Bedrijf (optioneel)</Label>
              <CompanyPicker value={company?.id ?? null} valueLabel={company?.label ?? null} onChange={(id, c) => setCompany(id ? { id, label: c?.name ?? "" } : null)} />
            </div>
            <div className="space-y-1"><Label>Persoon (optioneel)</Label>
              <PersonPicker value={person?.id ?? null} valueLabel={person?.label ?? null} onChange={(id, p) => setPerson(id ? { id, label: p?.full_name ?? "" } : null)} />
            </div>
            <div className="space-y-1"><Label>Lead (optioneel)</Label>
              <LeadPicker value={lead?.id ?? null} valueLabel={lead?.label ?? null} onChange={(id, label) => setLead(id ? { id, label: label ?? "" } : null)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Annuleren</Button>
          <Button onClick={submit} disabled={!canSubmit}><Plus className="mr-2 h-4 w-4" />{create.isPending ? "Aanmaken…" : "Object aanmaken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
