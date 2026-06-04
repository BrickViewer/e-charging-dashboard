// Road.io / e-Flux platform API client (Deno-compatible).
// Reference: documentation.road.io + memory/reference_eflux_road_api.md
// Per Supabase deploy: deze file staat naast elke function die hem gebruikt
// (geen relative ../_shared/ imports — bundle-incompatibel).

export interface RoadConfig {
  apiKey: string;
  providerId: string;
  baseUrl?: string;
}

export interface RoadErrorPayload {
  type?: string;
  message: string;
  status?: number;
  details?: Array<{ message: string; path?: string[]; type?: string; code?: string }>;
}

export class RoadApiError extends Error {
  status: number;
  payload: RoadErrorPayload;
  constructor(status: number, payload: RoadErrorPayload) {
    super(payload.message || `Road API error ${status}`);
    this.name = "RoadApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface RoadSearchResult<T> {
  data: T[];
  meta: { total: number; limit: number; skip: number; approx?: number };
}

export interface RoadCredentials {
  id: string;
  type: string;
  providerId: string;
  accountId?: string;
  permissions?: string[];
}

export interface RoadAccount {
  id: string;
  providerId: string;
  organization?: string;
  kvk?: string;
  btwNumber?: string;
}

export interface CreateAccountBody {
  organization: string;
  kvk?: string;
  btwNumber?: string;
  language?: string;
  contact?: { firstName: string; lastName: string; email: string; phone?: string };
  billingAddress?: {
    street?: string; number?: string; postalCode?: string;
    city?: string; province?: string; countryCode?: string;
  };
  paymentDetails?: {
    iban: string; bic?: string; accountHolderName?: string;
    paymentMethod?: "incasso" | "transfer";
  };
  reimbursementDetails?: {
    iban: string; bic?: string; accountHolderName?: string;
    email?: string; reference?: string;
  };
  billingPlanId?: string;
  legacyId?: string;
  numericReference?: string;
  labels?: string[];
}

export interface RoadCostSetting {
  connectorId: number;
  pricePerKwh: number;
}

export interface RoadConnector {
  id?: string;
  connectorId: number;
  evseId?: string;
  maxPower?: number;
  amperage?: number;
  standard?: string;
  format?: string;
  powerType?: string;
  maxVoltage?: number;
  maxAmperage?: number;
  status?: string;
}

export interface RoadEVSEController {
  id: string;
  providerId: string;
  accountId: string;
  locationId: string;
  evseId: string;
  ocppIdentity: string;
  name?: string;
  serialNumber?: string;
  modelNumber?: string;
  vendorName?: string;
  numConnectors?: number;
  maxPower?: number;
  isDisabled?: boolean;
  connectivityState?: "connected" | "maybe-connected" | "disconnected" | "access-denied" | "unknown" | "pending-first-connection";
  heartbeatReceivedAt?: string;
  costSettings?: RoadCostSetting[];
  connectors?: RoadConnector[];
  firmwareVersion?: string;
  tariffProfileId?: string;
  evseOperationalStatusId?: string;
  evseOperationalStatus?: { canonicalStatus?: string; billingStatus?: string; label?: string };
  createdAt?: string;
}

export interface RoadLocation {
  id: string;
  providerId?: string;
  accountId?: string;
  userId?: string;
  name?: string;
  address?: string;
  // Road API gebruikt snake_case voor postal_code (gevalideerd 2026-05-15)
  postal_code?: string;
  city?: string;
  country?: string;  // ISO 3-letter code (NLD, etc.)
  geoLocation?: { type?: string; coordinates?: [number, number] };  // [longitude, latitude]
  status?: string;
  evseIds?: string[];
  connectorTypes?: string[];
  accessPolicy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RoadDataWrapper<T> {
  data: T;
}

export interface RoadInvoice {
  id: string;
  billingRunId?: string;
  identifier?: string;
  providerId?: string;
  accountId?: string;
  currency?: string;
  isPaid?: boolean;
  isReady?: boolean;
  hasError?: boolean;
  totalAmountWithVat?: number;
  totalCreditAmountWithVat?: number;
  type?: string;
  month?: number;
  year?: number;
  account?: { id?: string; name?: string };
  provider?: { id?: string; name?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEvseBody {
  accountId: string;
  locationId: string;
  ocppIdentity: string;
  serialNumber?: string;
  numConnectors?: number;
  maxPower?: number;
  costSettings?: RoadCostSetting[];
}

export interface RoadCPOSession {
  id: string;
  providerId: string;
  accountId: string;
  evseControllerId: string;
  locationId: string;
  connectorId: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  kwh?: number;
  totalPrice?: number;
  energyCosts?: number;
  startCosts?: number;
  timeCosts?: number;
  idleCosts?: number;
  status?: "ACTIVE" | "COMPLETED";
  powerType?: "ac" | "dc";
  excluded?: boolean;
  currency?: string;
  tokenInfraProviderId?: string;
  tokenUid?: string;
  tokenIssuerName?: string;
  tokenType?: string;
  paymentFlow?: string;
  isRoaming?: boolean;
  reimbursementAmount?: number;
  externalCalculatedPrice?: number;
  vatInfo?: { vatPercentage?: number };
  // Authoritative bedragen + BTW per sessie (gevalideerd 2026-05-15, sectie GEDETAILEERD).
  priceWithFX?: {
    originalCurrency?: string;
    originalAmount?: number;                       // gross excl BTW
    originalAmountWithVAT?: number;                // gross incl BTW
    originalReimbursementAmount?: number;          // wat Account-houder krijgt (excl BTW)
    originalReimbursementAmountWithVAT?: number;   // idem incl BTW
    originalTotalCost?: number;                    // CPO-payout aan provider (excl BTW)
    originalTotalCostWithVAT?: number;             // idem incl BTW
    targetAmount?: number;
    targetReimbursementAmount?: number;
  };
  location?: { name?: string; accessPolicy?: string };
  evseController?: { ocppIdentity?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface RoadReimbursement {
  sessionId: string;
  total?: number;        // wat de location-eigenaar krijgt (excl. BTW)
  currency?: string;
  breakdown?: Array<{
    accountId?: string;
    userId?: string;
    amount?: number;
    type?: string;       // "energy" / "time" / "fixed" / etc.
  }>;
}

export interface SearchAccountsParams { skip?: number; limit?: number; searchPhrase?: string; }
export interface SearchEvseParams {
  skip?: number; limit?: number; accountId?: string; locationIds?: string[];
  searchPhrase?: string; connectivityStates?: string[];
}
export interface SearchSessionsParams {
  skip?: number; limit?: number; accountId?: string; locationId?: string; evseControllerId?: string;
  endedAt?: { $gte?: string; $lte?: string };
  updatedAt?: { $gte?: string; $lte?: string };
  status?: "ACTIVE" | "COMPLETED"; excluded?: boolean;
}

export class RoadClient {
  private baseUrl: string;
  private apiKey: string;
  private providerId: string;

  constructor(config: RoadConfig) {
    this.apiKey = config.apiKey;
    this.providerId = config.providerId;
    this.baseUrl = config.baseUrl ?? "https://api.road.io";
  }

  private async request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Provider": this.providerId,
      "Accept": "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < 3) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      return this.request<T>(method, path, body, attempt + 1);
    }

    if (!res.ok) {
      let payload: RoadErrorPayload = { message: res.statusText, status: res.status };
      try {
        const json = await res.json();
        if (json?.error) payload = { ...json.error, status: res.status };
      } catch (_) {
        // body niet JSON
      }
      throw new RoadApiError(res.status, payload);
    }

    if (res.status === 204) return undefined as T;
    return await res.json() as T;
  }

  getCredentialsSelf(): Promise<RoadCredentials> {
    return this.request("GET", "/1/credentials/self");
  }

  searchAccounts(params: SearchAccountsParams = {}): Promise<RoadSearchResult<RoadAccount>> {
    return this.request("POST", "/1/accounts/search/fast", params);
  }
  createAccount(body: CreateAccountBody): Promise<RoadAccount> {
    return this.request("POST", "/1/accounts", body);
  }
  getAccount(id: string): Promise<RoadAccount> {
    return this.request("GET", `/1/accounts/${id}`);
  }
  updateAccount(id: string, patch: Partial<CreateAccountBody>): Promise<RoadAccount> {
    return this.request("PATCH", `/1/accounts/${id}`, patch);
  }

  searchEvseControllers(params: SearchEvseParams = {}): Promise<RoadSearchResult<RoadEVSEController>> {
    return this.request("POST", "/1/evse-controllers/search/fast", params);
  }
  // GET singular retourneert { data: RoadEVSEController } — unwrap, conform Road conventie.
  async getEvseController(id: string): Promise<RoadEVSEController> {
    const resp = await this.request<RoadDataWrapper<RoadEVSEController>>("GET", `/1/evse-controllers/${id}`);
    return resp.data;
  }
  createEvseController(body: CreateEvseBody): Promise<RoadEVSEController> {
    return this.request("POST", "/1/evse-controllers", body);
  }
  updateEvseController(id: string, patch: Partial<RoadEVSEController>): Promise<RoadEVSEController> {
    return this.request("PATCH", `/1/evse-controllers/${id}`, patch);
  }
  setEvseDisabled(id: string, isDisabled: boolean): Promise<RoadEVSEController> {
    return this.updateEvseController(id, { isDisabled });
  }
  updateCostSettings(id: string, costSettings: RoadCostSetting[]): Promise<RoadEVSEController> {
    return this.updateEvseController(id, { costSettings });
  }

  searchCpoSessions(params: SearchSessionsParams = {}): Promise<RoadSearchResult<RoadCPOSession>> {
    return this.request("POST", "/2/sessions/cpo/search/fast", params);
  }

  searchInvoices(params: { skip?: number; limit?: number } = {}): Promise<RoadSearchResult<RoadInvoice>> {
    return this.request("POST", "/1/invoices/search/fast", params);
  }
  getCpoSession(id: string): Promise<RoadCPOSession> {
    return this.request("GET", `/2/sessions/cpo/${id}`);
  }

  // Authoritative payout-breakdown per sessie. Wordt gebruikt om
  // reimbursement_amount te zetten op charging_sessions, zodat onze
  // settlements 1:1 matchen met Road's self-billing PDF.
  getReimbursements(sessionId: string): Promise<RoadReimbursement> {
    return this.request("GET", `/2/sessions/cpo/${sessionId}/reimbursements`);
  }

  // Locations: GET /1/locations/{id} retourneert { data: RoadLocation } — unwrap.
  async getLocation(id: string): Promise<RoadLocation> {
    const resp = await this.request<RoadDataWrapper<RoadLocation>>("GET", `/1/locations/${id}`);
    return resp.data;
  }
}

export function clientFromEnvAndOrg(org: { eflux_provider_id?: string | null }): RoadClient | null {
  const apiKey = Deno.env.get("EFLUX_API_KEY");
  if (!apiKey || !org.eflux_provider_id) return null;
  return new RoadClient({ apiKey, providerId: org.eflux_provider_id });
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
