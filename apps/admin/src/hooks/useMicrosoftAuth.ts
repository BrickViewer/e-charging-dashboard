import { useCallback, useMemo } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { graphScopes, msalConfigured } from "@/lib/msal";

// Gegooid wanneer de opgeslagen toestemming de gevraagde scopes niet meer dekt en er dus een
// INTERACTIEVE stap nodig is. Bewust een eigen type: de aanroeper (een achtergrond-query) mag
// daar géén popup voor openen — browsers blokkeren popups die niet uit een klik komen, en die
// geblokkeerde belofte lost nooit op. Zo'n hangende query liet de agenda eindeloos op een grijze
// skeleton staan zonder foutmelding. De UI vangt dit af en toont een herkoppel-knop.
export class MicrosoftReauthRequiredError extends Error {
  constructor(message = "Microsoft-koppeling moet vernieuwd worden") {
    super(message);
    this.name = "MicrosoftReauthRequiredError";
  }
}

function getMsalErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/popup_window_error|popup.*block|BrowserAuthError.*popup/i.test(msg)) return "Pop-up geblokkeerd door de browser. Sta pop-ups toe en probeer opnieuw.";
  if (/redirect_uri|AADSTS50011/i.test(msg)) return "Redirect-URI niet (juist) geregistreerd in Azure. Voeg https://dashboard.e-charging.nl/redirect.html toe.";
  if (/AADSTS650051|AADSTS65001|consent/i.test(msg)) return "Toestemming (consent) ontbreekt voor de gevraagde rechten in Azure.";
  if (/user_cancelled|user_cancel/i.test(msg)) return "Inloggen geannuleerd.";
  return "Inloggen met Microsoft mislukt: " + msg;
}

export function useMicrosoftAuth() {
  const { instance, accounts } = useMsal();
  const isMsalAuthenticated = useIsAuthenticated();

  // Gememoïseerd: anders krijgt elke render een nieuwe account-referentie → getAccessToken/
  // graphFetch veranderen → effecten die daarvan afhangen (sites laden) blijven herladen.
  const account = useMemo(() => instance.getActiveAccount() ?? accounts[0] ?? null, [instance, accounts]);
  const isConnected = isMsalAuthenticated && !!account;

  const microsoftUser = useMemo(() => {
    if (!account) return null;
    return { name: account.name ?? "", email: account.username ?? "" };
  }, [account]);

  const login = useCallback(async () => {
    if (!msalConfigured) throw new Error("Microsoft-koppeling is nog niet geconfigureerd (VITE_MS_CLIENT_ID ontbreekt).");
    try {
      const result = await instance.loginPopup({
        scopes: graphScopes,
        prompt: "select_account",
        redirectUri: window.location.origin + "/redirect.html",
      });
      if (result?.account) instance.setActiveAccount(result.account);
    } catch (error) {
      throw new Error(getMsalErrorMessage(error));
    }
  }, [instance]);

  const logout = useCallback(async () => {
    await instance.logoutPopup({
      account: account ?? undefined,
      postLogoutRedirectUri: window.location.origin + "/redirect.html",
      mainWindowRedirectUri: window.location.href,
    });
  }, [instance, account]);

  // Stille koppeling na een Microsoft-app-login: probeer Graph-tokens te verkrijgen via de
  // bestaande Microsoft-sessie (ssoSilent), zónder extra prompt. Mislukt het (bv. browser
  // blokkeert de 3rd-party-cookie in het iframe), dan blijft de expliciete koppel-knop over.
  const connectSilently = useCallback(async (loginHint: string): Promise<boolean> => {
    if (!msalConfigured || !loginHint) return false;
    try {
      const result = await instance.ssoSilent({ scopes: graphScopes, loginHint });
      if (result?.account) instance.setActiveAccount(result.account);
      return true;
    } catch {
      return false;
    }
  }, [instance]);

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!account) throw new MicrosoftReauthRequiredError("Geen Microsoft-account verbonden");
    try {
      const response = await instance.acquireTokenSilent({ scopes: graphScopes, account });
      return response.accessToken;
    } catch (error) {
      // GEEN acquireTokenPopup hier: dit draait in een achtergrond-query, dus de popup wordt
      // geblokkeerd en de belofte blijft hangen. Meld het en laat de gebruiker klikken.
      if (error instanceof InteractionRequiredAuthError) throw new MicrosoftReauthRequiredError();
      throw error;
    }
  }, [instance, account]);

  // Interactief token vernieuwen. UITSLUITEND aanroepen vanuit een echte klik (knop), want
  // alleen dan mag de browser de popup openen. Dit is de tegenhanger van de fout hierboven.
  const reconnect = useCallback(async () => {
    if (!msalConfigured) throw new Error("Microsoft-koppeling is nog niet geconfigureerd (VITE_MS_CLIENT_ID ontbreekt).");
    try {
      const response = await instance.acquireTokenPopup({
        scopes: graphScopes,
        ...(account ? { account } : { prompt: "select_account" as const }),
        redirectUri: window.location.origin + "/redirect.html",
      });
      if (response?.account) instance.setActiveAccount(response.account);
    } catch (error) {
      throw new Error(getMsalErrorMessage(error));
    }
  }, [instance, account]);

  return { login, logout, reconnect, getAccessToken, connectSilently, isConnected, microsoftUser, account, configured: msalConfigured };
}
