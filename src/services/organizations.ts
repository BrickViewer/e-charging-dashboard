import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

export async function getOrganization() {
  return supabase.from("organizations").select("*").limit(1).maybeSingle();
}

export async function updateOrganization(id: string, data: TablesUpdate<"organizations">) {
  return supabase.from("organizations").update(data).eq("id", id).select().single();
}
