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
  // Niet-lege attrs die we mogen schrijven/bijwerken (last-write-wins; companies = bron van waarheid).
  const attrs: Record<string, string> = {};
  if (c.kvk && c.kvk.trim()) attrs.kvk = c.kvk.trim();
  if (c.website && c.website.trim()) attrs.website = c.website.trim();
  if (c.sector && c.sector.trim()) attrs.sector = c.sector.trim();
  if (c.street && c.street.trim()) attrs.address_street = c.street.trim();
  if (c.postal && c.postal.trim()) attrs.postal_code = c.postal.trim();
  if (c.city && c.city.trim()) attrs.city = c.city.trim();

  const { data: existing } = await sb
    .from("companies").select("id")
    .eq("organization_id", org).eq("normalized_name", name.toLowerCase()).limit(1).maybeSingle();
  if (existing?.id) {
    // Bestaand bedrijf: niet-lege meegegeven attrs bijwerken zodat het niet veroudert.
    if (Object.keys(attrs).length > 0) {
      await sb.from("companies").update(attrs).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data: created, error } = await sb
    .from("companies")
    .insert({ organization_id: org, name, ...attrs })
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
  // Niet-lege contact-attrs die we op een bestaande persoon mogen bijwerken (naam laten we
  // met rust om geen goede naam te degraderen bij een partiële intake-invoer).
  const attrs: Record<string, string> = {};
  if (p.phone && p.phone.trim()) attrs.phone = p.phone.trim();
  if (p.role && p.role.trim()) attrs.role = p.role.trim();

  let existingId: string | null = null;
  if (email) {
    const { data: byEmail } = await sb
      .from("persons").select("id").eq("organization_id", org).ilike("email", email).limit(1).maybeSingle();
    if (byEmail?.id) existingId = byEmail.id as string;
  } else if (name) {
    const { data: byName } = await sb
      .from("persons").select("id").eq("organization_id", org).ilike("full_name", name).limit(1).maybeSingle();
    if (byName?.id) existingId = byName.id as string;
  }
  if (existingId) {
    if (Object.keys(attrs).length > 0) await sb.from("persons").update(attrs).eq("id", existingId);
    return existingId;
  }
  const { first_name, last_name } = splitName(name);
  const { data: created, error } = await sb
    .from("persons")
    .insert({ organization_id: org, first_name, last_name, email: email || null, phone: p.phone || null, role: p.role || null })
    .select("id").single();
  if (!error && created?.id) return created.id as string;
  // Race-conditie: de unieke index (organization_id, e-mail) sloeg toe omdat een ander
  // pad de persoon net aanmaakte → pak die bestaande persoon op i.p.v. te falen.
  // Zo levert één e-mailadres nooit dubbele personen op.
  if ((error as { code?: string } | null)?.code === "23505" && email) {
    const { data: dup } = await sb
      .from("persons").select("id").eq("organization_id", org).ilike("email", email).limit(1).maybeSingle();
    if (dup?.id) {
      if (Object.keys(attrs).length > 0) await sb.from("persons").update(attrs).eq("id", dup.id);
      return dup.id as string;
    }
  }
  throw error;
}

export async function linkPersonToCompany(sb: ServiceClient, companyId: string, personId: string, isPrimary = false) {
  await sb.from("company_persons").upsert(
    { company_id: companyId, person_id: personId, is_primary: isPrimary },
    { onConflict: "company_id,person_id" },
  );
}
