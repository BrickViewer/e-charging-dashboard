import { supabase } from "@/integrations/supabase/client";

export async function getQuotes() {
  return supabase
    .from("quotes")
    .select("*, clients(company_name)")
    .order("created_at", { ascending: false });
}

export async function getQuoteById(id: string) {
  return supabase.from("quotes").select("*, clients(company_name)").eq("id", id).maybeSingle();
}

export async function createQuote(data: Record<string, any>) {
  return supabase.from("quotes").insert(data).select().single();
}

export async function updateQuoteStatus(id: string, status: string, extra?: Record<string, any>) {
  return supabase.from("quotes").update({ status, ...extra }).eq("id", id);
}
