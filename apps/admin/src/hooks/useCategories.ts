import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";

// blog_categories + de overview-RPC staan (nog) niet in de gegenereerde Database-types. Cast bewust zodat we
// de types niet volledig hoeven te regenereren (en zo andere lopende wijzigingen in types.ts niet overschrijven).
// deno-lint-ignore no-explicit-any
const db = supabase as any;

// DB-gedreven categorie-taxonomie (tabel blog_categories) — vervangt de hardgecodeerde lijst in blogTaxonomy.ts.
// Publiek leesbaar (RLS), schrijven alleen intern/admin/marketing. blog_categories_overview() geeft ook de
// post-tellingen voor het beheer-overzicht. De auto-blog-engine kan hier zelf categorieën aan toevoegen.
export type BlogCategoryRow = {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  post_count?: number;
};

export function useCategories() {
  return useQuery({
    queryKey: ["blog-categories"],
    queryFn: async () => {
      // Overzicht met post-tellingen (SECURITY DEFINER, is_internal-guard).
      const { data, error } = await db.rpc("blog_categories_overview");
      if (error) throw error;
      return (data ?? []) as BlogCategoryRow[];
    },
  });
}

// Alleen de actieve categorieën, gesorteerd — voor keuzelijsten (editor, onderwerpen).
export function useActiveCategories() {
  const q = useCategories();
  return { ...q, data: (q.data ?? []).filter((c) => c.is_active) };
}

export type CategoryInput = {
  slug?: string; // bij bewerken: bestaande slug; bij aanmaken: afgeleid van de naam
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export function useUpsertCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const slug = (input.slug && input.slug.trim()) || slugify(input.name);
      if (!slug) throw new Error("Naam levert geen geldige slug op");
      const row = {
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        icon: input.icon?.trim() || null,
        sort_order: Number.isFinite(input.sort_order) ? Number(input.sort_order) : 100,
        is_active: input.is_active ?? true,
      };
      const { error } = await db.from("blog_categories").upsert(row, { onConflict: "slug" });
      if (error) throw error;
      return slug;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog-categories"] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { error } = await db.from("blog_categories").delete().eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blog-categories"] }),
  });
}
