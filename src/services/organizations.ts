import { supabase } from "@/integrations/supabase/client";

export async function getOrganization() {
  return supabase.from("organizations").select("*").limit(1).maybeSingle();
}

export async function updateOrganization(id: string, data: Record<string, any>) {
  return supabase.from("organizations").update(data).eq("id", id).select().single();
}
