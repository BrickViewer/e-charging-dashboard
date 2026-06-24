import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { slugify } from "@/lib/slug";
import { categorySlug } from "@/lib/blogTaxonomy";

// Content-pijplijn: onderwerp-wachtrij (content_topics) die voedt naar concept-blogs.
// De generatie zelf draait skill-gedreven (Claude); hier alleen de CRUD + review-flow.

export type ContentTopic = Database["public"]["Tables"]["content_topics"]["Row"];
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
