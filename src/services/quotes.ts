import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export async function getQuotes() {
  return supabase
    .from("quotes")
    .select("*, clients(company_name)")
    .order("created_at", { ascending: false });
}

export async function getQuoteById(id: string) {
  return supabase.from("quotes").select("*, clients(company_name)").eq("id", id).maybeSingle();
}

export async function createQuote(data: TablesInsert<"quotes">) {
  return supabase.from("quotes").insert(data).select().single();
}

export async function updateQuoteStatus(id: string, status: string, extra?: Record<string, any>) {
  const updateData: any = { status, ...extra };
  return supabase.from("quotes").update(updateData).eq("id", id);
}
