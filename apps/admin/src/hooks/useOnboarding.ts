import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { linkLocationToClient } from "@/services/locations";
import { type QuoteScope } from "@/lib/quoteScope";
import type { MaterialStatus } from "@/services/installationHandoff";
import type { QuoteForClient } from "@/components/sales/CreateClientFromQuoteDialog";

// De onboarding-fase wordt AFGELEID uit de echte status (geen handmatig bijhouden).
// Pijplijn: getekend → werkvoorbereiding → bij installateur → opgeleverd →
// locaties koppelen → klant uitnodigen → gegevens toevoegen → archief.
export type OnboardingStage =
  | "getekend"
  | "werkvoorbereiding"
  | "bij_installateur"
  | "opgeleverd"
  | "klant_aanmaken"
  | "locaties_koppelen"
  | "klant_uitnodigen"
  | "gegevens"
  | "archief";

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string; hint: string }[] = [
  { key: "getekend", label: "Getekend", color: "#6366f1", hint: "Werkvoorbereiding starten" },
  { key: "werkvoorbereiding", label: "Werkvoorbereiding", color: "#0ea5e9", hint: "Materialen bestellen" },
  { key: "bij_installateur", label: "Bij installateur", color: "#f59e0b", hint: "Wacht op oplevering" },
  { key: "opgeleverd", label: "Opgeleverd", color: "#06b6d4", hint: "Factureren" },
  { key: "klant_aanmaken", label: "Klant account aanmaken", color: "#a855f7", hint: "Maak het beheer-klantaccount aan" },
  { key: "locaties_koppelen", label: "Locaties koppelen", color: "#8b5cf6", hint: "Laadlocatie koppelen" },
  { key: "klant_uitnodigen", label: "Klant uitnodigen", color: "#ec4899", hint: "Portaal-uitnodiging versturen" },
  { key: "gegevens", label: "Gegevens toevoegen", color: "#14b8a6", hint: "Wacht op gegevens van klant" },
  { key: "archief", label: "Archief", color: "#22c55e", hint: "Onboarding afgerond" },
];

// Welke fases relevant zijn per scope. Installatie+beheer = volledige pijplijn; alleen-installatie stopt na
// opleveren/factureren (geen portaal/beheer); alleen-beheer slaat de installateur-fases over.
export const STAGES_BY_SCOPE: Record<QuoteScope, OnboardingStage[]> = {
  installatie_beheer: ["getekend", "werkvoorbereiding", "bij_installateur", "opgeleverd", "klant_aanmaken", "locaties_koppelen", "klant_uitnodigen", "gegevens", "archief"],
  alleen_installatie: ["getekend", "werkvoorbereiding", "bij_installateur", "opgeleverd", "archief"],
  alleen_beheer: ["getekend", "locaties_koppelen", "klant_uitnodigen", "gegevens", "archief"],
};

export type OnbOrder = {
  id: string;
  quote_id: string | null;
  status: string | null;
  egroup_order_id: string | null;
  egroup_order_number: string | null;
  external_status: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  scheduled_date: string | null;
  work_prep_started_at: string | null;
  materials_expected_at: string | null;
  preparation_notes: string | null;
  materials_synced_at: string | null;
  last_sync_error: string | null;
  site_street: string | null;
  site_house_number: string | null;
  site_postal: string | null;
  site_city: string | null;
  site_contact_name: string | null;
  site_contact_email: string | null;
  site_contact_phone: string | null;
  service_summary: string | null;
  notes: string | null;
  /** Alleen de statussen — voedt de voortgangsteller op de kaart. */
  installation_order_materials?: { status: MaterialStatus }[] | null;
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
  // True voor het "order-only" pad (installatie zonder klantaccount): de kaart is geen echte client.
  is_order_only?: boolean;
  // Voor order-only inst+beheer: de offerte om ná oplevering het klantaccount mee aan te maken (en de order te koppelen).
  _quoteForClient?: QuoteForClient;
};

