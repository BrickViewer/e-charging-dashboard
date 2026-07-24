import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, debtorDisplayName, normalizePurchaseStatus, normalizeSaleStatus } from "../_shared/wefact.ts";

// Poll van WeFact-facturen (verkoop + inkoop): haalt ALLE facturen op en werkt de
// verkoopfactuur-spiegel (wefact_invoices) + de betaalspiegel op settlements bij.
// Dagelijkse cron + on-demand vanuit de admin-tab. GEEN webhooks in WeFact -> pollen.
// Bewust geen modified-tijdvenster: WeFact werkt in Amsterdamse tijd en een UTC-venster
// miste recent gewijzigde facturen; alles-ophalen is tijdzone-proof bij dit volume.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_INTERNAL });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, CORS_INTERNAL, { allowInternal: true });
    if (!auth.ok) return auth.response;

    const apiKey = await resolveSecret(supabase, ["WEFACT_API_KEY"], "wefact_api_key");
    if (!apiKey) return json({ status: "not_configured", salesUpserted: 0, purchaseUpdated: 0 });
    const wf = new WefactClient(apiKey);

    const now = new Date();
    const salesUpserted = await syncSalesInvoices(supabase, wf, now);
    const purchase = await syncPurchaseInvoices(supabase, wf, now);

    return json({
      status: purchase.errorCount > 0 ? "partial" : "ok",
      salesUpserted,
      purchaseUpserted: purchase.upserted,
      purchaseUpdated: purchase.settlementsUpdated,
      ...(purchase.firstError ? { purchaseError: purchase.firstError, purchaseErrorCount: purchase.errorCount } : {}),
    });
  } catch (err) {
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

// ── Verkoopfacturen -> wefact_invoices-spiegel ────────────────────────────────
// Alle facturen paginated ophalen en upserten (GEEN modified-filter): WeFact werkt in
// Amsterdamse tijd, dus een UTC-tijdvenster miste recent gewijzigde facturen. Bij dit
// volume is alles-ophalen simpel én tijdzone-proof; het mist nooit een statuswijziging.
// deno-lint-ignore no-explicit-any
async function syncSalesInvoices(sb: any, wf: WefactClient, now: Date): Promise<number> {
  const debtorMap = await buildDebtorLinkMap(sb);
  let offset = 0, count = 0;
  for (let page = 0; page < 40; page++) {
    const res = await wf.invoiceList({ limit: 500, offset });
    const rows = Array.isArray(res.invoices) ? res.invoices : [];
    if (rows.length === 0) break;
    for (const r of rows) {
      // Koppel op DebtorCode aan onze klant (company/person/client) zodat óók extern in
      // WeFact aangemaakte facturen aan de juiste klant hangen. `kind` blijft weg zodat
      // onze installatie/activatie/handmatig behouden blijft (extern = default 'onbekend').
      const link = debtorMap.get(String(r.DebtorCode ?? "")) ?? {};
      await sb.from("wefact_invoices").upsert({
        wefact_invoice_id: String(r.Identifier),
        invoice_code: String(r.InvoiceCode ?? ""),
        debtor_code: String(r.DebtorCode ?? ""),
        debtor_name: debtorDisplayName(r),
        company_id: link.company_id ?? null,
        person_id: link.person_id ?? null,
        client_id: link.client_id ?? null,
        status: normalizeSaleStatus(r.Status),
        status_code: Number(r.Status ?? 0),
        currency: String(r.Currency ?? "EUR"),
        amount_excl: num(r.AmountExcl),
        amount_incl: num(r.AmountIncl),
        amount_paid: num(r.AmountPaid),
        amount_outstanding: num(r.AmountOutstanding),
        invoice_date: r.Date ?? null,
        pay_before: r.PayBefore ?? null,
        pay_date: r.PayDate ?? null,
        payment_url: r.PaymentURL ?? null,
        sent: Number(r.Sent ?? 0),
        raw_data: r,
        synced_at: now.toISOString(),
      }, { onConflict: "wefact_invoice_id" });
      count++;
    }
    offset += rows.length;
    if (rows.length < 500) break;
  }
  await setLastRun(sb, "invoice", now);
  return count;
}

// Map WeFact-DebtorCode -> {company_id, person_id, client_id} op basis van onze ankers.
// deno-lint-ignore no-explicit-any
async function buildDebtorLinkMap(sb: any): Promise<Map<string, { company_id?: string; person_id?: string; client_id?: string }>> {
  const map = new Map<string, { company_id?: string; person_id?: string; client_id?: string }>();
  const { data: companies } = await sb.from("companies").select("id, wefact_debtor_code").not("wefact_debtor_code", "is", null);
  const { data: persons } = await sb.from("persons").select("id, wefact_debtor_code").not("wefact_debtor_code", "is", null);
  const compIds = (companies ?? []).map((c: { id: string }) => c.id);
  const persIds = (persons ?? []).map((p: { id: string }) => p.id);
  // Actieve clients per company/person voor de client_id-koppeling.
  const { data: clients } = await sb.from("clients").select("id, company_id, person_id, status").neq("status", "verwijderd");
  const clientByCompany = new Map<string, string>();
  const clientByPerson = new Map<string, string>();
  for (const cl of clients ?? []) {
    if (cl.company_id && compIds.includes(cl.company_id)) clientByCompany.set(cl.company_id, cl.id);
    if (cl.person_id && persIds.includes(cl.person_id)) clientByPerson.set(cl.person_id, cl.id);
  }
  for (const c of companies ?? []) {
    map.set(String(c.wefact_debtor_code), { company_id: c.id, client_id: clientByCompany.get(c.id) });
  }
  for (const p of persons ?? []) {
    map.set(String(p.wefact_debtor_code), { person_id: p.id, client_id: clientByPerson.get(p.id) });
  }
  return map;
}

// ── Inkoopfacturen -> volledige spiegel + betaalspiegel op settlements ────────
// Alle creditinvoices worden gespiegeld in wefact_purchase_invoices zodat óók gewone
// leveranciersfacturen/bonnetjes als kosten zichtbaar zijn; self-billing-rijen krijgen
// is_self_billing=true (die tellen als kosten al mee via settlements.client_payout).
// deno-lint-ignore no-explicit-any
async function syncPurchaseInvoices(sb: any, wf: WefactClient, now: Date): Promise<{ upserted: number; settlementsUpdated: number; errorCount: number; firstError: string | null }> {
  const { data: sbRows } = await sb.from("settlements")
    .select("wefact_creditinvoice_id").not("wefact_creditinvoice_id", "is", null);
  const selfBillingIds = new Set((sbRows ?? []).map((r: { wefact_creditinvoice_id: string }) => String(r.wefact_creditinvoice_id)));

  let offset = 0, upserted = 0, settlementsUpdated = 0, errorCount = 0;
  let firstError: string | null = null;
  for (let page = 0; page < 40; page++) {
    const res = await wf.creditInvoiceList({ limit: 500, offset });
    const rows = Array.isArray(res.creditinvoices) ? res.creditinvoices : [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const creditInvoiceId = String(r.Identifier);
      // LET OP: supabase-js gooit niet — upsert-fouten expliciet checken, anders
      // verdwijnen rijen geruisloos (les van de SharePoint-dossier-regressie).
      const { error: upsertError } = await sb.from("wefact_purchase_invoices").upsert({
        wefact_creditinvoice_id: creditInvoiceId,
        creditinvoice_code: String(r.CreditInvoiceCode ?? ""),
        invoice_code: String(r.InvoiceCode ?? ""),
        creditor_code: String(r.Creditor ?? ""),
        creditor_name: debtorDisplayName(r) || String(r.CreditInvoiceCode ?? ""),
        status: normalizePurchaseStatus(r.Status),
        status_code: Number(r.Status ?? 0),
        amount_excl: num(r.AmountExcl),
        amount_incl: num(r.AmountIncl),
        amount_paid: num(r.AmountPaid),
        amount_outstanding: num(r.AmountOutstanding),
        invoice_date: dateOrNull(r.Date),
        pay_before: dateOrNull(r.PayBefore),
        pay_date: dateOrNull(r.PayDate),
        is_self_billing: selfBillingIds.has(creditInvoiceId),
        raw_data: r,
        synced_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: "wefact_creditinvoice_id" });
      if (upsertError) {
        errorCount++;
        firstError ??= `${creditInvoiceId}: ${upsertError.message ?? String(upsertError)}`;
      } else {
        upserted++;
      }

      const { error, count: updated } = await sb.from("settlements")
        .update({
          wefact_status: normalizePurchaseStatus(r.Status),
          wefact_amount_paid: num(r.AmountPaid),
          wefact_paid_at: dateOrNull(r.PayDate),
        }, { count: "exact" })
        .eq("wefact_creditinvoice_id", creditInvoiceId);
      if (!error && (updated ?? 0) > 0) settlementsUpdated++;
    }
    offset += rows.length;
    if (rows.length < 500) break;
  }
  await setLastRun(sb, "creditinvoice", now, firstError);
  return { upserted, settlementsUpdated, errorCount, firstError };
}

// WeFact geeft lege datums als "" of "0000-00-00" terug — die zijn ongeldig voor
// een Postgres date-kolom en zouden de upsert laten falen.
function dateOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.startsWith("0000")) return null;
  return s;
}

// Alleen voor observability: leg vast wanneer de sync draaide (geen filterbron meer).
// deno-lint-ignore no-explicit-any
async function setLastRun(sb: any, entity: string, runAt: Date, error: string | null = null) {
  await sb.from("wefact_sync_state").upsert({
    entity_type: entity,
    last_synced_at: runAt.toISOString(),
    last_run_at: runAt.toISOString(),
    last_status: error ? "error" : "ok",
    last_error: error,
    updated_at: runAt.toISOString(),
  }, { onConflict: "entity_type" });
}

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_INTERNAL, "Content-Type": "application/json" } });
}
