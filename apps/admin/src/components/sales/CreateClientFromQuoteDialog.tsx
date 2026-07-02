import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ScopeSelector } from "@/components/sales/ScopeSelector";
import { useCompany, usePerson } from "@/hooks/useContacts";
import { useCreateClientFromQuote } from "@/hooks/useQuotes";
import { useAllClients } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";
import { Search, CheckCircle } from "lucide-react";
import type { ClientWithRelations } from "@/types/db";

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
  with_installation: boolean | null;
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
  const [needsInstall, setNeedsInstall] = useState(true);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [customerType, setCustomerType] = useState<"bedrijf" | "particulier">("bedrijf");
  const isParticulier = customerType === "particulier";
  const [targetClientId, setTargetClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const { data: allClients } = useAllClients();

  // Reset de keuze zodra de dialog voor een (andere) offerte opent. Klanttype defaultt op de aard van
  // de offerte: geen bedrijf gekoppeld → particulier (te overrulen via de toggle).
  useEffect(() => {
    if (open) {
      setMode("new"); setTargetClientId(""); setClientSearch("");
      setCustomerType(quote?.company_id ? "bedrijf" : "particulier");
    }
  }, [open, quote?.id, quote?.company_id]);

  const term = clientSearch.trim().toLowerCase();
  const clientOptions = ((allClients ?? []) as ClientWithRelations[])
    .filter((c) => c.status !== "verwijderd" && !c.erased_at)
    .filter((c) =>
      !term ||
      [c.company_name, c.contact_email, c.kvk, c.client_number ? `#${c.client_number}` : "", String(c.client_number ?? "")]
        .some((v) => v?.toLowerCase().includes(term)),
    );

  useEffect(() => {
    if (!open || !quote) return;
    const snap = (quote.calculation_snapshot ?? {}) as { pricing_input?: { contract?: Record<string, unknown> } };
    const contract = snap.pricing_input?.contract ?? {};
    const od = (quote.offer_details ?? {}) as { addressStreet?: string; addressPostalCode?: string; addressCity?: string };
    setF({
      // Particulier (geen bedrijf): val terug op de contactpersoon zodat "Bedrijfsnaam" gevuld is.
      company_name: quote.prospect_company ?? company.data?.name ?? quote.prospect_contact ?? person.data?.full_name ?? "",
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
    setNeedsInstall(quote.with_installation !== false);
  }, [open, quote?.id, company.data, person.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (k: string) => f[k] ?? "";
  const set = (k: string) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const submit = async () => {
    if (!quote) return;
    try {
      if (mode === "existing") {
        if (!targetClientId) { toast.error("Kies een bestaand klantaccount"); return; }
        const { clientId } = await create.mutateAsync({ quoteId: quote.id, client: {}, targetClientId });
        toast.success("Offerte gekoppeld aan bestaand klantaccount");
        onCreated?.(clientId);
        onClose();
        return;
      }
      if (!t("company_name").trim()) { toast.error(isParticulier ? "Naam is verplicht" : "Bedrijfsnaam is verplicht"); return; }
      const { clientId } = await create.mutateAsync({
        quoteId: quote.id,
        client: {
          company_name: t("company_name").trim(),
          kvk: isParticulier ? null : (t("kvk").trim() || null),
          btw_number: isParticulier ? null : (t("btw_number").trim() || null),
          // Particulier → 0% btw / betaalspecificatie; de RPC koppelt dan géén bedrijf.
          vat_status: isParticulier ? "private" : null,
          contact_name: t("contact_name").trim() || null,
          contact_email: t("contact_email").trim() || null,
          contact_phone: t("contact_phone").trim() || null,
          billing_address_street: t("billing_address_street").trim() || null,
          billing_address_postal: t("billing_address_postal").trim() || null,
          billing_address_city: t("billing_address_city").trim() || null,
          contract_duration_months: numOr(t("contract_duration_months")),
          notice_period_months: numOr(t("notice_period_months")),
          managed,
          needs_installation: needsInstall,
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
          {/* Keuze: nieuw account of koppelen aan een bestaand account */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
            <button type="button" onClick={() => setMode("new")}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "new" ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]")}>
              Nieuw account
            </button>
            <button type="button" onClick={() => setMode("existing")}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "existing" ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]")}>
              Bestaand account
            </button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Koppel deze getekende offerte (incl. locatie) aan een bestaand klantaccount. De
                accountgegevens van dat account blijven ongewijzigd.
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Zoek op naam, klantnummer of KvK…" className="pl-9" />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border bg-background/50 p-1">
                {clientOptions.map((c) => {
                  const sel = targetClientId === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => setTargetClientId(c.id)}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        sel ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "hover:bg-foreground/[0.06]")}>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2">
                          {c.client_number && <span className="text-xs font-semibold tabular-nums text-primary">#{c.client_number}</span>}
                          <span className="truncate font-medium">{c.company_name}</span>
                        </span>
                        {c.contact_email && <span className="block truncate text-xs text-muted-foreground">{c.contact_email}</span>}
                      </span>
                      {sel && <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />}
                    </button>
                  );
                })}
                {clientOptions.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Geen klantaccounts gevonden.</div>
                )}
              </div>
            </div>
          ) : (
          <>
          {/* Klanttype: bedrijf of particulier (zelfde keuze als de handmatige klant-wizard) */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
            <button type="button" onClick={() => setCustomerType("bedrijf")}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors",
                !isParticulier ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]")}>
              Bedrijf
            </button>
            <button type="button" onClick={() => setCustomerType("particulier")}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isParticulier ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-foreground/[0.05]")}>
              Particulier
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{isParticulier ? "Particulier" : "Bedrijf"}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Field label={isParticulier ? "Naam *" : "Bedrijfsnaam *"}><Input value={t("company_name")} onChange={(e) => set("company_name")(e.target.value)} /></Field></div>
              {!isParticulier && <Field label="KvK"><Input value={t("kvk")} onChange={(e) => set("kvk")(e.target.value)} /></Field>}
              {!isParticulier && <Field label="BTW-nummer"><Input value={t("btw_number")} onChange={(e) => set("btw_number")(e.target.value)} /></Field>}
            </div>
            {isParticulier && <p className="mt-1.5 text-[11px] text-muted-foreground">Particulier (geen bedrijf) — 0% btw, ontvangt een betaalspecificatie.</p>}
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

          <ScopeSelector
            withInstallation={needsInstall}
            withManagement={managed}
            onChange={({ withInstallation: wi, withManagement: wm }) => { setNeedsInstall(wi); setManaged(wm); }}
          />
          </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Annuleren</Button>
          <Button onClick={submit} disabled={create.isPending || (mode === "new" ? !t("company_name").trim() : !targetClientId)}>
            {create.isPending ? "Bezig…" : mode === "existing" ? "Koppel aan account" : "Klant account aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
