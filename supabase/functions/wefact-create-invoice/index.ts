import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, WefactError, debtorDisplayName, normalizeSaleStatus } from "../_shared/wefact.ts";
import { Anchor, ensureDebtorCode, resolveAnchor } from "../_shared/wefactSubjects.ts";

// Maakt een VERKOOPfactuur in WeFact (installatie / activatie / handmatig), borgt
// eerst de debiteur, schrijft de spiegelrij (wefact_invoices) en — voor installatie —
// de ref + invoiced_at op de installation_order. WeFact is hier de uitgever van het
// factuurdocument; wij genereren geen eigen PDF.
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
    const client = new WefactClient(apiKey);

    const { data: org } = await supabase
      .from("organizations")
      .select("wefact_tax_code_sale, wefact_debtor_group_id")
      .limit(1).maybeSingle();
    const taxCodeSale: string | null = org?.wefact_tax_code_sale ?? null;
    const debtorGroupId: string | null = org?.wefact_debtor_group_id ?? null;

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind ?? "");
    const sendByEmail = Boolean(body.sendByEmail);

    // ── Debiteur + factuurregels bepalen per soort ─────────────────────────────
    let anchor: Anchor;
    // deno-lint-ignore no-explicit-any
    const lines: Record<string, any>[] = [];
    let orderId: string | null = null;
    let clientId: string | null = null;
    let description = "";
    let referenceNumber = "";
    // Hoeveel van deze factuur activatiekosten is; voedt de spiegelrij en daarmee de
    // herberekening van clients.activation_invoiced_total.
    let activationExcl = 0;

    if (kind === "installatie") {
      orderId = String(body.orderId ?? "");
      if (!orderId) return json({ status: "error", message: "orderId is verplicht" }, 400);
      const { data: order } = await supabase
        .from("installation_orders")
        .select("id, client_id, company_id, quote_id, wefact_invoice_code, site_street, site_house_number, site_postal, site_city")
        .eq("id", orderId).maybeSingle();
      if (!order) return json({ status: "error", message: "Installatie-order niet gevonden" }, 404);
      if (order.wefact_invoice_code) {
        return json({ status: "already", message: `Order is al gefactureerd (${order.wefact_invoice_code})`, invoiceCode: order.wefact_invoice_code });
      }
      clientId = order.client_id ?? null;

      // Debiteur-anker: client -> company/person; anders order.company_id; anders via de quote.
      let quote: Record<string, unknown> | null = null;
      if (order.quote_id) {
        const { data } = await supabase
          .from("quotes")
          .select("total_hardware_cost, total_installation_cost, is_private, person_id, company_id, quote_number, with_management, num_charge_points, offer_details")
          .eq("id", order.quote_id).maybeSingle();
        quote = data ?? null;
      }
      anchor = await resolveInstallationAnchor(supabase, order, quote);

      // Eén gecombineerde factuurregel met het installatieadres. De regel-omschrijving print
      // gegarandeerd op de factuur (subject/referentie zijn template-afhankelijk), dus het adres
      // hoort HIER. HOUD IN SYNC met apps/admin/src/components/sales/OnboardingInvoiceDialog.tsx.
      const hw = Number(quote?.total_hardware_cost ?? 0);
      const inst = Number(quote?.total_installation_cost ?? 0);
      const total = round2(hw + inst);
      if (total <= 0) return json({ status: "error", message: "Offerte heeft geen te factureren bedragen" }, 400);
      const siteAddress = formatSiteAddress(order);
      lines.push(saleLine(`Levering en installatie laadpalen${siteAddress ? ` — ${siteAddress}` : ""}`, total, taxCodeSale));

      // Activatiekosten als EIGEN regel: aantal × prijs per laadpunt, zodat de factuur laat zien
      // wat de offerte beloofde ("6 × € 18,50 = € 111,00") in plaats van één opgeteld bedrag.
      // Poort bewust `=== true`: `!== false` slaat om bij NULL, en offer_details draagt op élke
      // offerte een geseede activatieprijs — ook op installatie-ONLY offertes waar de klant er
      // nooit een aangeboden heeft gekregen (offerte 208-01-26).
      const od = (quote?.offer_details ?? {}) as Record<string, unknown>;
      const perSocket = round2(Number(od.activatiekostenPerSocket ?? 0));
      const qty = Number(quote?.num_charge_points ?? 0);
      if (quote?.with_management === true && perSocket > 0 && qty > 0) {
        activationExcl = round2(perSocket * qty);
        lines.push(saleLine("Activatiekosten laadpunten", perSocket, taxCodeSale, qty));
      }
      description = "Levering en installatie laadinfrastructuur";
      const quoteNumber = String(quote?.quote_number ?? "").trim();
      if (quoteNumber) referenceNumber = quoteNumber;
    } else if (kind === "activatie") {
      clientId = String(body.clientId ?? "");
      if (!clientId) return json({ status: "error", message: "clientId is verplicht" }, 400);
      const { data: c } = await supabase
        .from("clients").select("id, company_id, person_id, activation_fee_total, activation_invoiced_total").eq("id", clientId).maybeSingle();
      if (!c) return json({ status: "error", message: "Klant niet gevonden" }, 404);
      // Alleen het OPENSTAANDE deel factureren, niet het volle verkochte totaal.
      const amount = round2(Number(c.activation_fee_total ?? 0) - Number(c.activation_invoiced_total ?? 0));
      if (amount <= 0) return json({ status: "error", message: "Geen openstaande activatiekosten op deze klant" }, 400);

      // Spiegel van de guard op de installatie-tak: geen tweede concept van hetzelfde bedrag.
      const { data: bestaand } = await supabase
        .from("wefact_invoices")
        .select("invoice_code, status_code")
        .eq("activation_client_id", clientId)
        .not("activation_amount_excl", "is", null)
        .limit(50);
      const openFactuur = (bestaand ?? []).find((w) => ![8, 9].includes(Number(w.status_code ?? 0)));
      if (openFactuur) {
        return json({ status: "already", message: `Activatiekosten staan al op factuur ${openFactuur.invoice_code}`, invoiceCode: openFactuur.invoice_code });
      }

      anchor = await resolveAnchor(supabase, "client", clientId);
      // Aantal × prijs per laadpunt wanneer de offerte dat zo heeft aangeboden (tekstversie 3+);
      // oudere beheer-offertes noemden één totaalbedrag en worden dus ook zo gefactureerd.
      const qty = Math.max(0, Math.trunc(Number(body.quantity ?? 0)));
      const perUnit = round2(Number(body.unitPriceExcl ?? 0));
      if (qty > 0 && perUnit > 0 && round2(qty * perUnit) === amount) {
        lines.push(saleLine("Activatiekosten laadpunten", perUnit, taxCodeSale, qty));
      } else {
        lines.push(saleLine("Activatie- en onboardingkosten beheer", amount, taxCodeSale));
      }
      activationExcl = amount;
      description = "Activatiekosten";
    } else if (kind === "handmatig") {
      const subjectType = String(body.subjectType ?? "");
      const subjectId = String(body.subjectId ?? "");
      if (!subjectType || !subjectId) return json({ status: "error", message: "subjectType en subjectId zijn verplicht" }, 400);
      anchor = await resolveAnchor(supabase, subjectType, subjectId);
      if (subjectType === "client") clientId = subjectId;
      const inputLines = Array.isArray(body.lines) ? body.lines : [];
      for (const l of inputLines) {
        const price = Number(l.priceExcl);
        if (!l.description || Number.isNaN(price)) continue;
        lines.push(saleLine(String(l.description), price, taxCodeSale, Number(l.number ?? 1)));
      }
      if (lines.length === 0) return json({ status: "error", message: "Geen geldige factuurregels" }, 400);
      description = String(body.description ?? "");
    } else {
      return json({ status: "error", message: `Onbekend factuursoort: ${kind}` }, 400);
    }

    // ── Debiteur borgen + factuur aanmaken ─────────────────────────────────────
    const debtorCode = await ensureDebtorCode(supabase, client, anchor, { debtorGroupId });

    // deno-lint-ignore no-explicit-any
    const addParams: Record<string, any> = { DebtorCode: debtorCode, InvoiceLines: lines, VatCalcMethod: "excl" };
    if (description) addParams.Description = description;
    if (referenceNumber) addParams.ReferenceNumber = referenceNumber;
    const res = await client.invoiceAdd(addParams);
    // deno-lint-ignore no-explicit-any
    let invoice: Record<string, any> = res.invoice ?? {};
    const invoiceId = String(invoice.Identifier ?? "");
    if (!invoiceId) return json({ status: "error", message: "WeFact gaf geen factuur terug" }, 502);

    // Versturen finaliseert het concept (echte code + status). Op Identifier i.p.v. de
    // concept-code, en fouten NIET stil inslikken.
    let warning: string | null = null;
    if (sendByEmail) {
      try {
        await client.invoiceSendByEmail({ Identifier: invoiceId });
      } catch (err) {
        warning = err instanceof WefactError ? err.message : (err as Error).message ?? "versturen mislukt";
      }
    }

    // Actuele stand ophalen (na finaliseren/versturen), zodat de spiegel de ECHTE code
    // en status toont i.p.v. de concept-momentopname van invoice/add.
    try {
      const shown = await client.invoiceShow({ Identifier: invoiceId });
      if (shown?.invoice) invoice = shown.invoice;
    } catch (_) { /* val terug op de add-respons */ }
    const invoiceCode = String(invoice.InvoiceCode ?? "");

    // Guard: versturen gevraagd maar WeFact houdt 'm nog als concept -> geen stilte,
    // maar een duidelijke melding (zodat de gebruiker niet denkt dat 'ie verstuurd is).
    if (sendByEmail && !warning && Number(invoice.Status ?? 0) === 0) {
      warning = "de factuur staat in WeFact nog als concept — controleer de e-mail-/factuurinstellingen in WeFact";
    }

    // ── Spiegelrij + refs terugschrijven ───────────────────────────────────────
    const companyId = anchor.table === "companies" ? anchor.id : null;
    const personId = anchor.table === "persons" ? anchor.id : null;
    await supabase.from("wefact_invoices").upsert({
      wefact_invoice_id: invoiceId,
      invoice_code: invoiceCode,
      debtor_code: debtorCode,
      debtor_name: debtorDisplayName(invoice),
      kind,
      client_id: clientId,
      company_id: companyId,
      person_id: personId,
      installation_order_id: orderId,
      status: normalizeSaleStatus(invoice.Status),
      status_code: Number(invoice.Status ?? 0),
      currency: String(invoice.Currency ?? "EUR"),
      amount_excl: num(invoice.AmountExcl),
      amount_incl: num(invoice.AmountIncl),
      amount_paid: num(invoice.AmountPaid),
      amount_outstanding: num(invoice.AmountOutstanding),
      invoice_date: invoice.Date ?? null,
      pay_before: invoice.PayBefore ?? null,
      sent: Number(invoice.Sent ?? 0),
      raw_data: invoice,
      synced_at: new Date().toISOString(),
      // Eigen kolommen: wefact-status-sync noemt ze niet in zijn upsert, dus de nachtelijke
      // poll laat ze met rust (client_id wordt daar wél herschreven — vandaar een eigen anker).
      activation_amount_excl: activationExcl > 0 ? activationExcl : null,
      activation_client_id: activationExcl > 0 ? clientId : null,
    }, { onConflict: "wefact_invoice_id" });

    if (kind === "installatie" && orderId) {
      // invoiced_at pas zetten wanneer de factuur ook echt verstuurd is; een concept houdt de
      // onboarding-kaart in 'Opgeleverd' (de dialoog zet invoiced_at bij het verzenden).
      // Bij een concept sturen we invoiced_at NIET mee: een expliciete null zou een order
      // die al handmatig als gefactureerd is gemarkeerd (geen wefact_invoice_code, dus de
      // guard hieronder houdt hem niet tegen) terugtrekken naar 'Opgeleverd'.
      const patch: Record<string, unknown> = { wefact_invoice_id: invoiceId, wefact_invoice_code: invoiceCode };
      if (sendByEmail) patch.invoiced_at = new Date().toISOString();
      await supabase.from("installation_orders")
        .update(patch)
        .eq("id", orderId).is("wefact_invoice_code", null);
    }

    return json({ status: "ok", invoiceId, invoiceCode, debtorCode, sent: sendByEmail, warning });
  } catch (err) {
    if (err instanceof WefactError) {
      return json({ status: "wefact_error", statusCode: err.status, message: err.message, errors: err.errors });
    }
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function resolveInstallationAnchor(sb: any, order: Record<string, unknown>, quote: Record<string, unknown> | null): Promise<Anchor> {
  if (order.client_id) return resolveAnchor(sb, "client", String(order.client_id));
  if (order.company_id) return resolveAnchor(sb, "company", String(order.company_id));
  if (quote?.person_id) return resolveAnchor(sb, "person", String(quote.person_id));
  if (quote?.company_id) return resolveAnchor(sb, "company", String(quote.company_id));
  throw new Error("Geen debiteur te bepalen voor deze order (geen klant/bedrijf/persoon)");
}

// deno-lint-ignore no-explicit-any
function saleLine(description: string, priceExcl: number, taxCode: string | null, number = 1): Record<string, any> {
  // deno-lint-ignore no-explicit-any
  const line: Record<string, any> = { Description: description, PriceExcl: round2(priceExcl), Number: number };
  if (taxCode) line.TaxCode = taxCode;
  return line;
}

// "{straat} {huisnr}, {postcode} {plaats}" uit de order-site-velden (lege delen weggelaten).
function formatSiteAddress(o: Record<string, unknown>): string {
  const street = [o.site_street, o.site_house_number].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  const place = [o.site_postal, o.site_city].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ");
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_STD, "Content-Type": "application/json" } });
}
