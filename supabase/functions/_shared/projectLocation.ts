import { splitDutchAddress } from "./installationHandoff.ts";
// Gedeelde object/locatie-resolutie (e-portal-stijl): vind een bestaand object op
// genormaliseerd adres via de RPC find_matching_project_location, anders maak een
// nieuw object aan. Eén bron van waarheid voor quote-create-from-lead + quote-sharepoint-off.

// deno-lint-ignore no-explicit-any
type SB = any;

export interface ResolvedLocation { id: string; location_number: number }

export async function resolveProjectLocation(
  sb: SB,
  args: { org: string; company: string | null; street: string; postal: string; city: string; house?: string | null; lead?: string | null; fallbackLabel?: string },
): Promise<ResolvedLocation> {
  // Aanroepers geven soms één adresregel door ("Alfred Smithlaan 37") terwijl
  // project_locations straat en huisnummer los opslaat. Aan de poort splitsen, zodat zowel
  // de match-RPC als een nieuw object schone velden krijgt.
  const raw = (args.street ?? "").trim();
  const split = splitDutchAddress(raw);
  const house = (args.house ?? "").toString().trim() || split.house_number;
  const street = (args.house ?? "").toString().trim() ? raw : (split.street || raw);
  const city = (args.city ?? "").trim();
  const postal = (args.postal ?? "").trim();

  // 0) Lead-first via junctie (N:M): heeft deze lead al een gekoppeld object, hergebruik dat.
  if (args.lead) {
    const { data: linked } = await sb.from("lead_project_locations")
      .select("project_locations(id, location_number)")
      .eq("lead_id", args.lead)
      .order("created_at", { ascending: true }).limit(1);
    const leadObj = Array.isArray(linked) ? linked[0]?.project_locations : null;
    if (leadObj) return { id: leadObj.id, location_number: Number(leadObj.location_number) };
  }

  // 1) Bestaand object zoeken (genormaliseerde best-match).
  const { data: matches } = await sb.rpc("find_matching_project_location", {
    p_org: args.org, p_company: args.company ?? null, p_street: street, p_postal: postal, p_city: city, p_house: house || null,
  });
  const hit = Array.isArray(matches) ? matches[0] : null;
  if (hit) return { id: hit.id, location_number: Number(hit.location_number) };

  // 2) Nieuw object.
  const addrLabel = [street, city].filter(Boolean).join(" ") || args.fallbackLabel || "Onbekende locatie";
  const { data: created, error } = await sb.from("project_locations").insert({
    organization_id: args.org, display_name: addrLabel,
    address_street: street || null, postal_code: postal || null, city: city || null,
    house_number: house || null, company_id: args.company ?? null, lead_id: args.lead ?? null,
  }).select("id, location_number").single();
  if (error) throw error;
  return { id: created.id, location_number: Number(created.location_number) };
}
