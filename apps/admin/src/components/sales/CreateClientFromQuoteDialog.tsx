import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCompany, usePerson } from "@/hooks/useContacts";
import { useCreateClientFromQuote } from "@/hooks/useQuotes";

// Wat de dialog nodig heeft van de offerte; zowel AwaitingClientQuote als de volledige Quote voldoen.
export type QuoteForClient = {
  id: string;
  quote_number: string | null;
  prospect_company: string | null;
  prospect_contact: string | null;
  prospect_email: string | null;
  company_id: string | null;
  person_id: string | null;
  with_management: boolean | null;
  charge_rate_per_kwh: number | null;
  energy_cost_per_kwh: number | null;
  calculation_snapshot: unknown;
  offer_details: unknown;
};

const numOr = (v: string): number | null => { const n = Number(String(v).replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) ? n : null; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

// Review-stap: controleer/bewerk de klantgegevens en maak pas dán het klantaccount aan.
export function CreateClientFromQuoteDialog({ quote, open, onClose, onCreated }: {
  quote: QuoteForClient | null;
  open: boolean;
  onClose: () => void;
  onCreated?: (clientId: string) => void;
}) {
  const create = useCreateClientFromQuote();
  const company = useCompany(open ? quote?.company_id ?? undefined : undefined);
  const person = usePerson(open ? quote?.person_id ?? undefined : undefined);

  const [f, setF] = useState<Record<string, string>>({});
  const [managed, setManaged] = useState(true);

  useEffect(() => {
    if (!open || !quote) return;
    const snap = (quote.calculation_snapshot ?? {}) as { pricing_input?: { contract?: Record<string, unknown> } };
    const contract = snap.pricing_input?.contract ?? {};
    const od = (quote.offer_details ?? {}) as { addressStreet?: string; addressPostalCode?: string; addressCity?: string };
    setF({
      company_name: quote.prospect_company ?? company.data?.name ?? "",
      kvk: company.data?.kvk ?? "",
      btw_number: company.data?.btw_number ?? "",
      contact_name: quote.prospect_contact ?? person.data?.full_name ?? "",
      contact_email: quote.prospect_email ?? person.data?.email ?? "",
      contact_phone: person.data?.phone ?? "",
      billing_address_street: company.data?.address_street ?? od.addressStreet ?? "",
      billing_address_postal: company.data?.postal_code ?? od.addressPostalCode ?? "",
      billing_address_city: company.data?.city ?? od.addressCity ?? "",
      contract_duration_months: contract.durationMonths != null ? String(contract.durationMonths) : "",
      notice_period_months: contract.noticePeriodMonths != null ? String(contract.noticePeriodMonths) : "",
    });
    setManaged(quote.with_management !== false);
  }, [open, quote?.id, company.data, person.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (k: string) => f[k] ?? "";
  const set = (k: string) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const submit = async () => {
    if (!quote) return;
    if (!t("company_name").trim()) { toast.error("Bedrijfsnaam is verplicht"); return; }
    try {
      const { clientId } = await create.mutateAsync({
        quoteId: quote.id,
        client: {
          company_name: t("company_name").trim(),
          kvk: t("kvk").trim() || null,
          btw_number: t("btw_number").trim() || null,
          contact_name: t("contact_name").trim() || null,
          contact_email: t("contact_email").trim() || null,
          contact_phone: t("contact_phone").trim() || null,
          billing_address_street: t("billing_address_street").trim() || null,
          billing_address_postal: t("billing_address_postal").trim() || null,
          billing_address_city: t("billing_address_city").trim() || null,
          contract_duration_months: numOr(t("contract_duration_months")),
          notice_period_months: numOr(t("notice_period_months")),
          managed,
        },
      });
      toast.success("Klantaccount aangemaakt");
      onCreated?.(clientId);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Aanmaken mislukt"); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="ec-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Klant account aanmaken{quote?.quote_number ? ` · ${quote.quote_number}` : ""}</DialogTitle>
          <DialogDescription>
            Controleer en vul de klantgegevens aan. Deze worden gebruikt voor het klantaccount én
            doorgestuurd naar de installateur. Pas hierna wordt het account aangemaakt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bedrijf</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Field label="Bedrijfsnaam *"><Input value={t("company_name")} onChange={(e) => set("company_name")(e.target.value)} /></Field></div>
              <Field label="KvK"><Input value={t("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>
              <Field label="BTW-nummer"><Input value={t("btw_number")} onChange={(e) => set("btw_number")(e.target.value)} /></Field>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Contactpersoon</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Field label="Naam"><Input value={t("contact_name")} onChange={(e) => set("contact_name")(e.target.value)} /></Field></div>
              <Field label="E-mail"><Input type="email" value={t("contact_email")} onChange={(e) => set("contact_email")(e.target.value)} /></Field>
              <Field label="Telefoon"><Input value={t("contact_phone")} onChange={(e) => set("contact_phone")(e.target.value)} /></Field>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Factuuradres</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Field label="Straat + nr"><Input value={t("billing_address_street")} onChange={(e) => set("billing_address_street")(e.target.value)} /></Field></div>
              <Field label="Postcode"><Input value={t("billing_address_postal")} onChange={(e) => set("billing_address_postal")(e.target.value)} /></Field>
              <Field label="Plaats"><Input value={t("billing_address_city")} onChange={(e) => set("billing_address_city")(e.target.value)} /></Field>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Contract</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Looptijd (mnd)"><Input inputMode="numeric" value={t("contract_duration_months")} onChange={(e) => set("contract_duration_months")(e.target.value)} /></Field>
              <Field label="Opzegtermijn (mnd)"><Input inputMode="numeric" value={t("notice_period_months")} onChange={(e) => set("notice_period_months")(e.target.value)} /></Field>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Tarieven (laad-/start-/blokkeertarief en onze service-fee) stel je per locatie in, niet op het klantaccount.</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Met beheer</p>
              <p className="text-[11px] text-muted-foreground">Dashboard + maandelijkse afrekening. Uit = alleen levering &amp; installatie.</p>
            </div>
            <Switch checked={managed} onCheckedChange={setManaged} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Annuleren</Button>
          <Button onClick={submit} disabled={create.isPending || !t("company_name").trim()}>{create.isPending ? "Aanmaken…" : "Klant account aanmaken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
