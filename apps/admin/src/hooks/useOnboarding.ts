import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { linkLocationToClient } from "@/services/locations";

// De onboarding-fase wordt AFGELEID uit de echte status (geen handmatig bijhouden).
// Per fase staat in de cockpit de juiste vervolgactie.
export type OnboardingPhase =
  | "getekend"
  | "bij_installateur"
  | "opgeleverd"
  | "portaal"
  | "operationeel";

export const ONBOARDING_PHASES: { key: OnboardingPhase; label: string; color: string; hint: string }[] = [
  { key: "getekend", label: "Getekend", color: "#3b82f6", hint: "Installatie-opdracht versturen" },
  { key: "bij_installateur", label: "Bij installateur", color: "#f59e0b", hint: "Wacht op oplevering" },
  { key: "opgeleverd", label: "Opgeleverd", color: "#06b6d4", hint: "Laadpunten koppelen aan locatie" },
  { key: "portaal", label: "Portaal activeren", color: "#8b5cf6", hint: "Portaal-uitnodiging versturen" },
  { key: "operationeel", label: "Operationeel", color: "#22c55e", hint: "Live in het portaal" },
];

type OnbOrder = { id: string; status: string | null; egroup_order_id: string | null; completed_at: string | null };
type OnbLocation = { id: string; charge_points: { id: string }[] | null };
type OnbInvite = { id: string; status: string | null };

export type OnboardingClient = {
  id: string;
  company_name: string;
  client_number: number | null;
  status: string | null;
  portal_user_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  created_at: string;
  installation_orders: OnbOrder[] | null;
  locations: OnbLocation[] | null;
  client_invitations: OnbInvite[] | null;
};

export function useOnboardingClients() {
  return useQuery({
    queryKey: ["onboarding-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, company_name, client_number, status, portal_user_id, contact_email, contact_name, created_at, installation_orders(id, status, egroup_order_id, completed_at), locations(id, charge_points(id)), client_invitations(id, status)",
        )
        .neq("status", "verwijderd")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingClient[];
    },
  });
}

/** Leidt de huidige onboarding-fase af uit installatie-/locatie-/portaalstatus. */
export function deriveOnboardingPhase(c: OnboardingClient): OnboardingPhase {
  if (c.portal_user_id) return "operationeel";
  const orders = c.installation_orders ?? [];
  const delivered = orders.some((o) => !!o.completed_at || o.status === "afgerond");
  const handedOff = orders.some((o) => !!o.egroup_order_id);
  const hasChargePoints = (c.locations ?? []).some((l) => (l.charge_points ?? []).length > 0);
  if (delivered) return hasChargePoints ? "portaal" : "opgeleverd";
  if (handedOff) return "bij_installateur";
  return "getekend";
}

export function hasPendingInvite(c: OnboardingClient): boolean {
  return (c.client_invitations ?? []).some((i) => i.status === "pending");
}

// Nog niet aan een klant gekoppelde locaties (voor de 'laadpunten koppelen'-dialog).
export type UnlinkedLocation = { id: string; name: string | null; address: string | null; city: string | null; charge_points: { id: string }[] | null };

export function useUnlinkedLocations(enabled = true) {
  return useQuery({
    queryKey: ["unlinked-locations"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address, city, charge_points(id)")
        .is("client_id", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as UnlinkedLocation[];
    },
  });
}

export function useLinkLocationToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, clientId }: { locationId: string; clientId: string }) =>
      linkLocationToClient(locationId, clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
      qc.invalidateQueries({ queryKey: ["unlinked-locations"] });
    },
  });
}

export type InviteResult = { status?: string; to?: string; message?: string };

export function useSendOnboardingInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string): Promise<InviteResult> => {
      const { data, error } = await supabase.functions.invoke("send-client-invitation", { body: { client_id: clientId } });
      if (error) throw error;
      return (data ?? {}) as InviteResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
    },
  });
}
