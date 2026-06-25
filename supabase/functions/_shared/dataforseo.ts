// Gedeelde DataForSEO-helper voor de SEO-data-laag. Slaapt netjes als er geen sleutels zijn: getDataForSeoAuth
// geeft dan null en de aanroeper valt terug op no_key. REST + Basic auth; secrets alleen op NAAM (env of Vault).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveSecret } from "./secrets.ts";

const BASE = "https://api.dataforseo.com/v3";
const NL = { location_name: "Netherlands", language_name: "Dutch" };

export async function getDataForSeoAuth(sb: any): Promise<string | null> {
  const login = await resolveSecret(sb, ["DATAFORSEO_LOGIN"], "dataforseo_login");
  const password = await resolveSecret(sb, ["DATAFORSEO_PASSWORD"], "dataforseo_password");
  if (!login || !password) return null;
  return btoa(`${login}:${password}`);
}

// Eén POST-task; retourneert het result-array (of []). Retry met backoff op 429/5xx.
async function call(auth: string, path: string, task: Record<string, unknown>, retries = 2): Promise<any[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ ...NL, ...task }]),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`DataForSEO HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      } else {
        const data = await res.json();
        return data?.tasks?.[0]?.result ?? [];
      }
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(to);
    }
    await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("DataForSEO-aanroep mislukt");
}

export type VolumeRow = { keyword: string; search_volume: number | null; cpc: number | null; competition: number | null };
export type KdRow = { keyword: string; keyword_difficulty: number | null };
export type SerpItem = { title: string; url: string; domain: string; description: string; rank: number };

// Maandelijks zoekvolume + cpc + competitie (Google Ads). Max ~700 keywords per call.
export async function fetchSearchVolume(auth: string, keywords: string[]): Promise<VolumeRow[]> {
  const result = await call(auth, "/keywords_data/google_ads/search_volume/live", { keywords });
  return (result ?? []).map((r: any) => ({
    keyword: r.keyword,
    search_volume: typeof r.search_volume === "number" ? r.search_volume : null,
    cpc: typeof r.cpc === "number" ? r.cpc : null,
    competition: typeof r.competition_index === "number" ? r.competition_index : (typeof r.competition === "number" ? r.competition : null),
  }));
}

// Keyword-difficulty 0..100 (DataForSEO Labs). Max ~1000 keywords per call.
export async function fetchKeywordDifficulty(auth: string, keywords: string[]): Promise<KdRow[]> {
  const result = await call(auth, "/dataforseo_labs/google/bulk_keyword_difficulty/live", { keywords });
  const items = (result?.[0]?.items ?? result ?? []) as any[];
  return items.map((r: any) => ({
    keyword: r.keyword,
    keyword_difficulty: typeof r.keyword_difficulty === "number" ? r.keyword_difficulty : null,
  }));
}

// Top-10 organische SERP voor één zoekwoord (voor content-gap-analyse).
export async function fetchSerp(auth: string, keyword: string): Promise<SerpItem[]> {
  const result = await call(auth, "/serp/google/organic/live/advanced", { keyword, depth: 10 });
  const items = (result?.[0]?.items ?? []) as any[];
  return items
    .filter((i: any) => i?.type === "organic")
    .slice(0, 10)
    .map((i: any) => ({
      title: i.title ?? "",
      url: i.url ?? "",
      domain: i.domain ?? "",
      description: i.description ?? i.snippet ?? "",
      rank: typeof i.rank_group === "number" ? i.rank_group : 0,
    }));
}
