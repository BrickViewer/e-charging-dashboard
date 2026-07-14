import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Eén rij per gepubliceerde blog: kijkers (Google Search Console) + kopers (attributie -> koper-keten).
// Bron: RPC public.blog_performance_overview (SECURITY DEFINER, intern personeel). numeric/bigint komen als
// string terug uit PostgREST, dus we coercen naar number.
export type BlogPerformanceRow = {
  blog_post_id: string;
  slug: string;
  title: string;
  category: string | null;
  published_at: string | null;
  clicks_all: number;
  impressions_all: number;
  avg_position: number | null;
  clicks_28d: number;
  impressions_28d: number;
  leads_count: number;
  won_count: number;
  pipeline_value: number;
  won_oneoff_value: number;
  realized_recurring: number;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export function useBlogPerformance() {
  return useQuery({
    queryKey: ["blog-performance-overview"],
    queryFn: async () => {
      // types.ts kent deze handgeschreven RPC niet; lokaal getypeerde cast (zelfde patroon als useMonthlyFinancialOverview).
      const rpcClient = supabase as unknown as {
        rpc(name: "blog_performance_overview"): Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("blog_performance_overview");
      if (error) throw error;
      return (data ?? []).map((r): BlogPerformanceRow => ({
        blog_post_id: String(r.blog_post_id),
        slug: String(r.slug),
        title: String(r.title ?? ""),
        category: (r.category as string) ?? null,
        published_at: (r.published_at as string) ?? null,
        clicks_all: num(r.clicks_all),
        impressions_all: num(r.impressions_all),
        avg_position: r.avg_position == null ? null : Number(r.avg_position),
        clicks_28d: num(r.clicks_28d),
        impressions_28d: num(r.impressions_28d),
        leads_count: num(r.leads_count),
        won_count: num(r.won_count),
        pipeline_value: num(r.pipeline_value),
        won_oneoff_value: num(r.won_oneoff_value),
        realized_recurring: num(r.realized_recurring),
      }));
    },
  });
}

// Handmatig de Search Console-cijfers ophalen (naast de dagelijkse cron). Draait de edge blog-search-console.
export function useRefreshGsc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days = 30) => {
      const { data, error } = await supabase.functions.invoke("blog-search-console", { body: { days } });
      if (error) throw error;
      return data as { status?: string; message?: string; blog_metric_rows?: number; kennisbank_pages?: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog-performance-overview"] });
      qc.invalidateQueries({ queryKey: ["blog-gsc-last-run"] });
    },
  });
}

// Laatste run van de GSC-ophaal (cron of handmatig). De edge logt elke run naar content_engine_events;
// pg_net bewaart cron-responses maar kort, dus dit is de enige blijvende bron van "draait het, en wat kwam er binnen".
export type GscRunDetail = {
  days?: number;
  start?: string;
  end?: string;
  metric_rows?: number;
  query_rows?: number;
  kennisbank_pages?: number;
  total_page_rows?: number;
  site_clicks?: number;
  site_impressions?: number;
  message?: string;
};

export type GscLastRun = {
  at: string;
  ok: boolean;
  detail: GscRunDetail;
};

export function useGscLastRun() {
  return useQuery({
    queryKey: ["blog-gsc-last-run"],
    queryFn: async (): Promise<GscLastRun | null> => {
      const { data, error } = await supabase
        .from("content_engine_events")
        .select("at, step, detail")
        .eq("fn", "blog-search-console")
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        at: data.at,
        ok: data.step === "run_ok",
        detail: (data.detail as GscRunDetail) ?? {},
      };
    },
  });
}

// ── INDEXERINGSSTATUS (GSC URL Inspection) ─────────────────────────────────────
export type BlogIndexRow = {
  url: string;
  blog_post_id: string | null;
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_state: string | null;
  page_fetch_state: string | null;
  google_canonical: string | null;
  last_crawl_time: string | null;
  checked_at: string | null;
};

export function useBlogIndexStatus() {
  return useQuery({
    queryKey: ["blog-index-status"],
    queryFn: async () => {
      const rpcClient = supabase as unknown as {
        rpc(name: "blog_index_status_overview"): Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>;
      };
      const { data, error } = await rpcClient.rpc("blog_index_status_overview");
      if (error) throw error;
      return (data ?? []).map((r): BlogIndexRow => ({
        url: String(r.url),
        blog_post_id: (r.blog_post_id as string) ?? null,
        verdict: (r.verdict as string) ?? null,
        coverage_state: (r.coverage_state as string) ?? null,
        indexing_state: (r.indexing_state as string) ?? null,
        robots_state: (r.robots_state as string) ?? null,
        page_fetch_state: (r.page_fetch_state as string) ?? null,
        google_canonical: (r.google_canonical as string) ?? null,
        last_crawl_time: (r.last_crawl_time as string) ?? null,
        checked_at: (r.checked_at as string) ?? null,
      }));
    },
  });
}

export type IndexStatusResponse = {
  status?: string;
  message?: string;
  checked?: number;
  indexed?: number;
  not_indexed?: number;
  service_account?: string;
  sitemap?: { path?: string | null; lastSubmitted?: string | null; lastDownloaded?: string | null; errors?: number; warnings?: number; submitted?: string | null; indexed?: string | null; note?: string; error?: string } | null;
  sitemap_submit?: { ok?: boolean; status?: number; message?: string } | null;
};

// Indexeringsstatus verversen (URL Inspection) + optioneel de sitemap (her)indienen. Draait edge blog-index-status.
export function useRefreshIndexStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { submitSitemap?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("blog-index-status", {
        body: { submit_sitemap: opts?.submitSitemap === true },
      });
      if (error) throw error;
      return data as IndexStatusResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog-index-status"] });
    },
  });
}

// "Zelf indexering aanvragen" voor Bing/AI-engines (Google heeft geen API hiervoor): pingt alle huidige URLs naar IndexNow.
export function useIndexNowPing() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("blog-indexnow", { body: { all: true } });
      if (error) throw error;
      return data as { status?: string; message?: string; indexnow_http?: number; count?: number };
    },
  });
}
