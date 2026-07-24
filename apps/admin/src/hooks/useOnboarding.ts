import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { linkLocationToClient } from "@/services/locations";
import {
  ONBOARDING_STEPS, activeOrder, currentStep, stepStates, buildSkipIndex,
  type OnboardingClient, type OnbOrder, type OnboardingStage, type SkipIndex,
  type OnboardingStepSkip, type StepAnchor,
} from "@/services/onboardingPipeline";
import type { MaterialStatus } from "@/services/installationHandoff";
import type { AwaitingClientQuote } from "@/hooks/useQuotes";
import { useSignedQuotesAwaitingClient } from "@/hooks/useQuotes";

// HET model woont in services/onboardingPipeline.ts (puur + testbaar). Deze hook-laag
// haalt de drie bronnen op (klanten, clientloze orders, getekende offertes zonder klant)
// en voegt ze samen tot ÉÉN lijst onboardings. Er is geen aparte flow per scope meer.
export {
  ONBOARDING_STEPS, activeOrder, currentStep, stepStates, buildSkipIndex,
  deriveStage, isDetailsComplete, hasPendingInvite, isOnboardingDone,
  onboardingFacts,
} from "@/services/onboardingPipeline";
export type {
  OnboardingClient, OnbOrder, OnboardingStage, OnboardingStep, StepState, StepStatus,
  OnboardingFacts, OnboardingKind, SkipIndex, OnboardingStepSkip, StepAnchor,
} from "@/services/onboardingPipeline";

// Compat-vorm voor bestaande consumenten (directie-dashboard, kolomkoppen).
export const ONBOARDING_STAGES: { key: OnboardingStage; label: string; color: string; hint: string }[] =
  ONBOARDING_STEPS.map(({ key, label, color, hint }) => ({ key, label, color, hint }));

// Elke onboarding-mutatie raakt meerdere views (bord, order-only kaarten, offertes,
// losse locaties, installatie-orders). Eén plek zodat een nieuwe actie er nooit één
// vergeet — zelfde patroon als invalidateMaterialViews in useOrderMaterials.ts.
export function invalidateOnboarding(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
  qc.invalidateQueries({ queryKey: ["onboarding-orders"] });
  qc.invalidateQueries({ queryKey: ["onboarding-skips"] });
  qc.invalidateQueries({ queryKey: ["quotes"] });
  qc.invalidateQueries({ queryKey: ["unlinked-locations"] });
  qc.invalidateQueries({ queryKey: ["installation-orders"] });
  // De directie-agenda leest dezelfde orders (usePlannedInstallations); zonder deze
  // regel bleef die per constructie verouderd na handoff/oplevering/facturatie.
  qc.invalidateQueries({ queryKey: ["planned-installations"] });
  // Concept aangemaakt/verstuurd/verwijderd verandert het "concept klaar"-signaal op de kaart.
  qc.invalidateQueries({ queryKey: ["open-invoice-concepts"] });
}

const CLIENT_SELECT =
  "id, company_name, client_number, status, portal_user_id, contact_email, contact_name, contact_phone, created_at, " +
  "payment_onboarding_status, needs_installation, managed, vat_status, kvk, btw_number, billing_address_street, billing_address_postal, billing_address_city, " +
  "activation_fee_total, activation_invoiced_total, " +
  "installation_orders(id, quote_id, status, egroup_order_id, egroup_order_number, external_status, completed_at, invoiced_at, wefact_invoice_code, wefact_invoice_id, scheduled_date," +
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
        .order("created_at", { ascending: false })
        // Nieuwste order eerst: activeOrder() rekent op deze volgorde (PostgREST
        // geeft geneste rijen anders in willekeurige volgorde terug).
        .order("created_at", { referencedTable: "installation_orders", ascending: false });
      if (error) throw error;
      // Gearchiveerde (in e-Flux verwijderde) locaties niet meetellen voor de onboarding-fase.
      const rows = (data ?? []) as unknown as OnboardingClient[];
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
  invoiced_at: string | null; wefact_invoice_code: string | null; wefact_invoice_id: string | null; scheduled_date: string | null; work_prep_started_at: string | null; materials_expected_at: string | null;
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
  "id, quote_id, status, egroup_order_id, egroup_order_number, external_status, completed_at, invoiced_at, wefact_invoice_code, wefact_invoice_id, scheduled_date," +
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
    invoiced_at: o.invoiced_at, wefact_invoice_code: o.wefact_invoice_code, wefact_invoice_id: o.wefact_invoice_id, scheduled_date: o.scheduled_date, work_prep_started_at: o.work_prep_started_at,
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
    // Scope uit de offerte. Zónder offerte-join weten we niets: dan is beheer niet
    // aan te tonen en is dit per definitie een losse installatie-opdracht (anders
    // zou zo'n order ineens om een klantaccount vragen dat nergens uit volgt).
    needs_installation: q ? q.with_installation !== false : true,
    managed: q ? q.with_management !== false : false,
    vat_status: null, kvk: null, btw_number: null,
    billing_address_street: lead?.address_street ?? null, billing_address_postal: lead?.postal_code ?? null,
    billing_address_city: lead?.city ?? null,
    installation_orders: [order], locations: [], client_invitations: [],
    kind: "order", is_order_only: true, quote_number: q?.quote_number ?? null,
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

