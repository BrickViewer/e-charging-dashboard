import { supabase } from "@/integrations/supabase/client";
import {
  renderSelfBillingInvoicePdfBase64,
  type SelfBillingSettlement,
  type SelfBillingClient,
  type SelfBillingOrg,
  type SelfBillingPaymentDetails,
} from "@/services/invoicePdf";

// Rendert de bevroren S-/B-PDF in de browser en stuurt 'm mét de afrekening naar
// wefact-push-settlement, dat er een inkoopfactuur (crediteurenregistratie) van maakt
// met onze PDF als bijlage. Eén renderer voor download én koppeling.
export async function pushSettlementToWefact(
  settlementId: string,
  settlement: SelfBillingSettlement,
  client: SelfBillingClient,
  org?: SelfBillingOrg | null,
  paymentDetails?: SelfBillingPaymentDetails | null,
): Promise<{ status: string; message?: string; creditInvoiceCode?: string }> {
  const { base64, filename } = await renderSelfBillingInvoicePdfBase64(settlement, client, org, paymentDetails);
  const { data, error } = await supabase.functions.invoke("wefact-push-settlement", {
    body: { settlementId, pdfBase64: base64, pdfFilename: filename },
  });
  if (error) throw new Error(error.message);
  if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd.");
  if (data?.status === "error" || data?.status === "wefact_error") {
    throw new Error(data?.message ?? "WeFact gaf een fout");
  }
  return data;
}
