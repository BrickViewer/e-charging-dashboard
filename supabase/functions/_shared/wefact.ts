// Gedeelde HTTP-client voor de WeFact API v2. Zelfde stijl als egroup-api.ts /
// road-api.ts: één fetch-wrapper met nette foutklasse en retry op transient fouten.
//
// WeFact-eigenaardigheden (uit de API-docs):
//  - Eén POST-endpoint https://api.mijnwefact.nl/v2/ ; controller+action+api_key in de body.
//  - Body is application/x-www-form-urlencoded (http_build_query-stijl, ook geneste arrays).
//  - Response is JSON met een "status"-veld ("success" | "error"); fouten zitten in "errors".
//  - Geen webhooks -> statuswijzigingen ophalen via list + modified-filter (elders).
//  - Rate limit 200/min, 3.600/uur per IP; overschrijden -> HTTP 403 (firewall-block), niet 429.

const WEFACT_ENDPOINT = "https://api.mijnwefact.nl/v2/";

export class WefactError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: string[] = [],
    public controller?: string,
    public action?: string,
  ) {
    super(message);
    this.name = "WefactError";
  }
}

// ── Statuscodes ───────────────────────────────────────────────────────────────
// LET OP: verkoop- en inkoopfactuur nummeren betaald/deels-betaald verschillend.
export const SALE_STATUS: Record<number, string> = {
  0: "concept",
  2: "verzonden",
  3: "deels_betaald",
  4: "betaald",
  8: "credit",
  9: "vervallen",
};
export const PURCHASE_STATUS: Record<number, string> = {
  1: "open",
  2: "deels_betaald",
  3: "betaald",
  8: "credit",
};

export type NormalizedStatus =
  | "concept"
  | "verzonden"
  | "open"
  | "deels_betaald"
  | "betaald"
  | "vervallen"
  | "credit"
  | "onbekend";

export function normalizeSaleStatus(code: number | string | null | undefined): NormalizedStatus {
  return (SALE_STATUS[Number(code)] as NormalizedStatus) ?? "onbekend";
}
export function normalizePurchaseStatus(code: number | string | null | undefined): NormalizedStatus {
  return (PURCHASE_STATUS[Number(code)] as NormalizedStatus) ?? "onbekend";
}

// Leesbare debiteurnaam uit een WeFact-factuur/relatie-rij. LET OP: WeFact geeft lege
// velden terug als "" (niet null), dus geen ?? gebruiken. Bedrijf > persoon > code.
// deno-lint-ignore no-explicit-any
export function debtorDisplayName(r: Record<string, any>): string {
  const company = String(r?.CompanyName ?? "").trim();
  if (company) return company;
  const person = [r?.Initials, r?.SurName].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  if (person) return person;
  return String(r?.DebtorCode ?? "").trim();
}

// deno-lint-ignore no-explicit-any
type Params = Record<string, any>;

// http_build_query-equivalent: encodet ook geneste arrays/objecten als key[sub]=val.
function encodeForm(params: Params): string {
  const pairs: string[] = [];
  // deno-lint-ignore no-explicit-any
  const add = (key: string, val: any) => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val)) {
      val.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val)) add(`${key}[${k}]`, v);
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return pairs.join("&");
}

export interface WefactResponse {
  controller?: string;
  action?: string;
  status?: string; // "success" | "error"
  date?: string;
  errors?: string[];
  success?: string[];
  warning?: string[];
  // deno-lint-ignore no-explicit-any
  [key: string]: any;
}

export class WefactClient {
  constructor(private apiKey: string) {}

  // Kern-call: POST controller/action met form-urlencoded body, JSON-respons.
  // Gooit WefactError bij status=error of niet-2xx. Retry op 5xx (transient).
  async request(controller: string, action: string, params: Params = {}, attempt = 0): Promise<WefactResponse> {
    const body = encodeForm({ api_key: this.apiKey, controller, action, ...params });

    let res: Response;
    try {
      res = await fetch(WEFACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      if (attempt < 3) {
        await sleep(500 * 2 ** attempt);
        return this.request(controller, action, params, attempt + 1);
      }
      throw new WefactError(0, `Netwerkfout richting WeFact: ${(err as Error).message}`, [], controller, action);
    }

    if (res.status >= 500 && attempt < 3) {
      await sleep(500 * 2 ** attempt);
      return this.request(controller, action, params, attempt + 1);
    }

    const text = await res.text();
    let json: WefactResponse;
    try {
      json = JSON.parse(text) as WefactResponse;
    } catch (_) {
      // Firewall-block geeft platte tekst (bv. "IP … currently in firewall").
      throw new WefactError(res.status, text || res.statusText, [], controller, action);
    }

    if (!res.ok || json.status === "error") {
      const errs = Array.isArray(json.errors) ? json.errors : [];
      throw new WefactError(res.status, errs[0] ?? `WeFact ${controller}/${action} gaf een fout`, errs, controller, action);
    }
    return json;
  }

  // ── Debiteuren ──────────────────────────────────────────────────────────────
  debtorAdd(p: Params) { return this.request("debtor", "add", p); }
  debtorEdit(p: Params) { return this.request("debtor", "edit", p); }
  debtorShow(p: Params) { return this.request("debtor", "show", p); }
  debtorList(p: Params) { return this.request("debtor", "list", p); }

  // ── Crediteuren (self-billing: wie wij uitbetalen) ────────────────────────────
  creditorAdd(p: Params) { return this.request("creditor", "add", p); }
  creditorEdit(p: Params) { return this.request("creditor", "edit", p); }
  creditorShow(p: Params) { return this.request("creditor", "show", p); }
  creditorList(p: Params) { return this.request("creditor", "list", p); }

  // ── Verkoopfacturen ───────────────────────────────────────────────────────────
  invoiceAdd(p: Params) { return this.request("invoice", "add", p); }
  invoiceShow(p: Params) { return this.request("invoice", "show", p); }
  invoiceList(p: Params) { return this.request("invoice", "list", p); }
  invoiceSendByEmail(p: Params) { return this.request("invoice", "sendbyemail", p); }
  invoiceMarkAsPaid(p: Params) { return this.request("invoice", "markaspaid", p); }
  invoiceCredit(p: Params) { return this.request("invoice", "credit", p); }
  invoiceDelete(p: Params) { return this.request("invoice", "delete", p); }
  invoiceDownload(p: Params) { return this.request("invoice", "download", p); }

  // ── Inkoopfacturen (creditinvoice) ────────────────────────────────────────────
  creditInvoiceAdd(p: Params) { return this.request("creditinvoice", "add", p); }
  creditInvoiceShow(p: Params) { return this.request("creditinvoice", "show", p); }
  creditInvoiceList(p: Params) { return this.request("creditinvoice", "list", p); }
  creditInvoiceMarkAsPaid(p: Params) { return this.request("creditinvoice", "markaspaid", p); }

  // ── Bijlagen (Type: invoice | creditinvoice | debtor | creditor) ──────────────
  attachmentAdd(p: Params) { return this.request("attachment", "add", p); }

  // ── Instellingen / producten (voor de mapping-UI) ─────────────────────────────
  settingsList(p: Params = {}) { return this.request("settings", "list", p); }
  productList(p: Params = {}) { return this.request("product", "list", p); }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