/** De installatie-order waar de kaart nú over gaat (zie activeOrder). */
export function primaryOrder(c: OnboardingClient): OnbOrder | null {
  return activeOrder(c);
}

// --- Getekende offertes zonder klant én zonder order -------------------------------------------
// Vroeger een apart kaarttype in de 'Getekend'-kolom; nu een gewone kaart die instroomt
// op 'Klant account aanmaken'. AwaitingClientQuote is een superset van QuoteForClient,
// dus CreateClientFromQuoteDialog werkt hier ongewijzigd op.
function mapQuoteToItem(q: AwaitingClientQuote): OnboardingClient {
  return {
    id: q.id,
    company_name: (q.prospect_company ?? "").trim() || (q.prospect_contact ?? "").trim() || q.quote_number || "Getekende offerte",
    client_number: null, status: "getekend", portal_user_id: null,
    contact_email: q.prospect_email, contact_name: q.prospect_contact, contact_phone: null,
    created_at: q.created_at, payment_onboarding_status: null,
    needs_installation: q.with_installation !== false,
    managed: q.with_management !== false,
    vat_status: null, kvk: null, btw_number: null,
    billing_address_street: null, billing_address_postal: null, billing_address_city: null,
    installation_orders: [], locations: [], client_invitations: [],
    kind: "quote", is_order_only: true, quote_number: q.quote_number,
    _quoteForClient: {
      id: q.id, quote_number: q.quote_number, prospect_company: q.prospect_company,
      prospect_contact: q.prospect_contact, prospect_email: q.prospect_email,
      company_id: q.company_id, person_id: q.person_id,
      with_management: q.with_management, with_installation: q.with_installation,
      charge_rate_per_kwh: q.charge_rate_per_kwh, energy_cost_per_kwh: q.energy_cost_per_kwh,
      calculation_snapshot: q.calculation_snapshot, offer_details: q.offer_details,
    },
  };
}

/** Handmatig overgeslagen stappen (kleine tabel, in één keer opgehaald). */
export function useOnboardingSkips() {
  return useQuery({
    queryKey: ["onboarding-skips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_step_skips")
        .select("step_key, client_id, installation_order_id, quote_id, reason");
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingStepSkip[];
    },
  });
}

/**
 * DE onboarding-lijst: klanten + clientloze orders + getekende offertes zonder klant,
 * samengevoegd tot één reeks kaarten. Een offerte die al een order of klant heeft valt
 * weg, zodat er nooit twee kaarten voor dezelfde onboarding staan.
 */
/**
 * Onverstuurde WeFact-concepten, opzoekbaar per klant en per installatie-order.
 *
 * Zonder dit ziet een kaart met een klaarstaand concept er identiek uit als een kaart waar nog
 * niets is gebeurd — je kunt niet zien dat de factuur al klaarstaat en alleen nog verstuurd
 * hoeft te worden. Eén kleine query voor het hele bord (de spiegeltabel is klein).
 */
export type OpenConcept = { wefactInvoiceId: string; invoiceCode: string | null; amountIncl: number | null };

export function useOpenInvoiceConcepts() {
  return useQuery({
    queryKey: ["open-invoice-concepts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wefact_invoices")
        .select("wefact_invoice_id, invoice_code, amount_incl, activation_client_id, installation_order_id, sent, status_code")
        .eq("status_code", 0);
      if (error) throw error;
      const byClient = new Map<string, OpenConcept>();
      const byOrder = new Map<string, OpenConcept>();
      for (const r of data ?? []) {
        if (Number(r.sent ?? 0) > 0) continue;
        const c: OpenConcept = {
          wefactInvoiceId: String(r.wefact_invoice_id),
          // WeFact geeft een concept een placeholdercode ("[concept]0001"); die zegt de
          // gebruiker niets, dus alleen een echt factuurnummer tonen.
          invoiceCode: r.invoice_code && !r.invoice_code.startsWith("[") ? r.invoice_code : null,
          amountIncl: r.amount_incl == null ? null : Number(r.amount_incl),
        };
        if (r.activation_client_id) byClient.set(r.activation_client_id, c);
        if (r.installation_order_id) byOrder.set(r.installation_order_id, c);
      }
      return { byClient, byOrder };
    },
  });
}

