import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { slugify } from "@/lib/slug";
import { categorySlug } from "@/lib/blogTaxonomy";

// Content-pijplijn: onderwerp-wachtrij (content_topics) die voedt naar concept-blogs.
// De generatie zelf draait skill-gedreven (Claude); hier alleen de CRUD + review-flow.

// discussed_at is toegevoegd in migratie 20260625190000 (onderwerpen-inbox); de gegenereerde types worden
// pas later ververst, dus hier lokaal aanvullen (Row/Update) i.p.v. types.ts met de hand bewerken.
export type ContentTopic = Database["public"]["Tables"]["content_topics"]["Row"] & {
  discussed_at?: string | null;
  source_published_at?: string | null;
  agenda_at?: string | null;
  // SEO-blogmotor (lokaal aangevuld tot types.ts is geregenereerd)
  matched_keyword_id?: string | null;
  match_strength?: number | null;
  seo_opportunity?: number | null;
  conversation_question?: string | null;
  background?: string | null;
  suggested_angle?: string | null;
  brief_generated_at?: string | null;
};
export type ContentTopicInsert = Database["public"]["Tables"]["content_topics"]["Insert"];
export type ContentTopicUpdate = Database["public"]["Tables"]["content_topics"]["Update"];

export const TOPIC_STATUSES = [
  "idea", "approved_for_draft", "drafting", "drafted", "scheduled", "published", "rejected",
] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const TOPIC_STATUS_LABEL: Record<string, string> = {
  idea: "Idee",
  approved_for_draft: "Goedgekeurd",
  drafting: "Schrijven",
  drafted: "Concept klaar",
  scheduled: "Gepland",
  published: "Gepubliceerd",
  rejected: "Afgewezen",
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Handmatig",
  web_research: "Web-research",
  rss: "RSS/nieuws",
  competitor: "Concurrent",
};

export function useContentTopics() {
  return useQuery({
    queryKey: ["content-topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_topics")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentTopic[];
    },
  });
}

export function useContentTopic(id: string | undefined) {
  return useQuery({
    queryKey: ["content-topic", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("content_topics").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as ContentTopic | null;
    },
  });
}

export type TopicSource = "manual" | "web_research" | "rss" | "competitor";

export type NewTopicInput = {
  raw_title: string;
  raw_summary?: string | null;
  source_type?: TopicSource;
  source_url?: string | null;
  target_keyword?: string | null;
  assigned_category?: string | null;
};

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTopicInput) => {
      const title = input.raw_title.trim();
      if (!title) throw new Error("Titel is verplicht");
      const patch: ContentTopicInsert = {
        raw_title: title,
        raw_summary: input.raw_summary?.trim() || null,
        source_type: (input.source_type as string) || "manual",
        source_url: input.source_url?.trim() || null,
        novelty_key: slugify(title),
        target_keyword: input.target_keyword?.trim() || null,
        assigned_category: input.assigned_category || null,
        assigned_category_slug: input.assigned_category ? categorySlug(input.assigned_category) : null,
        generated_by: "human",
        status: "idea",
      };
      const { data, error } = await supabase.from("content_topics").insert(patch).select("id").single();
      if ((error as { code?: string } | null)?.code === "23505") {
        throw new Error("Er bestaat al een onderwerp met (vrijwel) deze titel.");
      }
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-topics"] }),
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ContentTopicUpdate }) => {
      const { error } = await supabase.from("content_topics").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["content-topic", id] });
    },
  });
}

// Onderwerpen-inbox: markeer een topic als besproken (of weer open).
export function useMarkTopicDiscussed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, discussed }: { id: string; discussed: boolean }) => {
      const { error } = await supabase
        .from("content_topics")
        .update({ discussed_at: discussed ? new Date().toISOString() : null } as unknown as ContentTopicUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["content-topic", id] });
    },
  });
}

// Stap 1 -> stap 2: onderwerp op de agenda zetten (of er weer af halen).
export function useSetAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await supabase
        .from("content_topics")
        .update({ agenda_at: on ? new Date().toISOString() : null } as unknown as ContentTopicUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-topics"] }),
  });
}

