import { useCallback } from "react";
import { useMicrosoftAuth } from "./useMicrosoftAuth";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export type GraphFetchOptions = RequestInit & { headers?: Record<string, string> };
// Graph-responses zijn dynamisch JSON; bewust losjes getypeerd.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GraphFetchFn = (endpoint: string, options?: GraphFetchOptions) => Promise<any>;

export function useGraphApi() {
  const { getAccessToken, isConnected } = useMicrosoftAuth();

  const graphFetch = useCallback<GraphFetchFn>(
    async (endpoint, options = {}) => {
      const token = await getAccessToken();
      const url = endpoint.startsWith("http") ? endpoint : `${GRAPH_BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (!response.ok) {
        // Body wel uitlezen (stream sluiten), maar niet naar UI lekken.
        await response.text().catch(() => "");
        throw new Error(`Microsoft Graph-verzoek mislukt (status ${response.status}).`);
      }
      const text = await response.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch { return null; }
    },
    [getAccessToken],
  );

  return { graphFetch, isConnected };
}
