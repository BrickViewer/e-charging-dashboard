import { PublicClientApplication, LogLevel, type Configuration } from "@azure/msal-browser";

// Client-side Microsoft (delegated) login voor de SharePoint-koppeling.
// De client-ID komt uit de env (VITE_MS_CLIENT_ID) zodat we per omgeving een
// andere Azure-app-registratie kunnen gebruiken. Multi-tenant ("organizations")
// zodat een willekeurig werk/school-account kan inloggen.
// Azure-app "E-Charging Dashboard – SharePoint" (SPA, multi-tenant). De client-ID is
// niet geheim (zit toch in de browser-bundle); override kan via VITE_MS_CLIENT_ID.
// E-group Azure-app "E-Charging Dashboard (SSO + SharePoint)" — single-tenant. Client-ID is
// niet geheim (zit in de browser-bundle). Override kan via VITE_MS_CLIENT_ID.
const CLIENT_ID = (import.meta.env.VITE_MS_CLIENT_ID as string | undefined) || "714191c3-9afe-4e0f-bf45-be3f069b4923";

// Tenant van de authority = de e-group-tenant (single-tenant → alleen e-group-accounts).
const TENANT = (import.meta.env.VITE_MS_TENANT_ID as string | undefined) || "af84c294-b910-43a4-b2ea-b177995720e4";

// Placeholder-GUID zodat MSAL kan construeren/initialiseren ook als de env-var nog
// niet gezet is; echt inloggen is gated op `msalConfigured`.
const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID || "00000000-0000-0000-0000-000000000000",
    authority: `https://login.microsoftonline.com/${TENANT}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin + "/redirect.html" : "/redirect.html",
    postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : "/",
  },
  cache: {
    cacheLocation: "localStorage",
  },
  system: {
    allowRedirectInIframe: true,
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error("[MSAL]", message);
        else if (level === LogLevel.Warning) console.warn("[MSAL]", message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};
// Voorkom dat MSAL na de popup-redirect terugnavigeert.
(msalConfig.auth as { navigateToLoginRequestUrl?: boolean }).navigateToLoginRequestUrl = false;

// Delegated scopes voor het lezen van sites/drives + het maken van mappen/uploaden.
export const graphScopes = ["User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"];
export const loginRequest = { scopes: graphScopes };

export const msalInstance = new PublicClientApplication(msalConfig);
export const msalConfigured = !!CLIENT_ID;

// Microsoft-SSO als app-login (staf) — LIVE. Standaard aan; alleen uit te zetten met
// VITE_MS_SSO_ENABLED=false (noodrem). Klanten blijven op e-mail/wachtwoord.
export const msSsoEnabled = (import.meta.env.VITE_MS_SSO_ENABLED as string | undefined) !== "false";
