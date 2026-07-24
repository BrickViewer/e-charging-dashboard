// Vertaalt onze contacten/klanten naar WeFact-debiteur-parameters en beheert het
// debiteur-anker. Het anker leeft op companies + persons (de identiteitslaag die in
// ALLE facturatiepaden bestaat, ook installatie-only zonder client-account); een
// client resolvet naar zijn company_id of person_id.
import type { WefactClient } from "./wefact.ts";

// deno-lint-ignore no-explicit-any
type SB = any;

export type AnchorTable = "companies" | "persons";
export interface Anchor {
  table: AnchorTable;
  id: string;
  // deno-lint-ignore no-explicit-any
  row: any;
}

function joinAddress(street?: string | null, houseNumber?: string | null): string | undefined {
  const s = [street, houseNumber].filter(Boolean).join(" ").trim();
  return s || undefined;
}

// Zoek het debiteur-anker (company of person) voor een subject uit de UI.
export async function resolveAnchor(sb: SB, subjectType: string, subjectId: string): Promise<Anchor> {
  if (subjectType === "company") {
    const { data, error } = await sb.from("companies").select("*").eq("id", subjectId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Bedrijf niet gevonden");
    return { table: "companies", id: subjectId, row: data };
  }
  if (subjectType === "person") {
    const { data, error } = await sb.from("persons").select("*").eq("id", subjectId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Persoon niet gevonden");
    return { table: "persons", id: subjectId, row: data };
  }
  if (subjectType === "client") {
    const { data: client, error } = await sb
      .from("clients").select("id, company_id, person_id").eq("id", subjectId).maybeSingle();
    if (error) throw error;
    if (!client) throw new Error("Klant niet gevonden");
    if (client.company_id) return resolveAnchor(sb, "company", client.company_id);
    if (client.person_id) return resolveAnchor(sb, "person", client.person_id);
    throw new Error("Klant heeft geen gekoppeld bedrijf of persoon om als debiteur te gebruiken");
  }
  throw new Error(`Onbekend subjecttype: ${subjectType}`);
}

// Primaire contact-e-mail van een bedrijf (voor de debtor EmailAddress).
export async function primaryCompanyEmail(sb: SB, companyId: string): Promise<string | null> {
  const { data } = await sb
    .from("company_persons")
    .select("is_primary, persons ( email )")
    .eq("company_id", companyId);
  if (!Array.isArray(data) || data.length === 0) return null;
  const primary = data.find((r: { is_primary?: boolean }) => r.is_primary) ?? data[0];
  return primary?.persons?.email ?? null;
}

// deno-lint-ignore no-explicit-any
export async function buildDebtorParams(sb: SB, anchor: Anchor, opts: { debtorGroupId?: string | null } = {}): Promise<Record<string, any>> {
  const groups = opts.debtorGroupId ? [opts.debtorGroupId] : undefined;
  // GEEN bankvelden: een debiteur (die óns betaalt) heeft geen IBAN nodig — we doen
  // geen incasso. Uitbetaal-bankgegevens leven bij beheerklanten (client_payment_details).
  if (anchor.table === "companies") {
    const c = anchor.row;
    const email = c.email ?? (await primaryCompanyEmail(sb, anchor.id));
    return clean({
      CompanyName: c.name,
      CompanyNumber: c.kvk,
      TaxNumber: c.btw_number,
      Address: joinAddress(c.address_street, c.house_number),
      ZipCode: c.postal_code,
      City: c.city,
      Country: "NL",
      EmailAddress: email,
      Groups: groups,
    });
  }
  // persons (particulier)
  const p = anchor.row;
  return clean({
    Sex: "u", // onbekend geslacht — voorkomt onterecht 'm'
    Initials: p.first_name,
    SurName: p.last_name || p.full_name || "Onbekend",
    Address: joinAddress(p.address_street, p.house_number),
    ZipCode: p.postal_code,
    City: p.city,
    Country: "NL",
    EmailAddress: p.email,
    PhoneNumber: p.phone,
    Groups: groups,
  });
}

// Schrijf de debiteur-refs terug op het anker met race-guard (alleen als nog leeg,
// tenzij het een edit was op een bestaande code).
export async function writeDebtorRef(sb: SB, anchor: Anchor, debtorId: string, debtorCode: string): Promise<void> {
  const { error } = await sb
    .from(anchor.table)
    .update({ wefact_debtor_id: debtorId, wefact_debtor_code: debtorCode })
    .eq("id", anchor.id);
  if (error) throw error;
}

// Zorgt dat het anker een WeFact-debiteur heeft; maakt 'm aan als hij ontbreekt.
// Geeft de DebtorCode terug (nodig als koppeling op de factuur).
export async function ensureDebtorCode(
  sb: SB,
  client: WefactClient,
  anchor: Anchor,
  opts: { debtorGroupId?: string | null } = {},
): Promise<string> {
  const existing = anchor.row.wefact_debtor_code as string | null;
  if (existing) return existing;
  const params = await buildDebtorParams(sb, anchor, opts);
  const res = await client.debtorAdd(params);
  const debtor = res.debtor ?? {};
  const debtorId = String(debtor.Identifier ?? "");
  const debtorCode = String(debtor.DebtorCode ?? "");
  if (!debtorCode) throw new Error("WeFact gaf geen DebtorCode terug bij het aanmaken van de debiteur");
  await writeDebtorRef(sb, anchor, debtorId, debtorCode);
  anchor.row.wefact_debtor_code = debtorCode;
  anchor.row.wefact_debtor_id = debtorId;
  return debtorCode;
}

// deno-lint-ignore no-explicit-any
function clean(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}
