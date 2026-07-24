// Zet een goedgekeurde self-billing-afrekening als INKOOPfactuur (creditinvoice) in
// WeFact. Dit is een administratieve registratie voor crediteurenbeheer — WeFact maakt
// geen tweede factuur: ons S-/B-document blijft de enige echte factuur en gaat als
// bijlage mee (pdfBase64). Gedeeld door wefact-push-settlement (met PDF) en de
// wefact-settlement-sync cron (data-only vangnet).
import type { WefactClient } from "./wefact.ts";
import { normalizePurchaseStatus } from "./wefact.ts";

// deno-lint-ignore no-explicit-any
type SB = any;

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

export interface PushResult {
  status: "ok" | "already" | "skipped";
  message?: string;
  creditInvoiceId?: string;
  creditInvoiceCode?: string;
  creditorCode?: string;
  pdfAttached?: boolean;
}

const FINAL_STATUSES = ["approved", "paid", "invoice_sent", "invoice_paid", "charged_back"];

export async function pushSettlement(
  sb: SB,
  wf: WefactClient,
  settlementId: string,
  opts: { pdfBase64?: string | null; pdfFilename?: string | null; purchaseTaxCode?: string | null } = {},
): Promise<PushResult> {
  const { data: s, error } = await sb.from("settlements").select("*").eq("id", settlementId).maybeSingle();
  if (error) throw error;
  if (!s) throw new Error("Afrekening niet gevonden");

  if (s.wefact_creditinvoice_id) {
    // Al gepusht -> alleen (opnieuw) de PDF hangen als die nu wel meekomt.
    if (opts.pdfBase64) {
      await wf.attachmentAdd({
        Type: "creditinvoice",
        CreditInvoiceCode: s.wefact_creditinvoice_code,
        Filename: opts.pdfFilename ?? "afrekening.pdf",
        Base64: opts.pdfBase64,
      });
      await sb.from("settlements").update({ wefact_sync_error: null, wefact_synced_at: new Date().toISOString() }).eq("id", settlementId);
      return { status: "already", message: "PDF bijgewerkt", creditInvoiceId: s.wefact_creditinvoice_id, creditInvoiceCode: s.wefact_creditinvoice_code, pdfAttached: true };
    }
    return { status: "already", message: "Al in WeFact", creditInvoiceId: s.wefact_creditinvoice_id, creditInvoiceCode: s.wefact_creditinvoice_code };
  }

  if (!FINAL_STATUSES.includes(s.status) || !s.invoice_number) {
    return { status: "skipped", message: "Afrekening is nog niet goedgekeurd (geen definitief nummer)" };
  }
  const payout = Number(s.client_payout ?? 0);
  if (payout <= 0) {
    return { status: "skipped", message: "Geen positieve uitbetaling om als inkoopfactuur te registreren" };
  }

  // ── Crediteur (de klant die wij betalen) borgen ────────────────────────────
  const { data: client } = await sb
    .from("clients")
    .select("id, company_name, kvk, btw_number, contact_email, country, wefact_creditor_code, wefact_creditor_id, company_id, person_id")
    .eq("id", s.client_id).maybeSingle();
  if (!client) throw new Error("Klant van de afrekening niet gevonden");

  const { data: pay } = await sb
    .from("client_payment_details")
    .select("payout_iban, payout_bic, payout_account_holder_name, invoice_email")
    .eq("client_id", s.client_id).maybeSingle();

  let creditorCode = client.wefact_creditor_code as string | null;
  if (!creditorCode) {
    const creditorParams = clean({
      CompanyName: client.company_name,
      CompanyNumber: client.kvk,
      TaxNumber: client.btw_number,
      Country: "NL",
      EmailAddress: pay?.invoice_email ?? client.contact_email,
      AccountNumber: pay?.payout_iban,
      AccountName: pay?.payout_account_holder_name,
      AccountBIC: pay?.payout_bic,
    });
    const res = await wf.creditorAdd(creditorParams);
    const creditor = res.creditor ?? {};
    creditorCode = String(creditor.CreditorCode ?? "");
    if (!creditorCode) throw new Error("WeFact gaf geen CreditorCode terug");
    await sb.from("clients")
      .update({ wefact_creditor_code: creditorCode, wefact_creditor_id: String(creditor.Identifier ?? "") })
      .eq("id", s.client_id).is("wefact_creditor_code", null);
  }

  // ── Inkoopfactuur aanmaken ──────────────────────────────────────────────────
  const vatRate = Number(s.vat_rate ?? 0);
  const kwh = Number(s.total_kwh ?? 0);
  const periodLabel = `${MONTHS[(Number(s.month) || 1) - 1]} ${s.year}`;
  const vatLiable = vatRate > 0;
  const description = vatLiable
    ? `Levering elektriciteit ${periodLabel} — ${kwh.toFixed(3)} kWh`
    : `Afname elektriciteit ${periodLabel} — ${kwh.toFixed(3)} kWh`;

  // deno-lint-ignore no-explicit-any
  const line: Record<string, any> = { Description: description, PriceExcl: round2(payout), Number: 1 };
  if (vatLiable && opts.purchaseTaxCode) line.TaxCode = opts.purchaseTaxCode;

  const amountIncl = round2(payout * (1 + vatRate));
  const res = await wf.creditInvoiceAdd(clean({
    InvoiceCode: s.invoice_number,          // ons S-/B-documentnummer = leveranciersfactuurnummer
    CreditorCode: creditorCode,
    Date: s.period_end ?? undefined,
    AmountIncl: amountIncl,                  // BTW-afrondingscorrectie: sluit cent-exact aan op ons document
    Comment: `Self-billing afrekening ${periodLabel}`,
    InvoiceLines: [line],
  }));
  const ci = res.creditinvoice ?? {};
  const creditInvoiceId = String(ci.Identifier ?? "");
  const creditInvoiceCode = String(ci.CreditInvoiceCode ?? "");
  if (!creditInvoiceId) throw new Error("WeFact gaf geen inkoopfactuur terug");

  // ── Onze compliant PDF als bijlage (indien meegegeven) ─────────────────────
  let pdfAttached = false;
  if (opts.pdfBase64) {
    await wf.attachmentAdd({
      Type: "creditinvoice",
      CreditInvoiceCode: creditInvoiceCode,
      Filename: opts.pdfFilename ?? `afrekening-${s.invoice_number}.pdf`,
      Base64: opts.pdfBase64,
    });
    pdfAttached = true;
  }

  await sb.from("settlements").update({
    wefact_creditinvoice_id: creditInvoiceId,
    wefact_creditinvoice_code: creditInvoiceCode,
    wefact_synced_at: new Date().toISOString(),
    wefact_sync_error: pdfAttached ? null : "pdf_pending",
    wefact_status: normalizePurchaseStatus(ci.Status),
  }).eq("id", settlementId).is("wefact_creditinvoice_id", null);

  return { status: "ok", creditInvoiceId, creditInvoiceCode, creditorCode, pdfAttached };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// deno-lint-ignore no-explicit-any
function clean(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}
