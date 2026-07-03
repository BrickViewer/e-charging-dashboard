import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateLead, type LeadStage } from "@/hooks/useLeads";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { PhoneField } from "@/components/contacts/PhoneField";
import { AddressFields, type AddressValue } from "@/components/contacts/AddressFields";
import { splitHouse } from "@/lib/houseNumber";
import { LeadTagPicker } from "@/components/sales/LeadTagPicker";
import { useSetLeadTags } from "@/hooks/useLeadTags";
import { useCreateProjectLocation, useLinkLeadObject, findMatchingLocation, useObjectsByPostcode, type ObjectPostcodeSuggestion } from "@/hooks/useProjectLocations";
import { useCompany, usePerson, useUpdateCompany, useUpdatePerson } from "@/hooks/useContacts";

const EMPTY_ADDR: AddressValue = { street: "", houseNumber: "", postalCode: "", city: "" };
const EMPTY_COMPANY = { kvk: "", btw_number: "", website: "", sector: "" };
const EMPTY_PERSON = { email: "", phone: "", role: "" };

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
  const createObject = useCreateProjectLocation();
  const linkLeadObject = useLinkLeadObject();
  const setLeadTags = useSetLeadTags();
  const updateCompany = useUpdateCompany();
  const updatePerson = useUpdatePerson();
  const fallbackStage = stages.find((s) => s.is_default)?.id ?? stages[0]?.id;

  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [addr, setAddr] = useState<AddressValue>({ ...EMPTY_ADDR });

  // Inline details (bewerkbaar in de dialog, weggeschreven bij "Lead toevoegen").
  const [companyForm, setCompanyForm] = useState({ ...EMPTY_COMPANY });
  const [companyAddr, setCompanyAddr] = useState<AddressValue>({ ...EMPTY_ADDR });
  const [companySameAddr, setCompanySameAddr] = useState(true);
  const [personForm, setPersonForm] = useState({ ...EMPTY_PERSON });
  const [personAddr, setPersonAddr] = useState<AddressValue>({ ...EMPTY_ADDR });
  const [personSameAddr, setPersonSameAddr] = useState(true);

  const [stageId, setStageId] = useState(defaultStageId ?? fallbackStage ?? "");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [match, setMatch] = useState<{ id: string; location_number: number; lead_id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  // Expliciet gekozen bestaand object uit de suggestielijst (blokkeert de auto-dedup zodat de keuze blijft staan).
  const [pickedObjectId, setPickedObjectId] = useState<string | null>(null);

  // Bron voor de prefill van de inline velden zodra een bedrijf/persoon is gekozen of aangemaakt.
  const { data: company } = useCompany(companyId || undefined);
  const { data: person } = usePerson(personId || undefined);

  // Bestaande objecten op de postcode → subtiele suggestielijst die versmalt op huisnummer + toevoeging.
  const { data: objSuggestions } = useObjectsByPostcode(organizationId, addr.postalCode);
  const objectMatches = useMemo(() => {
    const typed = splitHouse(addr.houseNumber);
    return (objSuggestions ?? []).filter((o) => {
      if (!typed.number) return true;
      const oh = splitHouse(o.house_number ?? "");
      if (!oh.number.startsWith(typed.number)) return false;
      if (typed.addition && oh.addition.toLowerCase() !== typed.addition.toLowerCase()) return false;
      return true;
    }).slice(0, 6);
  }, [objSuggestions, addr.houseNumber]);

  useEffect(() => {
    if (!open) return;
    setStageId((s) => defaultStageId || s || fallbackStage || "");
  }, [open, defaultStageId, fallbackStage]);

  // Prefill de bedrijfsvelden éénmalig per gekozen bedrijf (op id → blijft bewerkbaar bij refetch).
  useEffect(() => {
    if (!company) return;
    setCompanyForm({
      kvk: company.kvk ?? "",
      btw_number: company.btw_number ?? "",
      website: company.website ?? "",
      sector: company.sector ?? "",
    });
    const hasAddr = !!(company.address_street || company.house_number || company.postal_code || company.city);
    setCompanyAddr({
      street: company.address_street ?? "",
      houseNumber: company.house_number ?? "",
      postalCode: company.postal_code ?? "",
      city: company.city ?? "",
    });
    setCompanySameAddr(!hasAddr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  useEffect(() => {
    if (!person) return;
    setPersonForm({
      email: person.email ?? "",
      phone: person.phone ?? "",
      role: person.role ?? "",
    });
    const hasAddr = !!(person.address_street || person.house_number || person.postal_code || person.city);
    setPersonAddr({
      street: person.address_street ?? "",
      houseNumber: person.house_number ?? "",
      postalCode: person.postal_code ?? "",
      city: person.city ?? "",
    });
    setPersonSameAddr(!hasAddr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  // Live dedup-check: hoort dit adres al bij een bestaand object?
  useEffect(() => {
    if (pickedObjectId) return; // expliciete keuze uit de lijst niet overschrijven
    const street = addr.street.trim();
    const postal = addr.postalCode.trim();
    const city = addr.city.trim();
    if (!organizationId || (!street && !postal)) { setMatch(null); return; }
    const t = setTimeout(async () => {
      try {
        const m = await findMatchingLocation({
          org: organizationId, company: companyId || null, street, postal, city,
          house: addr.houseNumber.trim() || null,
        });
        setMatch(m ? { id: m.id, location_number: m.location_number, lead_id: m.lead_id ?? null } : null);
      } catch { setMatch(null); }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr.street, addr.houseNumber, addr.postalCode, addr.city, companyId, organizationId, pickedObjectId]);

  const resetCompany = () => { setCompanyForm({ ...EMPTY_COMPANY }); setCompanyAddr({ ...EMPTY_ADDR }); setCompanySameAddr(true); };
  const resetPerson = () => { setPersonForm({ ...EMPTY_PERSON }); setPersonAddr({ ...EMPTY_ADDR }); setPersonSameAddr(true); };

  const reset = () => {
    setCompanyId(""); setCompanyName(""); setPersonId(""); setPersonName("");
    setAddr({ ...EMPTY_ADDR }); setTagIds([]); setNotes(""); setMatch(null); setPickedObjectId(null);
    resetCompany(); resetPerson();
  };

  // Kies een bestaand object uit de suggestielijst: vul het adres en koppel/hergebruik dat object.
  const selectObject = (o: ObjectPostcodeSuggestion) => {
    setAddr({
      street: o.address_street ?? "",
      houseNumber: o.house_number ?? "",
      postalCode: o.postal_code ?? "",
      city: o.city ?? "",
    });
    setPickedObjectId(o.id);
    setMatch({ id: o.id, location_number: o.location_number, lead_id: o.lead_id });
  };

  const hasAddress = addr.street.trim() !== "" || addr.postalCode.trim() !== "";
  const canSubmit = (!!companyId || !!personId) && !!organizationId && !!stageId;

  // Adres dat op het bedrijf/persoon-record komt: gelijk aan uitvoeradres (snapshot) of een eigen adres.
  // Bij "gelijk" én lege uitvoeradres → het bestaande adres onaangeroerd laten (geen null-overschrijving).
  const entityAddrPatch = (same: boolean, custom: AddressValue) => {
    const src = same ? addr : custom;
    if (same && !hasAddress) return {};
    return {
      address_street: src.street.trim() || null,
      house_number: src.houseNumber.trim() || null,
      postal_code: src.postalCode.trim() || null,
      city: src.city.trim() || null,
    };
  };

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      // 1+2. Details op de bestaande bedrijf/persoon-records schrijven vóór de lead,
      // zodat bijv. een e-mail-uniek-conflict schoon afbreekt (geen half-aangemaakte lead).
      if (companyId) {
        await updateCompany.mutateAsync({
          id: companyId,
          patch: {
            kvk: companyForm.kvk.trim() || null,
            btw_number: companyForm.btw_number.trim() || null,
            website: companyForm.website.trim() || null,
            sector: companyForm.sector.trim() || null,
            ...entityAddrPatch(companySameAddr, companyAddr),
          },
        });
      }
      if (personId) {
        await updatePerson.mutateAsync({
          id: personId,
          patch: {
            email: personForm.email.trim() || null,
            phone: personForm.phone.trim() || null,
            role: personForm.role.trim() || null,
            ...entityAddrPatch(personSameAddr, personAddr),
          },
        });
      }

      // 3. Lead (offerte/systeem werken met de uitvoerlocatie in de cache).
      const lead = await createLead.mutateAsync({
        organization_id: organizationId!,
        stage_id: stageId,
        company_id: companyId || null,
        person_id: personId || null,
        // Particulier (geen bedrijf) → val terug op de persoonsnaam.
        company_name: companyName.trim() || personName.trim() || "Particulier",
        address_street: addr.street.trim() || null,
        house_number: addr.houseNumber.trim() || null,
        postal_code: addr.postalCode.trim() || null,
        city: addr.city.trim() || null,
        priority: "medium",
        notes: notes.trim() || null,
        source: "manual",
        position: 0,
      });

      // 4. Adres → object. Bestaat er al een object op dit adres (gekozen of gematcht), koppel
      // deze lead er dan aan (deel het object-dossier, N:M) — geen duplicaat. Anders maak een
      // nieuw object aan; de DB-trigger geeft 'm de canonieke naam + SharePoint-map + junctierij.
      if (hasAddress) {
        if (match) {
          await linkLeadObject.mutateAsync({ leadId: lead.id, objectId: match.id });
        } else {
          await createObject.mutateAsync({
            address_street: addr.street.trim() || null,
            postal_code: addr.postalCode.trim() || null,
            city: addr.city.trim() || null,
            house_number: addr.houseNumber.trim() || null,
            company_id: companyId || null,
            person_id: personId || null,
            lead_id: lead.id,
          });
        }
      }

      // 5. Tags.
      if (tagIds.length) await setLeadTags.mutateAsync({ leadId: lead.id, tagIds });

      toast.success("Lead toegevoegd");
      onOpenChange(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const dup = /duplicate|unique|23505/i.test(msg);
      toast.error(dup ? "Er bestaat al een contactpersoon met dit e-mailadres." : msg || "Toevoegen mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>Nieuwe lead</DialogTitle>
        </DialogHeader>

        <div className="ec-scroll flex-1 space-y-4 overflow-y-auto py-1 pr-1">
          {/* WAAR — het adres = de uitvoerlocatie (object). Eén keer invullen; de vinkjes hieronder verwijzen ernaar. */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold text-foreground">Uitvoerlocatie <span className="font-normal text-muted-foreground">(adres)</span></p>
            <AddressFields value={addr} onChange={(patch) => { setPickedObjectId(null); setAddr((a) => ({ ...a, ...patch })); }} />
            {objectMatches.length > 0 && (
              <div className="overflow-hidden rounded-md border border-border/60 bg-muted/30">
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">Bestaande objecten op deze postcode</p>
                <ul className="max-h-40 overflow-y-auto">
                  {objectMatches.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => selectObject(o)}
                        className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted ${pickedObjectId === o.id ? "bg-muted" : ""}`}
                      >
                        <span className="truncate">{o.display_name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">koppelen</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {match ? (
              <p className="text-[11px] text-emerald-600">Deze lead wordt gekoppeld aan bestaand object {match.location_number} — één dossier, gedeeld met eventuele andere leads op dit adres.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Vul postcode + huisnummer in; straat en plaats worden automatisch aangevuld. Het object wordt hiermee automatisch aangemaakt/gekoppeld. De offerte werkt met deze uitvoerlocatie.</p>
            )}
          </div>

          {/* BEDRIJF — picker + inline bedrijfsgegevens */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold text-foreground">Bedrijf <span className="font-normal text-muted-foreground">(optioneel)</span></p>
            <CompanyPicker
              value={companyId || null}
              valueLabel={companyName || null}
              onChange={(id, c) => {
                setCompanyId(id ?? ""); setCompanyName(c?.name ?? "");
                if (!id) resetCompany();
              }}
            />
            {companyId && (
              <div className="space-y-3 pt-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="KvK"><Input value={companyForm.kvk} onChange={(e) => setCompanyForm((f) => ({ ...f, kvk: e.target.value }))} /></Field>
                  <Field label="BTW-nummer"><Input value={companyForm.btw_number} onChange={(e) => setCompanyForm((f) => ({ ...f, btw_number: e.target.value }))} /></Field>
                  <Field label="Sector"><Input value={companyForm.sector} onChange={(e) => setCompanyForm((f) => ({ ...f, sector: e.target.value }))} /></Field>
                  <Field label="Website"><Input value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} /></Field>
                </div>
                <SameAsSite label="Adres is hetzelfde als uitvoeradres" checked={companySameAddr} onChange={setCompanySameAddr} />
                {!companySameAddr && (
                  <AddressFields value={companyAddr} onChange={(patch) => setCompanyAddr((a) => ({ ...a, ...patch }))} />
                )}
              </div>
            )}
          </div>

          {/* CONTACTPERSOON — picker + inline contactgegevens */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold text-foreground">Contactpersoon <span className="font-normal text-muted-foreground">(optioneel)</span></p>
            <PersonPicker
              value={personId || null}
              valueLabel={personName || null}
              companyId={companyId || null}
              onChange={(id, p) => {
                setPersonId(id ?? ""); setPersonName(p?.full_name ?? "");
                if (!id) resetPerson();
              }}
            />
            {personId && (
              <div className="space-y-3 pt-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="E-mail"><Input type="email" value={personForm.email} onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))} /></Field>
                  <Field label="Telefoon"><PhoneField value={personForm.phone} onChange={(v) => setPersonForm((f) => ({ ...f, phone: v ?? "" }))} /></Field>
                  <Field label="Functie" className="sm:col-span-2"><Input value={personForm.role} onChange={(e) => setPersonForm((f) => ({ ...f, role: e.target.value }))} /></Field>
                </div>
                <SameAsSite label="Adres is hetzelfde als uitvoeradres" checked={personSameAddr} onChange={setPersonSameAddr} />
                {!personSameAddr && (
                  <AddressFields value={personAddr} onChange={(patch) => setPersonAddr((a) => ({ ...a, ...patch }))} />
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Kies of maak een bedrijf en/of contactpersoon — minstens één. Geen bedrijf = particulier.</p>
          </div>

          {/* TAGS (intern) */}
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(intern)</span></p>
            <LeadTagPicker value={tagIds} onChange={setTagIds} organizationId={organizationId} />
          </div>

          {/* FASE + NOTITIES */}
          <div className="space-y-1.5">
            <Label className="text-xs">Fase *</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notities</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="mt-3 shrink-0 border-t pt-3">
          {!canSubmit && (
            <p className="mr-auto self-center text-xs text-muted-foreground">Kies een bedrijf en/of contactpersoon, en een fase.</p>
          )}
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Annuleren</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Bezig…" : "Lead toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SameAsSite({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}