// Onderwerp negeren (uit de pool halen).
export function useIgnoreTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_topics")
        .update({ status: "rejected", rejected_reason: "genegeerd" } as unknown as ContentTopicUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-topics"] }),
  });
}

// Naam-map (user_id → volledige naam) om de inbrenger van een onderwerp te tonen.
export function useProfileNames() {
  return useQuery({
    queryKey: ["profile-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as { user_id: string; full_name: string | null }[]) {
        if (p.user_id && p.full_name) map[p.user_id] = p.full_name;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-topics"] }),
  });
}

// Opname-naar-blog: stuurt het transcript naar de edge `recording-to-blog`, die een blog-CONCEPT
// klaarzet in de bestaande blogs-module (via content_ingest_draft) en het blog_post_id teruggeeft.
export function useGenerateBlogFromRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; recorded_on?: string | null; transcript: string; topic_id?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("recording-to-blog", {
        body: { title: input.title, recorded_on: input.recorded_on ?? null, transcript: input.transcript, topic_id: input.topic_id ?? null },
      });
      if (error) throw new Error(error.message || "Genereren mislukt");
      const r = data as { status: string; blog_post_id?: string; message?: string };
      if (r.status !== "ok" || !r.blog_post_id) throw new Error(r.message || "Genereren mislukt");
      return r.blog_post_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
    },
  });
}

// ---- Content-engine instellingen (feeds, concurrenten, drempels, kill-switch) ----

export type ContentEngineSettings = {
  discovery_enabled?: boolean;
  generation_enabled?: boolean;
  min_quality?: number;
  min_seo?: number;
  min_aeo?: number;
  novelty_threshold?: number;
  feeds?: { url: string; name?: string }[];
  competitors?: { sitemap?: string; url?: string; name?: string }[];
  channels?: { linkedin?: boolean; newsletter?: boolean };
  newsletter_recipients?: string[];
  last_discovery_at?: string;
  // SEO-blogmotor
  keyword_seeds?: { term: string; cluster?: string; audience?: string }[];
  last_keyword_research_at?: string;
  last_research_at?: string;
  generation_model?: string;
  generation_max_tokens?: number;
  author?: { name?: string; role?: string; url?: string; sameAs?: string[]; bio?: string };
  last_metrics_at?: string;
  last_serp_gap_at?: string;
  last_cluster_at?: string;
  // Autoblog (autonome blog-tak)
  autoblog_enabled?: boolean;
  autoblog_autopublish?: boolean;
  autoblog_per_run?: number;
  last_autoblog_at?: string;
  autoblog_schedule?: { days: number[]; hour: number };
  notify_email?: string;
  autoblog_target_quality?: number;
  autoblog_target_seo_aeo?: number;
};

// ---- Zoekvragen van de doelgroep (content_keywords, Laag A) ----

export type ContentKeyword = {
  id: string;
  query: string;
  cluster: string | null;
  intent: string;
  audience: string | null;
  source: string;
  priority: number;
  times_seen: number;
  status: string;
  search_volume?: number | null;
  keyword_difficulty?: number | null;
  opportunity?: number | null;
  serp_gap?: number | null;
  serp_notes?: string | null;
  is_pillar?: boolean | null;
};

export const INTENT_LABEL: Record<string, string> = {
  informational: "Informatief",
  commercial: "Commercieel",
  transactional: "Transactioneel",
  navigational: "Navigatie",
};

export function useContentKeywords() {
  return useQuery({
    queryKey: ["content-keywords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_keywords")
        .select("id, query, cluster, intent, audience, source, priority, times_seen, status, search_volume, keyword_difficulty, opportunity, serp_gap, serp_notes, is_pillar")
        .eq("status", "active")
        .order("opportunity", { ascending: false, nullsFirst: false })
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentKeyword[];
    },
  });
}

