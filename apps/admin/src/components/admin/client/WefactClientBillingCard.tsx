import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, Plus, Receipt } from "lucide-react";
import { WefactDebtorPanel } from "@/components/contacts/WefactDebtorPanel";
import { WefactManualInvoiceDialog } from "@/components/contacts/WefactManualInvoiceDialog";
import { WefactInvoiceList } from "@/components/admin/financial/WefactInvoiceList";

interface ClientLike {
  id: string;
  company_id: string | null;
  person_id: string | null;
  activation_fee_total: number | null;
  managed: boolean | null;
}

// WeFact-facturatieblok op de klant: debiteurkoppeling, activatiefactuur (handmatig),
// losse factuur, en de lijst reeds in WeFact aangemaakte verkoopfacturen voor deze klant.
export function WefactClientBillingCard({ client }: { client: ClientLike }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const anchorTable: "companies" | "persons" | null =
    client.company_id ? "companies" : client.person_id ? "persons" : null;
  const anchorId = client.company_id ?? client.person_id ?? "";

  // Anker-breed: naast client_id ook facturen op het bedrijf/persoon-anker (dekt
  // installatie-only zonder client-account én extern in WeFact aangemaakte facturen).
  const invoices = useQuery({
    queryKey: ["wefact-invoices-client", client.id],
    queryFn: async () => {
      const orParts = [`client_id.eq.${client.id}`];
      if (client.company_id) orParts.push(`company_id.eq.${client.company_id}`);
      if (client.person_id) orParts.push(`person_id.eq.${client.person_id}`);
      const { data, error } = await supabase
        .from("wefact_invoices")
        .select("id, wefact_invoice_id, invoice_code, kind, status, amount_incl, amount_outstanding, invoice_date, pay_before, client_id, debtor_name, payment_url")
        .or(orParts.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Uitbetaal-IBAN (self-billing) — alleen relevant voor beheerklanten. Alleen-lezen;
  // de klant vult 'm zelf in via het portaal.
  const payout = useQuery({
    queryKey: ["wefact-payout-status", client.id],
    enabled: !!client.managed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payment_details")
        .select("payout_iban_last4")
        .eq("client_id", client.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wefact-invoices-client", client.id] });
  };

  const createActivation = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-create-invoice", {
        body: { kind: "activatie", clientId: client.id },
      });
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd.");
      if (data?.status !== "ok") throw new Error(data?.message ?? "Aanmaken mislukt");
      toast.success(`Activatiefactuur ${data.invoiceCode} aangemaakt`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  };

  const activationDone = (invoices.data ?? []).some((i) => i.kind === "activatie");
  const hasActivationFee = Number(client.activation_fee_total ?? 0) > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">WeFact-facturatie</h3>
          <div className="flex gap-2">
            {hasActivationFee && (
              <Button size="sm" variant="outline" onClick={createActivation} disabled={busy || activationDone}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}
                {activationDone ? "Activatie gefactureerd" : "Activatiefactuur maken"}
              </Button>
            )}
            <Button size="sm" onClick={() => setManualOpen(true)} disabled={busy}>
              <Plus className="mr-1.5 h-4 w-4" />Nieuwe factuur
            </Button>
          </div>
        </div>

        {anchorTable ? (
          <WefactDebtorPanel table={anchorTable} subjectId={anchorId} />
        ) : (
          <p className="text-xs text-muted-foreground">Deze klant heeft geen gekoppeld bedrijf of persoon; koppel eerst een contact om te kunnen factureren.</p>
        )}

        {client.managed && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            {payout.data?.payout_iban_last4 ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Uitbetaal-IBAN <span className="font-mono">•••• {payout.data.payout_iban_last4}</span> — gereed voor self-billing.</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 shrink-0 text-[hsl(var(--status-amber))]" />
                <span className="text-muted-foreground">Uitbetaal-IBAN ontbreekt — self-billing kan pas als de klant deze via het portaal invult.</span>
              </>
            )}
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Facturen in WeFact</p>
          {invoices.isLoading
            ? <p className="py-2 text-xs text-muted-foreground">Laden…</p>
            : <WefactInvoiceList rows={invoices.data ?? []} onChanged={refresh} />}
        </div>
      </CardContent>

      <WefactManualInvoiceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        subjectType="client"
        subjectId={client.id}
        onCreated={refresh}
      />
    </Card>
  );
}
