import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requiredPlaceholders } from "@/services/emailTemplates";

export interface EmailTemplateRow {
  key: string;
  slots: Record<string, string>;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

/** Alle ingestelde sjablonen. Een sleutel die hier ontbreekt draait op de standaardtekst. */
export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async (): Promise<EmailTemplateRow[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("key, slots, enabled, updated_at, updated_by");
      if (error) throw error;
      return (data ?? []) as EmailTemplateRow[];
    },
  });
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; slots: Record<string, string>; enabled?: boolean }) => {
      // Alleen daadwerkelijk ingevulde slots opslaan; leeg = standaardtekst gebruiken.
      const slots = Object.fromEntries(
        Object.entries(v.slots).filter(([, tekst]) => typeof tekst === "string" && tekst.trim().length > 0),
      );
      // De verplichte placeholders gaan mee zodat de RPC ze SERVER-SIDE afdwingt; de UI
      // controleert al eerder, maar die controle alleen zou omzeilbaar zijn.
      const rpcClient = supabase as unknown as {
        rpc(name: "save_email_template", args: {
          p_key: string; p_slots: Record<string, string>; p_required: string[]; p_enabled: boolean;
        }): Promise<{ error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("save_email_template", {
        p_key: v.key,
        p_slots: slots,
        p_required: requiredPlaceholders(v.key),
        p_enabled: v.enabled ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useResetEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const rpcClient = supabase as unknown as {
        rpc(name: "reset_email_template", args: { p_key: string }): Promise<{ error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("reset_email_template", { p_key: key });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}
