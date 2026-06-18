import { PublicClientApplication, LogLevel, type Configuration } from "@azure/msal-browser";

// Client-side Microsoft (delegated) login voor de SharePoint-koppeling.
// De client-ID komt uit de env (VITE_MS_CLIENT_ID) zodat we per omgeving een
// andere Azure-app-registratie kunnen gebruiken. Multi-tenant ("organizations")
// zodat een willekeurig werk/school-account kan inloggen.
const CLIENT_ID = (import.meta.env.VITE_MS_CLIENT_ID as string | undefined) ?? "";

// Placeholder-GUID zodat MSAL kan construeren/initialiseren ook als de env-var nog
// niet gezet is; echt inloggen is gated op `msalConfigured`.
const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID || "00000000-0000-0000-0000-000000000000",
    authority: "https://login.microsoftonline.com/organizations",
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
