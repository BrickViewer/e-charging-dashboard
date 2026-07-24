import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WefactInvoiceList } from "@/components/admin/financial/WefactInvoiceList";

// Beknopte WeFact-factuurgeschiedenis voor een bedrijf of persoon (contactdetail),
// op basis van het debiteur-anker (company_id / person_id).
export function WefactContactInvoices({ table, subjectId }: { table: "companies" | "persons"; subjectId: string }) {
  const column = table === "companies" ? "company_id" : "person_id";
  const q = useQuery({
    queryKey: ["wefact-invoices-contact", table, subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wefact_invoices")
        .select("id, wefact_invoice_id, invoice_code, kind, status, amount_incl, amount_outstanding, invoice_date, pay_before, client_id, debtor_name, payment_url")
        .eq(column, subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!q.isLoading && (q.data ?? []).length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Facturen in WeFact</p>
      {q.isLoading ? <p className="py-1 text-xs text-muted-foreground">Laden…</p> : <WefactInvoiceList rows={q.data ?? []} />}
    </div>
  );
}
