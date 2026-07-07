import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadViewState } from "@/hooks/useLeadViewState";

// Per-gebruiker opgeslagen weergaven, bewaard in Supabase Auth user_metadata
// (zelfde persistentie-patroon als useAdminTheme) — geen extra tabel nodig.
export type SavedLeadView = { name: string; state: Partial<LeadViewState> };

export function useSavedLeadViews() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["saved-lead-views"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const raw = (data.user?.user_metadata as { lead_views?: SavedLeadView[] } | undefined)?.lead_views;
      return Array.isArray(raw) ? raw : [];
    },
  });
  const save = useMutation({
    mutationFn: async (views: SavedLeadView[]) => {
      const { error } = await supabase.auth.updateUser({ data: { lead_views: views } });
      if (error) throw error;
      return views;
    },
    onSuccess: (views) => qc.setQueryData(["saved-lead-views"], views),
  });

  const list = q.data ?? [];
  const upsert = (name: string, state: Partial<LeadViewState>) =>
    save.mutateAsync([...list.filter((v) => v.name !== name), { name, state }]);
  const remove = (name: string) => save.mutateAsync(list.filter((v) => v.name !== name));

  return { views: list, upsert, remove, saving: save.isPending };
}
