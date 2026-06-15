// Validatielaag voor self-billing vergoedingsfacturen (Wet OB art. 35a).
// Puur en framework-vrij zodat hij unit-testbaar is en zowel de admin- als de
// portaal-downloadknop hem kan gebruiken. De PDF-generator weigert te renderen
// zolang deze validatie issues meldt; approve_settlements dwingt dezelfde
// regels server-side af (dit is het tweede slot).

export type VatStatus = "vat_liable" | "kor" | "private";

export type InvoiceIssueWhere = "klant" | "organisatie" | "betaalgegevens" | "afrekening";

export interface InvoiceValidationIssue {
  field: string;
  label: string;
  where: InvoiceIssueWhere;
}

export interface InvoiceValidationResult {
  ok: boolean;
  missing: InvoiceValidationIssue[];
}

// Legacy-afgeleide nummers (EC-JJJJMM-klantnr) blijven geldig; nieuwe reeks is ECF-YYYY-NNNNN.
export const INVOICE_NUMBER_RE = /^(ECF-\d{4}-\d{5}|EC-\d{6}-\d+)$/;

// Org-KVK placeholder die nooit op een factuur mag belanden.
export const ORG_KVK_PLACEHOLDER = "12345678";

export interface InvoiceValidationInput {
  settlement: {
    invoice_number?: string | null;
    vat_status?: string | null;
    vat_rate?: number | null;
  };
  client: {
    company_name?: string | null;
    billing_address_street?: string | null;
    billing_address_postal?: string | null;
    billing_address_city?: string | null;
    country?: string | null;
    kvk?: string | null;
    btw_number?: string | null;
    client_number?: number | null;
    vat_status?: string | null;
    vat_status_confirmed_at?: string | null;
  };
  org?: {
    name?: string | null;
    kvk?: string | null;
    btw_number?: string | null;
    iban?: string | null;
    address_street?: string | null;
    address_postal?: string | null;
    address_city?: string | null;
    country?: string | null;
  } | null;
  paymentDetails?: {
    payout_iban?: string | null;
    payout_account_holder_name?: string | null;
  } | null;
}

const empty = (v: unknown): boolean => typeof v !== "string" || v.trim() === "";

/** Effectieve BTW-status: de settlement-snapshot (gezet bij goedkeuring) wint;
 *  anders de klantstatus. */
export function effectiveVatStatus(input: InvoiceValidationInput): VatStatus | null {
  const s = input.settlement.vat_status ?? input.client.vat_status ?? null;
  return s === "vat_liable" || s === "kor" || s === "private" ? s : null;
}

export function validateSelfBillingInvoiceData(input: InvoiceValidationInput): InvoiceValidationResult {
  const missing: InvoiceValidationIssue[] = [];
  const { settlement, client, org, paymentDetails } = input;
  const vs = effectiveVatStatus(input);

  const add = (field: string, label: string, where: InvoiceIssueWhere) =>
    missing.push({ field, label, where });

  // ── BTW-status: aanwezig én bevestigd. De settlement-snapshot geldt als
  //    bevestigd-op-uitgiftemoment (gezet door approve_settlements).
  if (vs === null) {
    add("vat_status", "BTW-status (BTW-ondernemer / KOR / particulier)", "klant");
  } else if (!settlement.vat_status && !client.vat_status_confirmed_at) {
    add("vat_status_confirmed_at", "BTW-status nog niet bevestigd door E-Charging", "klant");
  }

  // ── Leverancier (de host): volledige NAW + identificatie
  if (empty(client.company_name)) add("company_name", "Bedrijfsnaam / naam leverancier", "klant");
  if (empty(client.billing_address_street)) add("billing_address_street", "Straat + huisnummer (factuuradres)", "klant");
  if (empty(client.billing_address_postal)) add("billing_address_postal", "Postcode (factuuradres)", "klant");
  if (empty(client.billing_address_city)) add("billing_address_city", "Plaats (factuuradres)", "klant");
  if (empty(client.country)) add("country", "Land", "klant");
  if (client.client_number === null || client.client_number === undefined) {
    add("client_number", "Klantnummer", "klant");
  }
  if ((vs === "vat_liable" || vs === "kor") && empty(client.kvk)) {
    add("kvk", "KvK-nummer leverancier", "klant");
  }
  if (vs === "vat_liable" && empty(client.btw_number)) {
    add("btw_number", "BTW-identificatienummer leverancier", "klant");
  }

  // ── Betaalgegevens (uitbetaling)
  if (empty(paymentDetails?.payout_iban)) add("payout_iban", "IBAN voor uitbetaling", "betaalgegevens");
  if (empty(paymentDetails?.payout_account_holder_name)) {
    add("payout_account_holder_name", "Naam rekeninghouder", "betaalgegevens");
  }

  // ── Afnemer/opsteller (E-Charging): altijd volledig
  if (empty(org?.name)) add("org_name", "Bedrijfsnaam E-Charging", "organisatie");
  if (empty(org?.address_street)) add("org_address_street", "Straat + huisnummer E-Charging", "organisatie");
  if (empty(org?.address_postal)) add("org_address_postal", "Postcode E-Charging", "organisatie");
  if (empty(org?.address_city)) add("org_address_city", "Plaats E-Charging", "organisatie");
  if (empty(org?.country)) add("org_country", "Land E-Charging", "organisatie");
  if (empty(org?.kvk) || !/^[0-9]{8}$/.test((org?.kvk ?? "").trim()) || (org?.kvk ?? "").trim() === ORG_KVK_PLACEHOLDER) {
    add("org_kvk", "KVK-nummer E-Charging (geen placeholder)", "organisatie");
  }
  if (empty(org?.btw_number)) add("org_btw_number", "BTW-identificatienummer E-Charging", "organisatie");
  if (empty(org?.iban)) add("org_iban", "IBAN E-Charging", "organisatie");

  // ── Afrekening: definitief, opgeslagen factuurnummer (toegekend bij goedkeuring)
  if (empty(settlement.invoice_number) || !INVOICE_NUMBER_RE.test((settlement.invoice_number ?? "").trim())) {
    add("invoice_number", "Factuurnummer (wordt toegekend bij goedkeuring)", "afrekening");
  }

  // ── Consistentie BTW-status ↔ BTW-tarief van de afrekening
  const rate = Number(settlement.vat_rate ?? 0);
  if (vs === "vat_liable" && rate <= 0) {
    add("vat_rate", "BTW-tarief ontbreekt terwijl leverancier BTW-ondernemer is", "afrekening");
  }
  if ((vs === "kor" || vs === "private") && rate > 0) {
    add("vat_rate", "BTW-tarief staat op de afrekening terwijl de leverancier geen BTW rekent", "afrekening");
  }

  return { ok: missing.length === 0, missing };
}
