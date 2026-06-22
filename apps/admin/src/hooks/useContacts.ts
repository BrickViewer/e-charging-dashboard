import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];
export type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];
export type Person = Database["public"]["Tables"]["persons"]["Row"];
export type PersonInsert = Database["public"]["Tables"]["persons"]["Insert"];
export type PersonUpdate = Database["public"]["Tables"]["persons"]["Update"];

export type CompanyWithCounts = Company & {
  company_persons: { count: number }[];
  leads: { count: number }[];
  clients: { count: number }[];
};
export type PersonWithCounts = Person & {
  company_persons: { count: number }[];
  leads: { count: number }[];
};

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function defaultOrgId(): Promise<string | null> {
  const { data } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Splitst een volledige naam op de laatste spatie in voor-/achternaam. */
export function splitName(full: string): { first_name: string | null; last_name: string | null } {
  const v = full.trim();
  if (!v) return { first_name: null, last_name: null };
  const i = v.lastIndexOf(" ");
  if (i < 0) return { first_name: v, last_name: null };
  return { first_name: v.slice(0, i).trim(), last_name: v.slice(i + 1).trim() };
}

// ---- Queries: zoeken (picker) -----------------------------------------------

export function useCompanySearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: ["company-search", q],
    queryFn: async () => {
      let query = supabase.from("companies").select("id, name, kvk, city").order("name", { ascending: true }).limit(40);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Pick<Company, "id" | "name" | "kvk" | "city">[];
    },
  });
}

export function usePersonSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: ["person-search", q],
    queryFn: async () => {
      let query = supabase.from("persons").select("id, full_name, email, phone").order("full_name", { ascending: true }).limit(40);
      if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Pick<Person, "id" | "full_name" | "email" | "phone">[];
    },
  });
}

// ---- Queries: lijsten (module) ----------------------------------------------

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, company_persons(count), leads(count), clients(count)")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyWithCounts[];
    },
  });
}

export function usePersons() {
  return useQuery({
    queryKey: ["persons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("*, company_persons(count), leads(count)")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PersonWithCounts[];
    },
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ["company", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: ["person", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("persons").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Person | null;
    },
  });
}

// Personen gekoppeld aan een bedrijf (met de junction-rol).
export function useCompanyPersons(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-persons", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("id, role, is_primary, person:persons(*)")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; role: string | null; is_primary: boolean; person: Person }[];
    },
  });
}

// Bedrijven gekoppeld aan een persoon.
export function usePersonCompanies(personId: string | undefined) {
  return useQuery({
    queryKey: ["person-companies", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("id, role, is_primary, company:companies(*)")
        .eq("person_id", personId!);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; role: string | null; is_primary: boolean; company: Company }[];
    },
  });
}

// Het (niet-verwijderde) klantaccount van een bedrijf, of null. 1 bedrijf = 1 account.
export function useClientForCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-client", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_number, company_name, status")
        .eq("company_id", companyId!)
        .neq("status", "verwijderd")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; client_number: number | null; company_name: string; status: string | null } | null;
    },
  });
}

// Locaties onder een klantaccount (voor het bedrijfsdossier).
export function useClientLocations(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-locations", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address, city, postal_code")
        .eq("client_id", clientId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; address: string | null; city: string | null; postal_code: string | null }[];
    },
  });
}

// Leads gekoppeld aan een company of person (voor het dossier).
export function useLeadsForContact(key: "company_id" | "person_id", id: string | undefined) {
  return useQuery({
    queryKey: ["contact-leads", key, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_name, contact_name, status, stage_id, estimated_value, created_at")
        .eq(key, id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---- Mutations --------------------------------------------------------------

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CompanyInsert, "organization_id"> & { organization_id?: string }) => {
      const org = input.organization_id ?? (await defaultOrgId());
      if (!org) throw new Error("Geen organisatie gevonden");
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("companies")
        .insert({ ...input, organization_id: org, created_by: uid })
        .select("*")
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company-search"] });
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CompanyUpdate }) => {
      const { error } = await supabase.from("companies").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["company-search"] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PersonInsert, "organization_id"> & { organization_id?: string }) => {
      const org = input.organization_id ?? (await defaultOrgId());
      if (!org) throw new Error("Geen organisatie gevonden");
      const email = (input.email ?? "").trim();
      // Eén e-mail = één persoon: bestaat er al een contactpersoon met dit e-mailadres
      // binnen de organisatie, hergebruik die i.p.v. een dubbele aan te maken.
      if (email) {
        const { data: existing } = await supabase
          .from("persons").select("*").eq("organization_id", org).ilike("email", email).limit(1).maybeSingle();
        if (existing) return existing as Person;
      }
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("persons")
        .insert({ ...input, organization_id: org, created_by: uid })
        .select("*")
        .single();
      if (!error && data) return data as Person;
      // Race op de unieke (org, e-mail)-index → pak de bestaande persoon op.
      if ((error as { code?: string } | null)?.code === "23505" && email) {
        const { data: dup } = await supabase
          .from("persons").select("*").eq("organization_id", org).ilike("email", email).limit(1).maybeSingle();
        if (dup) return dup as Person;
      }
      throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      qc.invalidateQueries({ queryKey: ["person-search"] });
    },
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PersonUpdate }) => {
      const { error } = await supabase.from("persons").update(patch).eq("id", id);
      if ((error as { code?: string } | null)?.code === "23505") {
        throw new Error("Er bestaat al een contactpersoon met dit e-mailadres.");
      }
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      qc.invalidateQueries({ queryKey: ["person", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["person-search"] });
    },
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("persons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persons"] }),
  });
}

export function useLinkPersonToCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, personId, role, isPrimary }: { companyId: string; personId: string; role?: string | null; isPrimary?: boolean }) => {
      const { error } = await supabase
        .from("company_persons")
        .upsert({ company_id: companyId, person_id: personId, role: role ?? null, is_primary: isPrimary ?? false }, { onConflict: "company_id,person_id" });
      if (error) throw error;
    },
    onSuccess: (_d, { companyId, personId }) => {
      qc.invalidateQueries({ queryKey: ["company-persons", companyId] });
      qc.invalidateQueries({ queryKey: ["person-companies", personId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["persons"] });
    },
  });
}

export function useUnlinkPersonFromCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId }: { linkId: string; companyId?: string; personId?: string }) => {
      const { error } = await supabase.from("company_persons").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: (_d, { companyId, personId }) => {
      qc.invalidateQueries({ queryKey: ["company-persons", companyId] });
      qc.invalidateQueries({ queryKey: ["person-companies", personId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["persons"] });
    },
  });
}
