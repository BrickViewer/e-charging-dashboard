import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectLocation = Database["public"]["Tables"]["project_locations"]["Row"];

export function useProjectLocationsByClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*").eq("client_id", clientId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectLocation[];
    },
  });
}

export function useProjectLocationsByCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*").eq("company_id", companyId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectLocation[];
    },
  });
}
