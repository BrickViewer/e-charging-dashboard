import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, WefactError, debtorDisplayName, normalizePurchaseStatus, normalizeSaleStatus } from "../_shared/wefact.ts";

// Levenscyclus-acties op bestaande WeFact-facturen (admin/manager):
//   pdf                  -> download PDF van een verkoopfactuur (base64)
//   send                 -> concept alsnog versturen (finaliseert)
//   markpaid             -> verkoopfactuur als betaald markeren
//   credit               -> verkoopfactuur crediteren (maakt creditnota)
//   refresh              -> NIETS muteren, alleen de stand uit WeFact halen (1 API-call)
//   creditinvoice_markpaid -> self-billing inkoopfactuur als betaald markeren (per settlement)
// Na elke muterende actie halen we de actuele stand op en werken we de spiegel bij.
//
// `refresh` bestaat omdat de spiegel ALLEEN bijwerkt via onze app of de cron: verstuur je een
// factuur in WeFact zelf, dan liep het dashboard tot de volgende cron-run achter (Albert Vos,
// 24-07-2026 — kaart bleef in 'Factureren' staan terwijl de factuur al verstuurd was). Bewust
// per factuur i.p.v. de volledige wefact-status-sync: die haalt álle verkoop- én inkoopfacturen
// op, en WeFact blokkeert bij 200/min of 3.600/uur met een 403-firewallblock (geen 429).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_STD });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, CORS_STD, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const apiKey = await resolveSecret(supabase, ["WEFACT_API_KEY"], "wefact_api_key");
    if (!apiKey) return json({ status: "not_configured", message: "WeFact API-key ontbreekt" });
    const wf = new WefactClient(apiKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // ── Self-billing inkoopfactuur betaald markeren ────────────────────────────
    if (action === "creditinvoice_markpaid") {
      const settlementId = String(body.settlementId ?? "");
      if (!settlementId) return json({ status: "error", message: "settlementId is verplicht" }, 400);
      const { data: s } = await supabase.from("settlements").select("wefact_creditinvoice_id, wefact_creditinvoice_code").eq("id", settlementId).maybeSingle();
      if (!s?.wefact_creditinvoice_id) return json({ status: "error", message: "Geen WeFact-inkoopfactuur voor deze afrekening" }, 404);
      await wf.creditInvoiceMarkAsPaid({ Identifier: s.wefact_creditinvoice_id });
      const shown = await wf.creditInvoiceShow({ Identifier: s.wefact_creditinvoice_id });
      const ci = shown?.creditinvoice ?? {};
      await supabase.from("settlements").update({
        wefact_status: normalizePurchaseStatus(ci.Status),
        wefact_amount_paid: num(ci.AmountPaid),
        wefact_paid_at: ci.PayDate ?? new Date().toISOString().slice(0, 10),
      }).eq("id", settlementId);
      return json({ status: "ok", wefactStatus: normalizePurchaseStatus(ci.Status) });
    }

    // ── Verkoopfactuur-acties (op de WeFact Identifier) ────────────────────────
    const invoiceId = String(body.wefactInvoiceId ?? "");
    if (!invoiceId) return json({ status: "error", message: "wefactInvoiceId is verplicht" }, 400);

    if (action === "pdf") {
      const res = await wf.invoiceDownload({ Identifier: invoiceId, InvoiceTemplateType: "invoice", FileType: "pdf" });
      // WeFact nest de PDF onder `invoice`: { Filename, Base64, MimeType }.
      const inv = res?.invoice ?? res ?? {};
      const base64 = inv.Base64 ?? inv.base64 ?? null;
      const filename = inv.Filename ?? inv.filename ?? "factuur.pdf";
      const mime = inv.MimeType ?? inv.mimetype ?? "application/pdf";
      if (!base64) return json({ status: "error", message: "WeFact gaf geen PDF terug" }, 502);
      return json({ status: "ok", base64, filename, mime });
    }

    if (action === "delete") {
      // Concept verwijderen in WeFact (WeFact weigert dit zelf voor definitieve facturen). Is 'ie in
      // WeFact al weg (bijv. handmatig via WeFact verwijderd), dan tóch de lokale spiegel + order-refs
      // opruimen i.p.v. te crashen — zo blijft de knop idempotent.
      let warning: string | null = null;
      try {
        await wf.invoiceDelete({ Identifier: invoiceId });
      } catch (err) {
        warning = err instanceof WefactError ? err.message : (err as Error).message ?? "WeFact-verwijdering mislukt";
      }
      // Hing er een installatie-order aan, maak die weer factureerbaar.
      await supabase.from("installation_orders")
        .update({ wefact_invoice_id: null, wefact_invoice_code: null })
        .eq("wefact_invoice_id", invoiceId);
      await supabase.from("wefact_invoices").delete().eq("wefact_invoice_id", invoiceId);
      return json({ status: "ok", deleted: true, warning });
    }

    if (action === "refresh") {
      // Geen mutatie — val direct door naar de her-sync hieronder.
    } else if (action === "send") {
      await wf.invoiceSendByEmail({ Identifier: invoiceId });
    } else if (action === "markpaid") {
      await wf.invoiceMarkAsPaid({ Identifier: invoiceId, ...(body.payDate ? { PayDate: body.payDate } : {}) });
    } else if (action === "credit") {
      // WeFact maakt bij crediteren een APARTE creditnota (Status 8, negatieve bedragen) en laat het
      // origineel staan. De credit-respons is niet betrouwbaar te spiegelen, dus draait de frontend
      // ná deze actie de status-sync mee (die haalt de creditnota + bijgewerkte statussen op → omzet
      // boekt netto tegen). Hier werken we enkel het origineel bij via de generieke her-sync hieronder.
      await wf.invoiceCredit({ Identifier: invoiceId });
    } else {
      return json({ status: "error", message: `Onbekende action: ${action}` }, 400);
    }

    // Actuele stand ophalen + spiegel bijwerken (kind/koppeling blijft behouden).
    const shown = await wf.invoiceShow({ Identifier: invoiceId });
    const inv = shown?.invoice ?? {};
    await supabase.from("wefact_invoices").upsert({
      wefact_invoice_id: invoiceId,
      invoice_code: String(inv.InvoiceCode ?? ""),
      debtor_code: String(inv.DebtorCode ?? ""),
      debtor_name: debtorDisplayName(inv),
      status: normalizeSaleStatus(inv.Status),
      status_code: Number(inv.Status ?? 0),
      currency: String(inv.Currency ?? "EUR"),
      amount_excl: num(inv.AmountExcl),
      amount_incl: num(inv.AmountIncl),
      amount_paid: num(inv.AmountPaid),
      amount_outstanding: num(inv.AmountOutstanding),
      invoice_date: inv.Date ?? null,
      pay_before: inv.PayBefore ?? null,
      pay_date: inv.PayDate ?? null,
      payment_url: inv.PaymentURL ?? null,
      sent: Number(inv.Sent ?? 0),
      raw_data: inv,
      synced_at: new Date().toISOString(),
    }, { onConflict: "wefact_invoice_id" });

    return json({ status: "ok", invoiceCode: String(inv.InvoiceCode ?? ""), invoiceStatus: normalizeSaleStatus(inv.Status) });
  } catch (err) {
    if (err instanceof WefactError) return json({ status: "wefact_error", statusCode: err.status, message: err.message, errors: err.errors });
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_STD, "Content-Type": "application/json" } });
}
