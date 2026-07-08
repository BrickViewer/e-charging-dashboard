import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BlogPost = Database["public"]["Tables"]["blog_posts"]["Row"];
export type BlogPostInsert = Database["public"]["Tables"]["blog_posts"]["Insert"];
export type BlogPostUpdate = Database["public"]["Tables"]["blog_posts"]["Update"];
export const BLOG_STATUSES = ["concept", "gepubliceerd", "gearchiveerd"] as const;

export type BlogListItem = Pick<
  BlogPost,
  "id" | "slug" | "title" | "excerpt" | "status" | "category" | "tags" | "featured" | "cover_image_url" | "published_at" | "updated_at" | "author_name"
  | "quality_score" | "seo_score" | "aeo_score" | "review_state"
>;

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, status, category, tags, featured, cover_image_url, published_at, updated_at, author_name, quality_score, seo_score, aeo_score, review_state")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlogListItem[];
    },
  });
}

export function useBlogPost(id: string | undefined) {
  return useQuery({
    queryKey: ["blog-post", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as BlogPost | null;
    },
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: BlogPostInsert) => {
      const { data, error } = await supabase.from("blog_posts").insert(patch).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog-posts"] }),
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: BlogPostUpdate }) => {
      const { error } = await supabase.from("blog_posts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
      qc.invalidateQueries({ queryKey: ["blog-post", id] });
    },
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog-posts"] }),
  });
}

// Upload een afbeelding naar de publieke blog-media-bucket → publieke URL.
export async function uploadBlogImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${crypto.randomUUID()}.${ext || "png"}`;
  const { error } = await supabase.storage.from("blog-media").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from("blog-media").getPublicUrl(path).data.publicUrl;
}
