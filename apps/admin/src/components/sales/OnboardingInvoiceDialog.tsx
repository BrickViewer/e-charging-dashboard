import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Loader2, FileText, Send, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOnboarding, primaryOrder, useMarkInvoiced, type OnboardingClient } from "@/hooks/useOnboarding";
import { WefactDebtorPanel } from "@/components/contacts/WefactDebtorPanel";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Factuurscherm (onder 'Opgeleverd'): laat vooraf zien wat er op de installatiefactuur komt,
// maakt hem als CONCEPT in WeFact aan (nog niet verstuurd), laat de echte PDF bekijken en
// verstuurt hem pas op verzoek. invoiced_at (→ kaart schuift door) wordt pas bij het versturen
// gezet. Terugval: 'handmatig markeren' voor wie WeFact (nog) niet gebruikt.
export function OnboardingInvoiceDialog({ client, onClose }: { client: OnboardingClient | null; onClose: () => void }) {
  const order = client ? primaryOrder(client) : null;
  const markInvoiced = useMarkInvoiced();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Net aangemaakte concept-factuur (deze sessie); anders valt 'ie terug op de order (installatie)
  // of op de spiegelrij (activatie). Resetten bij een andere kaart, anders lekt het concept van
  // de vorige klant door in dit scherm.
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  useEffect(() => { setCreated(null); }, [client?.id]);

  const quoteId = order?.quote_id ?? null;
  const { data: quote, isLoading } = useQuery({
    queryKey: ["invoice-quote", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      if (!quoteId) return null;
      const { data, error } = await supabase.from("quotes")
        .select("quote_number, total_hardware_cost, total_installation_cost, person_id, company_id, with_management, num_charge_points, offer_details")
        .eq("id", quoteId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Twee modi in één scherm: een installatie-order factureren, of losse activatiekosten innen
  // (beheer-klant zonder installatie). De ladder stuurt hier beide gevallen naartoe.
  const mode: "installatie" | "activatie" = order && client?.needs_installation !== false ? "installatie" : "activatie";

  const activationOpen = Math.round(((Number(client?.activation_fee_total ?? 0)) - (Number(client?.activation_invoiced_total ?? 0))) * 100) / 100;

  // Bij de activatie-modus komt de uitsplitsing (aantal × prijs) uit de getekende offerte van deze
  // klant; alleen offertes vanaf tekstversie 3 hebben dat zo aangeboden.
  const { data: actQuote } = useQuery({
    queryKey: ["invoice-activation-quote", client?.id],
    enabled: !!client && mode === "activatie",
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("quote_number, num_charge_points, offer_details, person_id, company_id")
        .eq("client_id", client!.id).eq("status", "getekend")
        .order("signed_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // In activatie-modus is er GEEN order om het concept aan op te hangen (order.wefact_invoice_id
  // blijft leeg). De spiegeltabel is daar het anker: zo blijft een eerder aangemaakt concept
  // terugvindbaar na sluiten/heropenen, óók als het via het Financieel-tabblad is gemaakt.
  // Zelfde poort als de guard in supabase/functions/wefact-create-invoice (kind 'activatie').
  const { data: actInvoice } = useQuery({
    queryKey: ["invoice-activation-mirror", client?.id],
    enabled: !!client && mode === "activatie",
    queryFn: async () => {
      const { data, error } = await supabase.from("wefact_invoices")
        .select("wefact_invoice_id, invoice_code, status_code, sent")
        .eq("activation_client_id", client!.id)
        .not("activation_amount_excl", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).find((w) => ![8, 9].includes(Number(w.status_code ?? 0))) ?? null;
    },
  });
  const refreshActivation = () => qc.invalidateQueries({ queryKey: ["invoice-activation-mirror"] });

  const actOd = (actQuote?.offer_details ?? {}) as Record<string, unknown>;
  const actPerUnit = Math.round(Number(actOd.activatiekostenPerSocket ?? 0) * 100) / 100;
  const actQty = Number(actQuote?.num_charge_points ?? 0);
  const actTextVersion = Number(actOd.text_version ?? 0);
  // Alleen uitsplitsen als de offerte dat óók zo beloofde én het exact optelt.
  const actSplit = actTextVersion >= 3 && actPerUnit > 0 && actQty > 0
    && Math.round(actPerUnit * actQty * 100) / 100 === activationOpen;

  // Activatieregel op de installatiefactuur: zelfde poort als de edge (`=== true`, want
  // offer_details draagt op élke offerte een geseede prijs — ook waar niets is aangeboden).
  const instOd = (quote?.offer_details ?? {}) as Record<string, unknown>;
  const instPerUnit = Math.round(Number(instOd.activatiekostenPerSocket ?? 0) * 100) / 100;
  const instQty = Number(quote?.num_charge_points ?? 0);
  const instActivation = quote?.with_management === true && instPerUnit > 0 && instQty > 0
    ? Math.round(instPerUnit * instQty * 100) / 100 : 0;

  const installBase = (Number(quote?.total_hardware_cost) || 0) + (Number(quote?.total_installation_cost) || 0);
  const exBtw = mode === "installatie" ? installBase + instActivation : activationOpen;
  const btw = exBtw * 0.21;
  const incl = exBtw + btw;

  // Debiteur-anker voor de WeFact-koppeling (spiegelt resolveInstallationAnchor in de edge):
  // echte klant → clients.company_id ?? person_id; order-only → quote.person_id ?? quote.company_id.
  const isOrderOnly = client?.is_order_only === true;
  const { data: anchor } = useQuery({
    queryKey: ["invoice-debtor-anchor", client?.id, isOrderOnly, quote?.person_id, quote?.company_id],
    enabled: !!client,
    queryFn: async (): Promise<{ table: "companies" | "persons"; id: string; coupled: boolean } | null> => {
      let resolved: { table: "companies" | "persons"; id: string } | null = null;
      if (client && !isOrderOnly) {
        const { data: c } = await supabase.from("clients").select("company_id, person_id").eq("id", client.id).maybeSingle();
        if (c?.company_id) resolved = { table: "companies", id: c.company_id };
        else if (c?.person_id) resolved = { table: "persons", id: c.person_id };
      }
      if (!resolved && quote?.person_id) resolved = { table: "persons", id: String(quote.person_id) };
      if (!resolved && quote?.company_id) resolved = { table: "companies", id: String(quote.company_id) };
      if (!resolved) return null;
      const { data: a } = await supabase.from(resolved.table).select("wefact_debtor_code").eq("id", resolved.id).maybeSingle();
      return { ...resolved, coupled: !!a?.wefact_debtor_code };
    },
  });

  const siteAddr = [order?.site_street, order?.site_house_number].filter(Boolean).join(" ");
  const sitePlace = [order?.site_postal, order?.site_city].filter(Boolean).join(" ");
  const siteFull = [siteAddr, sitePlace].filter(Boolean).join(", ");
  // HOUD IN SYNC met supabase/functions/wefact-create-invoice/index.ts (de factuurregel).
  const lineLabel = `Levering en installatie laadpalen${siteFull ? ` — ${siteFull}` : ""}`;

  const wefactInvoiceId = created?.id
    ?? (mode === "installatie" ? order?.wefact_invoice_id : actInvoice?.wefact_invoice_id) ?? null;

  // Bij openen één keer de ECHTE stand uit WeFact halen. De spiegel `wefact_invoices` werkt
  // alleen bij via onze eigen acties of de uurcron, dus een factuur die je IN WeFact verstuurt
  // stond hier tot de volgende cron-run nog als concept (Albert Vos, 24-07-2026: kaart bleef in
  // 'Factureren' terwijl de factuur al verstuurd was). Bewust deze lichte per-factuur-refresh en
  // niet de volledige wefact-status-sync: die haalt álles op, en WeFact blokkeert bij
  // 200/min of 3.600/uur met een 403-firewallblock.
  useQuery({
    queryKey: ["invoice-wefact-refresh", wefactInvoiceId],
    enabled: !!client && !!wefactInvoiceId,
    // Eén call per geopende factuur, niet per render of bij terugkeren naar het tabblad.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action: "refresh", wefactInvoiceId },
      });
      // Stil falen: een verouderde stand mag het factuurscherm niet blokkeren.
      if (error || data?.status !== "ok") return null;
      qc.invalidateQueries({ queryKey: ["invoice-activation-mirror"] });
      invalidateOnboarding(qc);
      return data;
    },
  });
  const invoiceCode = created?.code
    ?? (mode === "installatie" ? order?.wefact_invoice_code : actInvoice?.invoice_code) ?? null;
  const hasInvoice = !!wefactInvoiceId;
  // Installatie: invoiced_at op de order (wordt pas bij het versturen gezet). Activatie: er is
  // geen order — de spiegelrij zegt of WeFact 'm verstuurd heeft, en dat is exact wat
  // app_private.recalc_activation_invoiced() als 'gefactureerd' meetelt (sent > 0).
  const sent = mode === "installatie" ? !!order?.invoiced_at : Number(actInvoice?.sent ?? 0) > 0;

  const createConcept = async () => {
    if (mode === "installatie" ? !order : !client) return;
    setCreating(true);
    try {
      const body = mode === "installatie"
        ? { kind: "installatie", orderId: order!.id, sendByEmail: false }
        : { kind: "activatie", clientId: client!.id, sendByEmail: false, ...(actSplit ? { quantity: actQty, unitPriceExcl: actPerUnit } : {}) };
      const { data, error } = await supabase.functions.invoke("wefact-create-invoice", { body });
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd (API-key/instellingen).");
      // 'already' geeft alleen de factuurcode terug; de spiegel-query hierboven haalt de
      // bijbehorende factuur op zodat je 'm alsnog kunt bekijken/versturen i.p.v. enkel een toast.
      if (data?.status === "already") { toast.info(data.message); refreshActivation(); invalidateOnboarding(qc); return; }
      if (data?.status !== "ok") throw new Error(data?.message ?? "WeFact gaf een fout");
      setCreated({ id: data.invoiceId, code: data.invoiceCode });
      toast.success(`Concept ${data.invoiceCode} aangemaakt — bekijk de PDF en verstuur`);
      // De kaart blijft in 'Opgeleverd' (invoiced_at nog leeg); enkel de order-ref bijwerken.
      refreshActivation();
      invalidateOnboarding(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setCreating(false);
    }
  };

  const viewPdf = async () => {
    if (!wefactInvoiceId) return;
    setPdfBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action: "pdf", wefactInvoiceId },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok" || !data.base64) throw new Error(data?.message ?? "PDF kon niet worden opgehaald");
      openPdf(data.base64, data.filename ?? "factuur.pdf");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF openen mislukt");
    } finally {
      setPdfBusy(false);
    }
  };

  const sendInvoice = async () => {
    if (!wefactInvoiceId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action: "send", wefactInvoiceId },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok") throw new Error(data?.message ?? "Versturen mislukt");
      // Nu pas als gefactureerd markeren → de kaart schuift uit de factuurstap. Bij een losse
      // activatiefactuur is er geen order: daar doet de DB-trigger het werk (hij herberekent
      // clients.activation_invoiced_total zodra de spiegelrij op 'verstuurd' staat).
      if (order) await markInvoiced.mutateAsync(order.id);
      toast.success("Factuur verstuurd naar de klant");
      refreshActivation();
      invalidateOnboarding(qc);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  };

  const markManually = async () => {
    if (!order) return;
    try {
      await markInvoiced.mutateAsync(order.id);
      toast.success("Gemarkeerd als gefactureerd");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Markeren mislukt"); }
  };

  const deleteConcept = async () => {
    if (!wefactInvoiceId) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action: "delete", wefactInvoiceId },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok") throw new Error(data?.message ?? "Verwijderen mislukt");
      toast.success("Concept verwijderd");
      // De order is weer factureerbaar; kaart blijft in Opgeleverd.
      setCreated(null);
      refreshActivation();
      invalidateOnboarding(qc);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    } finally {
      setDeleting(false);
    }
  };

  const busy = creating || sending || pdfBusy || deleting;

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Factureren</DialogTitle>
          <DialogDescription>
            Controleer wat er op de factuur komt, bekijk de PDF en verstuur hem daarna in WeFact.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Klant</p>
              <p className="font-medium">{client?.company_name}</p>
              {(client?.contact_name || client?.contact_email) && (
                <p className="text-muted-foreground">{[client?.contact_name, client?.contact_email].filter(Boolean).join(" · ")}</p>
              )}
            </div>

            {/* WeFact-koppeling: status + aanmaken/koppelen (voorkomt dubbele debiteuren bij bestaande klanten) */}
            {anchor && (
              <div className="space-y-1.5">
                <WefactDebtorPanel
                  table={anchor.table}
                  subjectId={anchor.id}
                  onChanged={() => qc.invalidateQueries({ queryKey: ["invoice-debtor-anchor"] })}
                />
                {!anchor.coupled && (
                  <p className="text-[11px] text-amber-700">
                    Nog niet gekoppeld — bij <span className="font-medium">Concept aanmaken</span> wordt automatisch een nieuwe WeFact-debiteur gemaakt. Staat de klant al in WeFact? Koppel 'm dan hierboven aan de bestaande debiteur.
                  </p>
                )}
              </div>
            )}

            {/* Zo komt het op de factuur (transparantie vóór verzenden) */}
            <div className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Zo komt het op de factuur
              </div>
              <div className="space-y-1.5 px-3 py-2">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Onderwerp</span>
                  <span className="text-right">{mode === "installatie" ? "Levering en installatie laadinfrastructuur" : "Activatiekosten"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Referentie</span>
                  <span className="tabular-nums">{(mode === "installatie" ? quote?.quote_number : actQuote?.quote_number) ?? "—"}</span>
                </div>
              </div>
              <div className="divide-y border-t">
                {mode === "installatie" && (
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <span>{lineLabel}</span>
                    <span className="tabular-nums whitespace-nowrap">{euro(installBase)}</span>
                  </div>
                )}
                {/* Activatie als EIGEN regel — aantal × prijs per laadpunt, precies zoals geoffreerd. */}
                {mode === "installatie" && instActivation > 0 && (
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <span>Activatiekosten laadpunten <span className="text-muted-foreground">({instQty} × {euro(instPerUnit)})</span></span>
                    <span className="tabular-nums whitespace-nowrap">{euro(instActivation)}</span>
                  </div>
                )}
                {mode === "activatie" && (
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <span>
                      {actSplit ? "Activatiekosten laadpunten" : "Activatie- en onboardingkosten beheer"}
                      {actSplit && <span className="text-muted-foreground"> ({actQty} × {euro(actPerUnit)})</span>}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">{euro(activationOpen)}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground">
                  <span>Btw 21%</span><span className="tabular-nums">{euro(btw)}</span>
                </div>
                <div className="flex justify-between px-3 py-2 font-semibold">
                  <span>Totaal (incl. btw)</span><span className="tabular-nums">{euro(incl)}</span>
                </div>
              </div>
            </div>

            {/* Status van het concept + PDF-preview */}
            {hasInvoice && (
              <div className="space-y-2">
                {sent ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verstuurd{order?.invoiced_at ? ` op ${new Date(order.invoiced_at).toLocaleDateString("nl-NL")}` : ""}{invoiceCode ? ` (${invoiceCode})` : ""}.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Concept {invoiceCode ? <span className="font-mono">{invoiceCode}</span> : ""} aangemaakt — nog niet verstuurd. Bekijk de PDF en verstuur hem hieronder.
                  </p>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={viewPdf} disabled={busy}>
                  {pdfBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
                  Factuur bekijken (PDF)
                </Button>
                {!sent && (
                  <Button variant="ghost" size="sm" className="w-full text-red-600 hover:text-red-700" onClick={deleteConcept} disabled={busy}>
                    {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                    Concept verwijderen
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:space-x-0">
          {!hasInvoice ? (
            <>
              {/* Alleen bij een installatie-order: activation_invoiced_total is een trigger-cache
                  (recalc_activation_invoiced) die nooit met de hand geschreven mag worden — losse
                  activatiekosten tellen dus pas als de WeFact-factuur écht verstuurd is. */}
              {mode === "installatie" && (
                <Button variant="ghost" size="sm" className="sm:mr-auto" onClick={markManually} disabled={busy || markInvoiced.isPending || !order}>
                  Handmatig markeren
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Sluiten</Button>
              <Button onClick={createConcept} disabled={busy || (mode === "installatie" ? !order : activationOpen <= 0)}>
                {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}
                Concept aanmaken
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Sluiten</Button>
              {!sent && (
                <Button onClick={sendInvoice} disabled={busy}>
                  {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Versturen naar klant
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// base64 → blob → nieuw tabblad (val terug op download bij pop-upblokkade).
function openPdf(base64: string, filename: string) {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const win = window.open(url, "_blank");
    if (!win) { const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error("PDF kon niet worden geopend");
  }
}
