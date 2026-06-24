import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectLocation = Database["public"]["Tables"]["project_locations"]["Row"];
export type ProjectLocationWithCounts = ProjectLocation & {
  companies: { name: string } | null;
  quotes: { count: number }[] | null;
};
export type LocationQuote = {
  id: string;
  quote_number: string | null;
  status: string | null;
  document_number: number | null;
  total_hardware_cost: number | null;
  total_installation_cost: number | null;
  created_at: string;
  off_web_url: string | null;
};

const LIST_SELECT = "*, companies(name), quotes(count)";

/** Alle objecten (locatie-dossiers) met #offertes + gekoppeld bedrijf. */
export function useProjectLocations() {
  return useQuery({
    queryKey: ["project-locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_locations")
        .select(LIST_SELECT)
        .order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectLocationWithCounts[];
    },
  });
}

export function useProjectLocation(id: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*, companies(name), persons(full_name), leads(company_name)").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as (ProjectLocation & {
        companies: { name: string } | null;
        persons: { full_name: string | null } | null;
        leads: { company_name: string | null } | null;
      }) | null;
    },
  });
}

/** De offertehistorie van een object (alle offertes op dit object). */
export function useQuotesForLocation(id: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "quotes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, status, document_number, total_hardware_cost, total_installation_cost, created_at, off_web_url")
        .eq("project_location_id", id!)
        .order("document_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LocationQuote[];
    },
  });
}

export function useProjectLocationsByClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*").eq("client_id", clientId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectLocation[];
    },
  });
}

export function useProjectLocationsByCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*, quotes(count)").eq("company_id", companyId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectLocationWithCounts[];
    },
  });
}

export function useProjectLocationsByPerson(personId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "person", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*, quotes(count)").eq("person_id", personId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectLocationWithCounts[];
    },
  });
}

export function useProjectLocationsByLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ["project-locations", "lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_locations").select("*, quotes(count)").eq("lead_id", leadId!).order("location_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectLocationWithCounts[];
    },
  });
}

export type ObjectSearchResult = { id: string; location_number: number; display_name: string; address_street: string | null; city: string | null; company_id: string | null };

export function useProjectLocationSearch(query: string) {
  return useQuery({
    queryKey: ["project-locations", "search", query],
    queryFn: async () => {
      let qb = supabase.from("project_locations")
        .select("id, location_number, display_name, address_street, city, company_id")
        .order("location_number", { ascending: false }).limit(25);
      const s = query.trim();
      if (s) qb = qb.or(`display_name.ilike.%${s}%,address_street.ilike.%${s}%,city.ilike.%${s}%`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as ObjectSearchResult[];
    },
  });
}

// Genormaliseerde object-match (zelfde DB-functie als de edge-fns). Voor de "bestaat al"-melding.
// Lead-first: heeft de lead al een object, geef dat terug (spiegelt resolveProjectLocation in de edge).
export async function findMatchingLocation(opts: { org: string; company: string | null; street: string; postal: string; city: string; house?: string | null; lead?: string | null }): Promise<ProjectLocation | null> {
  if (opts.lead) {
    const { data: leadObj } = await supabase.from("project_locations").select("*").eq("lead_id", opts.lead).order("location_number", { ascending: true }).limit(1).maybeSingle();
    if (leadObj) return leadObj as ProjectLocation;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)("find_matching_project_location", {
    p_org: opts.org, p_company: opts.company ?? null, p_street: opts.street, p_postal: opts.postal, p_city: opts.city, p_house: opts.house ?? null,
  });
  const rows = (data ?? []) as ProjectLocation[];
  return rows[0] ?? null;
}

export type NewProjectLocation = {
  display_name?: string;
  address_street: string | null;
  postal_code: string | null;
  city: string | null;
  house_number?: string | null;
  company_id?: string | null;
  person_id?: string | null;
  lead_id?: string | null;
};

export function useCreateProjectLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewProjectLocation): Promise<ProjectLocation> => {
      // Organisatie afleiden (profiel → enige org).
      const { data: { user } } = await supabase.auth.getUser();
      let orgId: string | null = null;
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
        orgId = prof?.organization_id ?? null;
      }
      if (!orgId) {
        const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = org?.id ?? null;
      }
      if (!orgId) throw new Error("Geen organisatie gevonden");
      const display_name = input.display_name || [input.address_street, input.city].filter(Boolean).join(" ") || "Onbekend object";
      const { data, error } = await supabase.from("project_locations").insert({
        organization_id: orgId, display_name,
        address_street: input.address_street, postal_code: input.postal_code, city: input.city,
        house_number: input.house_number ?? null, company_id: input.company_id ?? null,
        person_id: input.person_id ?? null, lead_id: input.lead_id ?? null,
      }).select("*").single();
      if (error) throw error;
      return data as ProjectLocation;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-locations"] }); },
  });
}

export type ProjectLocationPatch = Partial<Pick<
  Database["public"]["Tables"]["project_locations"]["Update"],
  "display_name" | "descriptive_label" | "address_street" | "postal_code" | "city" | "house_number" | "status" | "notes" | "company_id" | "person_id" | "lead_id"
>>;

export function useUpdateProjectLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ProjectLocationPatch }) => {
      const { error } = await supabase.from("project_locations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-locations"] }); },
  });
}

// Verwijder een object (en optioneel de SharePoint-map) via de edge-functie.
export function useDeleteProjectLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deleteSharepoint }: { id: string; deleteSharepoint: boolean }) => {
      const { data, error } = await supabase.functions.invoke("object-delete", { body: { object_id: id, delete_sharepoint: deleteSharepoint } });
      if (error) {
        let msg = error.message;
        try { const b = await (error as { context?: Response }).context?.json(); if (b?.message) msg = b.message; } catch { /* body niet leesbaar */ }
        throw new Error(msg);
      }
      const res = data as { status?: string; message?: string };
      if (res?.status !== "ok") throw new Error(res?.message || "Verwijderen mislukt");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-locations"] }); },
  });
}
