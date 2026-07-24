import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/services/calculations";
import { summarizeWefactInvoices } from "@/services/wefactBilling";

// Compacte "Facturatie in WeFact"-samenvatting op de klant-Overzichttab: gefactureerd /
// betaald / openstaand + laatste factuur. Volledige lijst + acties staan op de Financieel-tab.
export function WefactClientSummaryCard({ client }: { client: { id: string; company_id: string | null; person_id: string | null } }) {
  const q = useQuery({
    queryKey: ["wefact-invoices-client", client.id],
    queryFn: async () => {
      const orParts = [`client_id.eq.${client.id}`];
      if (client.company_id) orParts.push(`company_id.eq.${client.company_id}`);
      if (client.person_id) orParts.push(`person_id.eq.${client.person_id}`);
      const { data, error } = await supabase
        .from("wefact_invoices")
        .select("id, invoice_code, kind, status, amount_incl, amount_paid, amount_outstanding, invoice_date")
        .or(orParts.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const s = summarizeWefactInvoices(rows);
  const last = rows.find((r) => r.status !== "concept");

  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Facturatie in WeFact</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {q.isLoading ? (
          <p className="text-muted-foreground">Laden…</p>
        ) : s.count === 0 ? (
          <p className="text-muted-foreground">Nog geen facturen in WeFact.</p>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Gefactureerd</span><span className="tabular-nums">{formatEuro(s.invoicedIncl)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Betaald</span><span className="tabular-nums text-emerald-700">{formatEuro(s.paidIncl)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Openstaand</span><span className="tabular-nums">{formatEuro(s.outstandingIncl)}</span></div>
            {last && (
              <p className="border-t pt-2 text-[11px] text-muted-foreground">
                Laatste factuur: <span className="font-mono">{last.invoice_code}</span> · {last.invoice_date ? new Date(last.invoice_date).toLocaleDateString("nl-NL") : ""}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Volledige lijst + acties op de tab Financieel.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
