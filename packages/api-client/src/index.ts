import type { ConfiguratorSettings, PricingInput } from "@echarging/pricing-engine";

type RequestOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export type SessionStartResponse = {
  sessionId: string;
  url: string;
  expiresAt: string;
};

export type LeadPrefill = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  locationAddress: string;
  postalCode: string;
  city: string;
  locationType: string | null;
  sockets: number | null;
};

export type SettingsResponse = {
  version: number;
  settings: ConfiguratorSettings;
  leadId?: string | null;
  prefill?: LeadPrefill;
  // Eerder opgeslagen configuratie van de lead (om verder te bewerken).
  savedInput?: PricingInput;
  savedExtras?: { ere: boolean; investmentMin: number | null; investmentMax: number | null };
};

export type SaveToLeadResponse = {
  leadId: string;
  savedAt: string;
};

export type DraftSaveResponse = {
  status: "saved";
  savedAt: string;
};

export type FinalizeClientResponse = {
  clientId: string;
  clientNumber: number | null;
  configurationId: string;
};

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  { baseUrl = "", fetcher = fetch }: RequestOptions = {},
): Promise<T> {
  const response = await fetcher(`${baseUrl}${path}`, {
    // Geen credentials/cookies: de sessie loopt via sessionId in de body. Met
    // `credentials: "include"` blokkeert de browser de response omdat de edge
    // Access-Control-Allow-Origin: * teruggeeft (wildcard mag niet met cookies).
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed: ${response.status}`);
  }
  return payload as T;
}

export function createConfiguratorApi(options: RequestOptions = {}) {
  return {
    startSession() {
      return requestJson<SessionStartResponse>(
        "/functions/v1/configurator-session-start",
        { method: "POST", body: "{}" },
        options,
      );
    },
    getSettings(sessionId: string) {
      return requestJson<SettingsResponse>(
        "/functions/v1/configurator-settings",
        { method: "POST", body: JSON.stringify({ sessionId }) },
        options,
      );
    },
    saveDraft(sessionId: string, payload: { input: PricingInput; step: number }) {
      return requestJson<DraftSaveResponse>(
        "/functions/v1/configurator-draft-save",
        { method: "POST", body: JSON.stringify({ sessionId, ...payload }) },
        options,
      );
    },
    // Slaat de configuratie op AAN DE LEAD (geen klant).
    saveToLead(
      sessionId: string,
      payload: {
        input: PricingInput;
        settingsVersion: number;
        ere?: boolean;
        investmentMinTotal?: number;
        investmentMaxTotal?: number;
        scope?: string;
      },
    ) {
      return requestJson<SaveToLeadResponse>(
        "/functions/v1/configurator-save-to-lead",
        { method: "POST", body: JSON.stringify({ sessionId, ...payload }) },
        options,
      );
    },
    finalizeClient(
      sessionId: string,
      payload: {
        input: PricingInput;
        settingsVersion: number;
        ere?: boolean;
        investmentMinTotal?: number;
        investmentMaxTotal?: number;
        scope?: string;
      },
    ) {
      return requestJson<FinalizeClientResponse>(
        "/functions/v1/configurator-finalize-client",
        { method: "POST", body: JSON.stringify({ sessionId, ...payload }) },
        options,
      );
    },
  };
}
