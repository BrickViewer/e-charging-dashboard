import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type LeadTag = Database["public"]["Tables"]["lead_tags"]["Row"];

// Standaard kleurenpalet voor nieuwe tags (hex; los van Tailwind zodat elke kleur kan).
export const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#6b7280",
];

// Witte of donkere tekst kiezen o.b.v. de achtergrondkleur (leesbaarheid van de chip).
export function tagTextColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  // relatieve helderheid; lichte achtergrond → donkere tekst.
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1f2937" : "#ffffff";
}

export function useLeadTags() {
  return useQuery({
    queryKey: ["lead_tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_tags").select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadTag[];
    },
  });
}

export function useCreateLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organization_id, name, color }: { organization_id: string; name: string; color: string }) => {
      const { data, error } = await supabase
        .from("lead_tags")
        .insert({ organization_id, name: name.trim(), color })
        .select("*")
        .single();
      if (error) throw error;
      return data as LeadTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_tags"] }),
  });
}

export function useDeleteLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_tags"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// Zet de volledige set tags van een lead (diff: voeg ontbrekende toe, verwijder overbodige).
export function useSetLeadTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, tagIds }: { leadId: string; tagIds: string[] }) => {
      const { data: existing, error: e1 } = await supabase.from("lead_tag_links").select("tag_id").eq("lead_id", leadId);
      if (e1) throw e1;
      const cur = new Set((existing ?? []).map((r) => r.tag_id));
      const next = new Set(tagIds);
      const toAdd = tagIds.filter((t) => !cur.has(t));
      const toRemove = [...cur].filter((t) => !next.has(t));
      if (toAdd.length) {
        const { error } = await supabase.from("lead_tag_links").insert(toAdd.map((tag_id) => ({ lead_id: leadId, tag_id })));
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase.from("lead_tag_links").delete().eq("lead_id", leadId).in("tag_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}