const CLIENT_SELECT =
  "id, company_name, client_number, status, portal_user_id, contact_email, contact_name, contact_phone, created_at, " +
  "payment_onboarding_status, needs_installation, managed, vat_status, kvk, btw_number, billing_address_street, billing_address_postal, billing_address_city, " +
  "installation_orders(id, quote_id, status, egroup_order_id, egroup_order_number, external_status, completed_at, invoiced_at, scheduled_date, " +
  "work_prep_started_at, materials_expected_at, preparation_notes, materials_synced_at, last_sync_error, " +
  "site_street, site_house_number, site_postal, site_city, site_contact_name, site_contact_email, site_contact_phone, service_summary, notes, " +
  "installation_order_materials(status)), " +
  "locations(id, archived_at), client_invitations(id, status)";

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
      // Gearchiveerde (in e-Flux verwijderde) locaties niet meetellen voor de onboarding-fase.
      const rows = (data ?? []) as unknown as Array<
        OnboardingClient & { locations?: { id: string; archived_at?: string | null }[] }
      >;
      return rows.map((c) => ({
        ...c,
        locations: (c.locations ?? []).filter((l) => !l.archived_at),
      })) as unknown as OnboardingClient[];
    },
  });
}

// --- Order-only pad (alleen-installatie zonder klantaccount) -------------------------------------
// Clientloze installatie-orders (client_id is null) worden naar dezelfde OnboardingClient-vorm gemapt,
// zodat deriveStage/primaryOrder/de kaart ongewijzigd werken. Scope = altijd alleen_installatie.
type RawOrderOnly = {
  id: string; quote_id: string | null; status: string | null; egroup_order_id: string | null;
  egroup_order_number: string | null; external_status: string | null; completed_at: string | null;
  invoiced_at: string | null; scheduled_date: string | null; work_prep_started_at: string | null; materials_expected_at: string | null;
  preparation_notes: string | null; materials_synced_at: string | null; last_sync_error: string | null;
  installation_order_materials: { status: MaterialStatus }[] | null;
  site_street: string | null; site_house_number: string | null;
  site_postal: string | null; site_city: string | null; site_contact_name: string | null;
  site_contact_email: string | null; site_contact_phone: string | null; service_summary: string | null;
  notes: string | null; created_at: string;
  quotes: {
    quote_number: string | null; prospect_company: string | null; prospect_contact: string | null; prospect_email: string | null;
    company_id: string | null; person_id: string | null; with_management: boolean | null; with_installation: boolean | null;
    charge_rate_per_kwh: number | null; energy_cost_per_kwh: number | null; calculation_snapshot: unknown; offer_details: unknown;
  } | null;
  leads: { company_name: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address_street: string | null; postal_code: string | null; city: string | null } | null;
};

const ORDER_ONLY_SELECT =
  "id, quote_id, status, egroup_order_id, egroup_order_number, external_status, completed_at, invoiced_at, scheduled_date, " +
  "work_prep_started_at, materials_expected_at, preparation_notes, materials_synced_at, last_sync_error, " +
  "site_street, site_house_number, site_postal, site_city, site_contact_name, site_contact_email, site_contact_phone, service_summary, notes, created_at, " +
  "installation_order_materials(status), " +
  "quotes(quote_number, prospect_company, prospect_contact, prospect_email, company_id, person_id, with_management, with_installation, charge_rate_per_kwh, energy_cost_per_kwh, calculation_snapshot, offer_details), " +
  "leads(company_name, contact_name, contact_email, contact_phone, address_street, postal_code, city)";