// Zoekvraag-onderzoek nu draaien (content-keyword-research): Google Autocomplete -> content_keywords.
export function useRunKeywordResearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("content-keyword-research", { body: {} });
      if (error) throw new Error(error.message || "Onderzoek mislukt");
      return data as { status: string; created?: number; skipped?: number; errors?: number; message?: string } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-keywords"] });
      qc.invalidateQueries({ queryKey: ["content-settings"] });
    },
  });
}

// Nieuwsagent nu draaien (content-discovery, force). Hergebruikt door de weekflow-stap en de instellingen.
export function useRunDiscovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("content-discovery", { body: { force: true } });
      if (error) throw new Error(error.message || "Ophalen mislukt");
      return data as { created?: number; skipped?: number; errors?: number } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["content-settings"] });
    },
  });
}

// Gespreksvraag + achtergrond genereren (content-brief, Laag C). Slaapt zonder Claude-sleutel.
export function useGenerateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (topicId: string) => {
      const { data, error } = await supabase.functions.invoke("content-brief", { body: { topic_id: topicId } });
      if (error) throw new Error(error.message || "Briefing mislukt");
      return data as { status: string; generated?: number; message?: string } | null;
    },
    onSuccess: (_d, topicId) => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["content-topic", topicId] });
    },
  });
}

// Onderwerpen verzamelen via Claude-web-research (content-research). Slaapt zonder Claude-sleutel.
export function useRunResearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("content-research", { body: {} });
      if (error) throw new Error(error.message || "Verzamelen mislukt");
      return data as { status: string; found?: number; created?: number; skipped?: number; message?: string } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["content-settings"] });
    },
  });
}

// Autoblog (autonome blog-tak): laat de edge `content-autoblog` een blog genereren uit de best-scorende
// onderwerpen. Met {force:true, publish:false} = altijd een concept ter review (testknop in de instellingen).
export type AutoblogResult = {
  status: string;
  generated?: number;
  published?: number;
  concepts?: number;
  errors?: number;
  results?: { topic_id: string; blog_post_id?: string; slug?: string; review_state?: string; action: string; reason?: string }[];
  message?: string;
};

export function useRunAutoblog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { force?: boolean; publish?: boolean; topic_id?: string; limit?: number } = {}) => {
      const { data, error } = await supabase.functions.invoke("content-autoblog", { body });
      if (error) throw new Error(error.message || "Autoblog mislukt");
      return data as AutoblogResult | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-topics"] });
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
      qc.invalidateQueries({ queryKey: ["content-settings"] });
    },
  });
}

// SEO-data-laag (DataForSEO/Claude). Elke hook slaapt netjes (no_key) zonder de bijbehorende sleutel.
function invokeEdge(qc: ReturnType<typeof useQueryClient>, fn: string) {
  return async () => {
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    if (error) throw new Error(error.message || "Mislukt");
    return data as { status: string; message?: string; enriched?: number; checked?: number; clustered?: number } | null;
  };
}
export function useRunMetrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: invokeEdge(qc, "content-metrics"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["content-keywords"] }); qc.invalidateQueries({ queryKey: ["content-topics"] }); qc.invalidateQueries({ queryKey: ["content-settings"] }); },
  });
}
export function useRunSerpGap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: invokeEdge(qc, "content-serp-gap"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["content-keywords"] }); qc.invalidateQueries({ queryKey: ["content-topics"] }); qc.invalidateQueries({ queryKey: ["content-settings"] }); },
  });
}
export function useRunClustering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: invokeEdge(qc, "content-cluster"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["content-keywords"] }); qc.invalidateQueries({ queryKey: ["content-settings"] }); },
  });
}

export function useContentSettings() {
  return useQuery({
    queryKey: ["content-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_engine_settings")
        .select("id, settings")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; settings: ContentEngineSettings } | null;
    },
  });
}

export function useUpdateContentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, settings }: { id: string; settings: ContentEngineSettings }) => {
      const { error } = await supabase.from("content_engine_settings").update({ settings: settings as unknown as Json }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-settings"] }),
  });
}