export function useOnboardingPipeline() {
  const clientsQ = useOnboardingClients();
  const ordersQ = useOnboardingOrders();
  const quotesQ = useSignedQuotesAwaitingClient();
  const skipsQ = useOnboardingSkips();
  const conceptsQ = useOpenInvoiceConcepts();

  // Stabiele referenties: het bord memo-ïseert hierop, dus een nieuwe array/Map per
  // render zou elke afleiding opnieuw laten draaien.
  const items = useMemo(() => {
    const clients = clientsQ.data ?? [];
    const orders = ordersQ.data ?? [];

    const claimed = new Set<string>();
    for (const c of clients) for (const o of c.installation_orders ?? []) if (o.quote_id) claimed.add(o.quote_id);
    for (const o of orders) for (const oo of o.installation_orders ?? []) if (oo.quote_id) claimed.add(oo.quote_id);

    const quotes = (quotesQ.data ?? []).filter((q) => !claimed.has(q.id)).map(mapQuoteToItem);
    return [...clients, ...orders, ...quotes] as OnboardingClient[];
  }, [clientsQ.data, ordersQ.data, quotesQ.data]);

  const skips = useMemo(() => buildSkipIndex(skipsQ.data), [skipsQ.data]);

  const concepts = conceptsQ.data ?? { byClient: new Map(), byOrder: new Map() };

  return {
    items,
    skips,
    concepts,
    isLoading: clientsQ.isLoading || ordersQ.isLoading || quotesQ.isLoading,
  };
}

// --- Stappen overslaan / onboarding afsluiten ---------------------------------------------------

export type SkipTarget = { stepKey: string; anchor: StepAnchor | undefined; anchorId: string };

const ANCHOR_COLUMN: Record<StepAnchor, "client_id" | "installation_order_id" | "quote_id"> = {
  client: "client_id", order: "installation_order_id", quote: "quote_id",
};

async function deleteSkips(targets: readonly SkipTarget[]) {
  for (const t of targets) {
    if (!t.anchor) continue;
    const { error } = await supabase
      .from("onboarding_step_skips")
      .delete()
      .eq(ANCHOR_COLUMN[t.anchor], t.anchorId)
      .eq("step_key", t.stepKey);
    if (error) throw error;
  }
}

/** Slaat één stap over (of, met meerdere targets, sluit de hele onboarding af). */
export function useSkipSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targets, reason }: { targets: SkipTarget[]; reason: string }) => {
      if (targets.length === 0) return;
      // De unique indexen zijn partieel (één per anker), dus geen upsert: eerst weg,
      // dan nieuw. Zo is 'nogmaals overslaan met een andere reden' ook idempotent.
      await deleteSkips(targets);
      const rows = targets.map((t) => ({
        step_key: t.stepKey,
        reason,
        client_id: t.anchor === "client" ? t.anchorId : null,
        installation_order_id: t.anchor === "order" ? t.anchorId : null,
        quote_id: t.anchor === "quote" ? t.anchorId : null,
      }));
      const { error } = await supabase.from("onboarding_step_skips").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => invalidateOnboarding(qc),
  });
}

/** Maakt een overgeslagen stap (of de hele afsluiting) weer ongedaan. */
export function useUnskipSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targets: SkipTarget[]) => deleteSkips(targets),
    onSuccess: () => invalidateOnboarding(qc),
  });
}

/** Scope-vlaggen van een klant bijstellen (bepaalt welke stappen van toepassing zijn). */
export function useUpdateOnboardingScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, managed, needsInstallation }: { clientId: string; managed: boolean; needsInstallation: boolean }) => {
      const { error } = await supabase
        .from("clients")
        .update({ managed, needs_installation: needsInstallation })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => invalidateOnboarding(qc),
  });
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
    onSuccess: () => invalidateOnboarding(qc),
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
    onSuccess: () => invalidateOnboarding(qc),
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
    onSuccess: () => invalidateOnboarding(qc),
  });
}