function mapOrderToClient(o: RawOrderOnly): OnboardingClient {
  const q = o.quotes;
  const lead = o.leads;
  const name = lead?.company_name || q?.prospect_company || q?.prospect_contact || lead?.contact_name || "Onbekend";
  const order: OnbOrder = {
    id: o.id, quote_id: o.quote_id, status: o.status, egroup_order_id: o.egroup_order_id,
    egroup_order_number: o.egroup_order_number, external_status: o.external_status, completed_at: o.completed_at,
    invoiced_at: o.invoiced_at, scheduled_date: o.scheduled_date, work_prep_started_at: o.work_prep_started_at,
    materials_expected_at: o.materials_expected_at, preparation_notes: o.preparation_notes,
    materials_synced_at: o.materials_synced_at, last_sync_error: o.last_sync_error,
    installation_order_materials: o.installation_order_materials,
    site_street: o.site_street, site_house_number: o.site_house_number,
    site_postal: o.site_postal, site_city: o.site_city, site_contact_name: o.site_contact_name,
    site_contact_email: o.site_contact_email, site_contact_phone: o.site_contact_phone,
    service_summary: o.service_summary, notes: o.notes,
  };
  return {
    id: o.id, company_name: name, client_number: null, status: o.status, portal_user_id: null,
    contact_email: lead?.contact_email ?? q?.prospect_email ?? null,
    contact_name: lead?.contact_name ?? q?.prospect_contact ?? null,
    contact_phone: lead?.contact_phone ?? null,
    created_at: o.created_at, payment_onboarding_status: null,
    // Scope uit de offerte: bepaalt of dit order-only item onder alleen-installatie of installatie+beheer valt.
    needs_installation: q?.with_installation !== false, managed: q?.with_management === true,
    vat_status: null, kvk: null, btw_number: null,
    billing_address_street: lead?.address_street ?? null, billing_address_postal: lead?.postal_code ?? null,
    billing_address_city: lead?.city ?? null,
    installation_orders: [order], locations: [], client_invitations: [], is_order_only: true,
    _quoteForClient: q ? {
      id: o.quote_id ?? "", quote_number: q.quote_number, prospect_company: q.prospect_company,
      prospect_contact: q.prospect_contact, prospect_email: q.prospect_email, company_id: q.company_id,
      person_id: q.person_id, with_management: q.with_management, with_installation: q.with_installation,
      charge_rate_per_kwh: q.charge_rate_per_kwh, energy_cost_per_kwh: q.energy_cost_per_kwh,
      calculation_snapshot: q.calculation_snapshot, offer_details: q.offer_details,
    } : undefined,
  };
}

export function useOnboardingOrders() {
  return useQuery({
    queryKey: ["onboarding-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installation_orders")
        .select(ORDER_ONLY_SELECT)
        .is("client_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawOrderOnly[]).map(mapOrderToClient);
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
  // Werkvoorbereiding gestart maar nog niet verstuurd. De !egroup_order_id-check
  // voorkomt dat een tweede, al verstuurde order de fase terugtrekt.
  const inWorkPrep = orders.some((o) => !!o.work_prep_started_at && !o.egroup_order_id);
  const hasLocation = (c.locations ?? []).length > 0;
  const managed = c.managed !== false;
  const needsInstall = c.needs_installation !== false;

  // Order-only (clientloos): installateur-flow; bij beheer-scope wordt ná facturering eerst het klantaccount
  // aangemaakt (klant_aanmaken), bij alleen-installatie is het daarna klaar (archief).
  if (c.is_order_only) {
    if (invoiced) return managed ? "klant_aanmaken" : "archief";
    if (delivered) return "opgeleverd";
    if (handedOff) return "bij_installateur";
    if (inWorkPrep) return "werkvoorbereiding";
    return "getekend";
  }

  // Alleen installatie (geen beheer): geen portaal/locaties — klaar zodra opgeleverd + gefactureerd.
  if (!managed) {
    if (invoiced) return "archief";
    if (delivered) return "opgeleverd";
    if (handedOff) return "bij_installateur";
    if (inWorkPrep) return "werkvoorbereiding";
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
  if (inWorkPrep) return "werkvoorbereiding";
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
        .is("archived_at", null)
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
