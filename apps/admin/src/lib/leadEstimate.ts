import type { LeadWithTasks, LeadQuoteMini } from "@/hooks/useLeads";

// Lead-schatting: geschatte jaarlijkse beheeropbrengst voor E-Charging.
// = gemiddelde service-fee-omzet per laadpaal per jaar (uit de settlements, zie
// de RPC avg_echarging_revenue_per_charge_point) × aantal palen op de offerte.
// Geeft null wanneer een van beide ontbreekt of 0 is (dan tonen we geen schatting).
export function estimateYearlyManagementRevenue(
  palen: number | null | undefined,
  avgPerPaalPerYear: number | null | undefined,
): number | null {
  if (!palen || !avgPerPaalPerYear || palen <= 0 || avgPerPaalPerYear <= 0) return null;
  return palen * avgPerPaalPerYear;
}

// Spiegelt primaryQuote() uit useLeads (nieuwste verzonden, anders nieuwste aangemaakt;
// vervangen én afgewezen offertes tellen niet mee — geen actieve voorstellen).
// Hier lokaal gehouden zodat deze module puur blijft (geen supabase-import) en unit-testbaar is.
function primaryQuoteOf(lead: LeadWithTasks): LeadQuoteMini | null {
  const qs = (lead.quotes ?? []).filter((q) => q.status !== "vervangen" && q.status !== "afgewezen");
  if (!qs.length) return null;
  const sent = qs.filter((q) => q.sent_at);
  const pool = sent.length ? sent : qs;
  const key = (q: LeadQuoteMini) => q.sent_at ?? q.created_at;
  return [...pool].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))[0];
}

// De geschatte jaarlijkse beheeropbrengst voor één lead: gem. service-fee-omzet per paal
// × aantal palen op de offerte (num_charge_points, anders estimated_charge_points), maar
// alleen wanneer beheer in scope zit. Eén bron voor kaart, detailpaneel én pijplijn.
export function leadMgmtYearEstimate(
  lead: LeadWithTasks,
  avgPerPaalPerYear: number | null | undefined,
): number | null {
  const pq = primaryQuoteOf(lead);
  const palen = pq?.num_charge_points ?? lead.estimated_charge_points ?? null;
  const mgmtInScope = pq ? pq.with_management !== false : true;
  return mgmtInScope ? estimateYearlyManagementRevenue(palen, avgPerPaalPerYear) : null;
}

// Offerte waarde van één lead = het eenmalige totaal van de primaire offerte
// (hardware + installatie). 0 wanneer er nog geen offerte is.
export function leadQuoteValue(lead: LeadWithTasks): number {
  const pq = primaryQuoteOf(lead);
  if (!pq) return 0;
  return (Number(pq.total_hardware_cost) || 0) + (Number(pq.total_installation_cost) || 0);
}

// Pijplijnwaarde van één lead = offerte waarde (eenmalig) + de jaarschatting
// (eerste-jaar-totaal). Op de echte offerte gebaseerd, niet meer op estimated_value.
export function leadPipelineValue(
  lead: LeadWithTasks,
  avgPerPaalPerYear: number | null | undefined,
): number {
  return leadQuoteValue(lead) + (leadMgmtYearEstimate(lead, avgPerPaalPerYear) ?? 0);
}
