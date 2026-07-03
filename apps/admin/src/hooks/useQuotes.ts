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
        .select("id, quote_number, prospect_company, prospect_contact, company_id, status, total_hardware_cost, total_installation_cost, valid_until, created_at, lead_id, client_id, internal_signer_name, internal_signer_user_id, num_charge_points, with_installation, with_management")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Quote, "id" | "quote_number" | "prospect_company" | "prospect_contact" | "company_id" | "status" | "total_hardware_cost" | "total_installation_cost" | "valid_until" | "created_at" | "lead_id" | "client_id" | "internal_signer_name" | "internal_signer_user_id" | "num_charge_points" | "with_installation" | "with_management">[];
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
        .select("id, quote_number, status, total_hardware_cost, total_installation_cost, with_management, with_installation, created_at")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Quote, "id" | "quote_number" | "status" | "total_hardware_cost" | "total_installation_cost" | "with_management" | "with_installation" | "created_at">[];
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
    mutationFn: async ({ leadId, projectLocationId }: { leadId: string; projectLocationId?: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ quoteId: string; quoteNumber: string }>(
        "quote-create-from-lead",
        { body: { lead_id: leadId, project_location_id: projectLocationId ?? undefined } },
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

// Maakt een losse (standalone) offerte voor een object, los van een lead.
export function useCreateQuoteStandalone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectLocationId, companyId, personId }: { projectLocationId: string; companyId?: string | null; personId?: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ quoteId: string; quoteNumber: string }>(
        "quote-create",
        { body: { project_location_id: projectLocationId, company_id: companyId ?? undefined, person_id: personId ?? undefined } },
      );
      if (error) throw error;
      if (!data?.quoteId) throw new Error("Offerte aanmaken mislukt");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["project-locations"] });
    },
  });
}

export type AwaitingClientQuote = {
  id: string;
  quote_number: string | null;
  prospect_company: string | null;
  prospect_contact: string | null;
  prospect_email: string | null;
  company_id: string | null;
  person_id: string | null;
  lead_id: string | null;
  project_location_id: string | null;
  total_hardware_cost: number | null;
  total_installation_cost: number | null;
  charge_rate_per_kwh: number | null;
  energy_cost_per_kwh: number | null;
  with_management: boolean | null;
  with_installation: boolean | null;
  calculation_snapshot: unknown;
  offer_details: unknown;
  created_at: string;
};

// Getekende offertes die nog géén klantaccount hebben → de "Klant aanmaken"-stap in onboarding.
export function useSignedQuotesAwaitingClient() {
  return useQuery({
    queryKey: ["quotes", "awaiting-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, prospect_company, prospect_contact, prospect_email, company_id, person_id, lead_id, project_location_id, total_hardware_cost, total_installation_cost, charge_rate_per_kwh, energy_cost_per_kwh, with_management, with_installation, calculation_snapshot, offer_details, created_at")
        .eq("status", "getekend")
        .is("client_id", null)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      const quotes = (data ?? []) as unknown as AwaitingClientQuote[];
      if (quotes.length === 0) return quotes;
      // Offertes die al een installatie-order hebben (o.a. het order-only pad voor alleen-installatie)
      // horen niet meer in de "klant aanmaken"-intake.
      const { data: ordered } = await supabase
        .from("installation_orders")
        .select("quote_id")
        .in("quote_id", quotes.map((q) => q.id));
      const withOrder = new Set((ordered ?? []).map((o) => o.quote_id as string));
      return quotes.filter((q) => !withOrder.has(q.id));
    },
  });
}

// Maakt het klantaccount aan vanuit een getekende offerte met gereviewde gegevens.
export function useCreateClientFromQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, client, targetClientId }: { quoteId: string; client: Record<string, unknown>; targetClientId?: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ clientId: string; clientNumber: number | null }>(
        "quote-create-client",
        { body: { quote_id: quoteId, client, target_client_id: targetClientId ?? null } },
      );
      if (error) throw error;
      if (!data?.clientId) throw new Error("Klantaccount aanmaken mislukt");
      return data;
    },
    onSuccess: (_d, { quoteId }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", quoteId] });
      qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useSendQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, email, pdfBase64, internalSelfSign, internalSignatureDataUrl }: { quoteId: string; email?: string; pdfBase64?: string; internalSelfSign?: boolean; internalSignatureDataUrl?: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; message?: string; acceptUrl?: string }>(
        "quote-send",
        { body: { quote_id: quoteId, email, pdf_base64: pdfBase64, internal_self_sign: internalSelfSign, internal_signature_data_url: internalSignatureDataUrl } },
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

// Stuurt de offerte ter ondertekening naar de gekozen interne ondertekenaar (een ander dan jij).
export function useRequestSignoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId }: { quoteId: string }) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; message?: string; to?: string }>(
        "quote-request-signoff",
        { body: { quote_id: quoteId } },
      );
      if (error) throw error;
      if (data?.status && data.status !== "requested") throw new Error(data.message || "Versturen ter ondertekening mislukt");
      return data;
    },
    onSuccess: (_d, { quoteId }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", quoteId] });
    },
  });
}

// Mint een verse ondertekenlink voor de TOEGEWEZEN ondertekenaar (in-app), zonder e-mail.
export function useInternalSignLink() {
  return useMutation({
    mutationFn: async ({ quoteId }: { quoteId: string }): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<{ status: string; message?: string; token?: string }>(
        "quote-internal-sign-link",
        { body: { quote_id: quoteId } },
      );
      if (error) throw error;
      if (data?.status !== "ok" || !data.token) throw new Error(data?.message || "Ondertekenlink aanmaken mislukt");
      return data.token;
    },
  });
}
