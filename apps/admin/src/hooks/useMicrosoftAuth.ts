import { useCallback, useMemo } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { graphScopes, msalConfigured } from "@/lib/msal";

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

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error("Geen Microsoft-account verbonden");
    try {
      const response = await instance.acquireTokenSilent({ scopes: graphScopes, account });
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const response = await instance.acquireTokenPopup({
          scopes: graphScopes,
          account,
          redirectUri: window.location.origin + "/redirect.html",
        });
        return response.accessToken;
      }
      throw error;
    }
  }, [instance, account]);

  return { login, logout, getAccessToken, isConnected, microsoftUser, account, configured: msalConfigured };
}
