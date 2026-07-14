import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SignableAdmin = {
  userId: string;
  fullName: string;
  signatureDataUrl: string | null;
  hasSignature: boolean;
};

// Lijst van interne ondertekenaars: alleen admin/superadmin. Bevat de opgeslagen
// handtekening (intern zichtbaar; verschijnt sowieso op de offerte). Bewust GEEN
// functietitel — interne functies horen niet op offertes/contracten.
export function useSignableAdmins() {
  return useQuery({
    queryKey: ["signable-admins"],
    queryFn: async (): Promise<SignableAdmin[]> => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, signature_data_url"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const adminIds = new Set(
        (roles ?? []).filter((r) => r.role === "admin" || r.role === "superadmin").map((r) => r.user_id),
      );
      return (profiles ?? [])
        .filter((p) => adminIds.has(p.user_id))
        .map((p) => ({
          userId: p.user_id,
          fullName: p.full_name ?? "Onbekend",
          signatureDataUrl: p.signature_data_url ?? null,
          hasSignature: !!p.signature_data_url,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
  });
}
