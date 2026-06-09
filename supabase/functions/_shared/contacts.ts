import { createClient } from "jsr:@supabase/supabase-js@2";

// Resolve-or-create voor bedrijven/personen vanuit edge-functies (service-role).
// Zelfde dedupe-logica als de backfill: company op genormaliseerde naam, person
// op e-mail (fallback volledige naam). Voorkomt dubbele contacten bij intake en
// configurator-finalize.

type ServiceClient = ReturnType<typeof createClient>;

export function splitName(full: string | null | undefined): { first_name: string | null; last_name: string | null } {
  const v = (full ?? "").trim();
  if (!v) return { first_name: null, last_name: null };
  const i = v.lastIndexOf(" ");
  if (i < 0) return { first_name: v, last_name: null };
  return { first_name: v.slice(0, i).trim(), last_name: v.slice(i + 1).trim() };
}

export async function resolveOrCreateCompany(
  sb: ServiceClient,
  org: string,
  c: { name?: string | null; kvk?: string | null; website?: string | null; sector?: string | null; street?: string | null; postal?: string | null; city?: string | null },
): Promise<string | null> {
  const name = (c.name ?? "").trim();
  if (!name) return null;
  const { data: existing } = await sb
    .from("companies").select("id")
    .eq("organization_id", org).eq("normalized_name", name.toLowerCase()).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await sb
    .from("companies")
    .insert({
      organization_id: org, name,
      kvk: c.kvk || null, website: c.website || null, sector: c.sector || null,
      address_street: c.street || null, postal_code: c.postal || null, city: c.city || null,
    })
    .select("id").single();
  if (error) throw error;
  return created.id as string;
}

export async function resolveOrCreatePerson(
  sb: ServiceClient,
  org: string,
  p: { name?: string | null; email?: string | null; phone?: string | null; role?: string | null },
): Promise<string | null> {
  const name = (p.name ?? "").trim();
  const email = (p.email ?? "").trim();
  if (!name && !email) return null;
  if (email) {
    const { data: byEmail } = await sb
      .from("persons").select("id").eq("organization_id", org).ilike("email", email).limit(1).maybeSingle();
    if (byEmail?.id) return byEmail.id as string;
  } else if (name) {
    const { data: byName } = await sb
      .from("persons").select("id").eq("organization_id", org).ilike("full_name", name).limit(1).maybeSingle();
    if (byName?.id) return byName.id as string;
  }
  const { first_name, last_name } = splitName(name);
  const { data: created, error } = await sb
    .from("persons")
    .insert({ organization_id: org, first_name, last_name, email: email || null, phone: p.phone || null, role: p.role || null })
    .select("id").single();
  if (error) throw error;
  return created.id as string;
}

export async function linkPersonToCompany(sb: ServiceClient, companyId: string, personId: string, isPrimary = false) {
  await sb.from("company_persons").upsert(
    { company_id: companyId, person_id: personId, is_primary: isPrimary },
    { onConflict: "company_id,person_id" },
  );
}
