import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Quote = Database["public"]["Tables"]["quotes"]["Row"];
export type QuoteUpdate = Database["public"]["Tables"]["quotes"]["Update"];
export type QuoteLineItem = { description: string; qty: number; unit_price: number; total: number };

export function lineItemsOf(quote: Pick<Quote, "line_items">): QuoteLineItem[] {
  return Array.isArray(quote.line_items) ? (quote.line_items as unknown as QuoteLineItem[]) : [];
}

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, prospect_company, status, total_hardware_cost, total_installation_cost, valid_until, created_at, lead_id, client_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Quote, "id" | "quote_number" | "prospect_company" | "status" | "total_hardware_cost" | "total_installation_cost" | "valid_until" | "created_at" | "lead_id" | "client_id">[];
    },
  });
}

export function useLeadQuotes(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-quotes", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, status, total_hardware_cost, total_installation_cost, with_management, created_at")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Quote, "id" | "quote_number" | "status" | "total_hardware_cost" | "total_installation_cost" | "with_management" | "created_at">[];
    },
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ["quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Quote | null;
    },
  });
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: QuoteUpdate }) => {
      const { error } = await supabase.from("quotes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", id] });
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["lead-quotes"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
    },
  });
}

export function useCreateQuoteFromLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke<{ quoteId: string; quoteNumber: string }>(
        "quote-create-from-lead",
        { body: { lead_id: leadId } },
      );
      if (error) throw error;
      if (!data?.quoteId) throw new Error("Offerte aanmaken mislukt");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useSendQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, email, pdfBase64 }: { quoteId: string; email?: string; pdfBase64?: string }) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; message?: string; acceptUrl?: string }>(
        "quote-send",
        { body: { quote_id: quoteId, email, pdf_base64: pdfBase64 } },
      );
      if (error) throw error;
      if (data?.status && data.status !== "sent") throw new Error(data.message || "Versturen mislukt");
      return data;
    },
    onSuccess: (_d, { quoteId }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", quoteId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
