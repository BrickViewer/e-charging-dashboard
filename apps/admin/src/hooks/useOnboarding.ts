import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { linkLocationToClient } from "@/services/locations";
import { type QuoteScope } from "@/lib/quoteScope";

// De onboarding-fase wordt AFGELEID uit de echte status (geen handmatig bijhouden).
// Pijplijn: getekend → bij installateur → opgeleverd → locaties koppelen →
// klant uitnodigen → gegevens toevoegen → archief.
export type OnboardingStage =
  | "getekend"
  | "bij_installateur"
  | "opgeleverd"
  | "locaties_koppelen"
  | "klant_uitnodigen"
  | "gegevens"
  | "archief";

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string; hint: string }[] = [
  { key: "getekend", label: "Klant aangemaakt", color: "#6366f1", hint: "Doorsturen naar installateur" },
  { key: "bij_installateur", label: "Bij installateur", color: "#f59e0b", hint: "Wacht op oplevering" },
  { key: "opgeleverd", label: "Opgeleverd", color: "#06b6d4", hint: "Factureren" },
  { key: "locaties_koppelen", label: "Locaties koppelen", color: "#8b5cf6", hint: "Laadlocatie koppelen" },
  { key: "klant_uitnodigen", label: "Klant uitnodigen", color: "#ec4899", hint: "Portaal-uitnodiging versturen" },
  { key: "gegevens", label: "Gegevens toevoegen", color: "#14b8a6", hint: "Wacht op gegevens van klant" },
  { key: "archief", label: "Archief", color: "#22c55e", hint: "Onboarding afgerond" },
];

// Welke fases relevant zijn per scope. Installatie+beheer = volledige pijplijn; alleen-installatie stopt na
// opleveren/factureren (geen portaal/beheer); alleen-beheer slaat de installateur-fases over.
export const STAGES_BY_SCOPE: Record<QuoteScope, OnboardingStage[]> = {
  installatie_beheer: ["getekend", "bij_installateur", "opgeleverd", "locaties_koppelen", "klant_uitnodigen", "gegevens", "archief"],
  alleen_installatie: ["getekend", "bij_installateur", "opgeleverd", "archief"],
  alleen_beheer: ["locaties_koppelen", "klant_uitnodigen", "gegevens", "archief"],
};

export type OnbOrder = {
  id: string;
  status: string | null;
  egroup_order_id: string | null;
  egroup_order_number: string | null;
  external_status: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  site_street: string | null;
  site_house_number: string | null;
  site_postal: string | null;
  site_city: string | null;
  site_contact_name: string | null;
  site_contact_email: string | null;
  site_contact_phone: string | null;
  service_summary: string | null;
  notes: string | null;
};
type OnbLocation = { id: string };
type OnbInvite = { id: string; status: string | null };

export type OnboardingClient = {
  id: string;
  company_name: string;
  client_number: number | null;
  status: string | null;
  portal_user_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  payment_onboarding_status: string | null;
  needs_installation: boolean | null;
  managed: boolean | null;
  vat_status: string | null;
  kvk: string | null;
  btw_number: string | null;
  billing_address_street: string | null;
  billing_address_postal: string | null;
  billing_address_city: string | null;
  installation_orders: OnbOrder[] | null;
  locations: OnbLocation[] | null;
  client_invitations: OnbInvite[] | null;
};

const CLIENT_SELECT =
  "id, company_name, client_number, status, portal_user_id, contact_email, contact_name, contact_phone, created_at, " +
  "payment_onboarding_status, needs_installation, managed, vat_status, kvk, btw_number, billing_address_street, billing_address_postal, billing_address_city, " +
  "installation_orders(id, status, egroup_order_id, egroup_order_number, external_status, completed_at, invoiced_at, " +
  "site_street, site_house_number, site_postal, site_city, site_contact_name, site_contact_email, site_contact_phone, service_summary, notes), " +
  "locations(id), client_invitations(id, status)";

export function useOnboardingClients() {
  return useQuery({
    queryKey: ["onboarding-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(CLIENT_SELECT)
        .neq("status", "verwijderd")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingClient[];
    },
  });
}

/** Klant heeft betaal- (IBAN) + bedrijfsgegevens compleet → onboarding klaar. */
export function isDetailsComplete(c: OnboardingClient): boolean {
  const company =
    !!c.company_name && !!c.vat_status &&
    !!c.billing_address_street && !!c.billing_address_postal && !!c.billing_address_city;
  const kvkOk = c.vat_status === "private" || !!c.kvk;
  const btwOk = c.vat_status !== "vat_liable" || !!c.btw_number;
  const bankOk = ["saved", "needs_review", "verified"].includes(c.payment_onboarding_status ?? "");
  return company && kvkOk && btwOk && bankOk;
}

/** Leidt de huidige onboarding-stage af uit installatie-/factuur-/locatie-/portaalstatus. */
export function deriveStage(c: OnboardingClient): OnboardingStage {
  const orders = c.installation_orders ?? [];
  const handedOff = orders.some((o) => !!o.egroup_order_id);
  const delivered = orders.some((o) => !!o.completed_at || o.status === "afgerond");
  const invoiced = orders.some((o) => !!o.invoiced_at);
  const hasLocation = (c.locations ?? []).length > 0;
  const managed = c.managed !== false;
  const needsInstall = c.needs_installation !== false;

  // Alleen installatie (geen beheer): geen portaal/locaties — klaar zodra opgeleverd + gefactureerd.
  if (!managed) {
    if (invoiced) return "archief";
    if (delivered) return "opgeleverd";
    if (handedOff) return "bij_installateur";
    return "getekend";
  }

  // Beheer-scopes (installatie+beheer of alleen-beheer):
  if (isDetailsComplete(c)) return "archief";
  if (c.portal_user_id) return "gegevens";        // uitnodiging geaccepteerd, gegevens nog niet compleet
  if (hasLocation) return "klant_uitnodigen";
  // Alleen-beheer (geen installatie): sla de installateur-stappen (bij installateur/opgeleverd/factureren) over.
  if (!needsInstall) return "locaties_koppelen";
  if (invoiced) return "locaties_koppelen";
  if (delivered) return "opgeleverd";
  if (handedOff) return "bij_installateur";
  return "getekend";
}

/** De installatie-order van de klant (de eerste/primaire). */
export function primaryOrder(c: OnboardingClient): OnbOrder | null {
  return (c.installation_orders ?? [])[0] ?? null;
}

export function hasPendingInvite(c: OnboardingClient): boolean {
  return (c.client_invitations ?? []).some((i) => i.status === "pending");
}

// Nog niet aan een klant gekoppelde locaties (voor de 'locaties koppelen'-dialog).
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

/** Markeer de installatie-order als gefactureerd → kaart schuift naar 'Locaties koppelen'. */
export function useMarkInvoiced() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("installation_orders").update({ invoiced_at: new Date().toISOString() }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
      qc.invalidateQueries({ queryKey: ["installation-orders"] });
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
