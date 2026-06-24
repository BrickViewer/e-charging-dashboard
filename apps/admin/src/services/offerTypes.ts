// Gedeelde types voor de offerte-PDF.
// - OfferTemplateValues = de org-standaarden (mirror van ConfiguratorSettings.offerTemplate),
//   zodat de PDF-laag niets van zod/pricing-engine hoeft te importeren.
// - OfferDetails = de per-offerte velden + overrides (opgeslagen in quotes.offer_details).
// Beide zijn los gehouden zodat de waarde-resolutie (override ?? standaard ?? auto)
// op één plek in offerPdf.ts gebeurt.

export interface OfferTemplateValues {
  defaultChargerModel: string;
  loadBalancerModel: string;
  defaultEindgroepen: number;
  defaultEindgroepAmperage: number;
  defaultStelpostGraafwerk: number;
  serviceFeePerKwh: number;
  servicemonteurPerHour: number;
  voorrijkostenPerKm: number;
  toeslagWerkuur: number;
  activatiekostenPerSocket: number;
  betaalBijOpdrachtPct: number;
  betaalBijStartPct: number;
  betaalNaWerkPct: number;
  echargingSignerName: string;
  echargingSignerFunction: string;
  defaultObjectTemplate: string;
  defaultBetreftTemplate: string;
  defaultAanhef: string;
}

export interface OfferDetails {
  // Adres (geseed uit de lead, bewerkbaar per offerte).
  addressStreet?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
  // Briefkoppen (vrije tekst; standaardsjablonen uit de instellingen).
  offerDate?: string | null;        // ISO; override van sent_at/created_at
  onzeReferentie?: string | null;   // default = quote_number
  object?: string | null;
  betreft?: string | null;
  aanhef?: string | null;
  tav?: string | null;              // T.a.v. — override van prospect_contact
  // Briefkop-witruimte (px). Leeg = standaard (96 / 84). Geldt als MAXIMUM; bij lange tekst
  // krimpt de auto-fit deze automatisch kleiner zodat het investeringsblok boven de footer blijft.
  dateGapPx?: number | null;        // witruimte boven "Zaltbommel, {datum}"
  aanhefGapPx?: number | null;      // witruimte boven "Geachte {aanhef},"
  // Scope (levering en installatie) — vrije meerregelige tekst; standaard = DEFAULT_LEVERING_TEXT.
  leveringText?: string | null;
  // (Legacy) gestructureerde scope-velden — niet meer in de UI, blijven voor back-compat.
  chargerModel?: string | null;
  numPoles?: number | null;         // default = num_charge_points
  loadBalancerModel?: string | null;
  eindgroepen?: number | null;
  eindgroepAmperage?: number | null;
  stelpostGraafwerk?: number | null;
  // Tarief-overrides (default uit de instellingen / configurator).
  startFeePerSession?: number | null;
  perHourFeePerHour?: number | null;
  serviceFeePerKwh?: number | null;
  servicemonteurPerHour?: number | null;
  voorrijkostenPerKm?: number | null;
  toeslagWerkuur?: number | null;
  activatiekostenPerSocket?: number | null;
  // Datums (vrij in te vullen).
  overlegNaam?: string | null;
  overlegDatum?: string | null;     // ISO
  ingangsdatum?: string | null;     // ISO
  // Betaalpercentages + ondertekenaar (default uit de instellingen).
  betaalBijOpdrachtPct?: number | null;
  betaalBijStartPct?: number | null;
  betaalNaWerkPct?: number | null;
  echargingSignerName?: string | null;
  echargingSignerFunction?: string | null;
  // Body-tekst van de klant-offertemail (per offerte aanpasbaar). Leeg = standaardtekst.
  emailMessage?: string | null;
}

// Standaard body-tekst van de offerte-e-mail aan de klant — voorvulling van het bewerkbare veld.
// MOET gelijk blijven aan de fallback in supabase/functions/_shared/offer-email.ts (renderOfferEmail).
export const DEFAULT_OFFER_EMAIL =
  "Hierbij ontvangt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur.\n\n" +
  "In de offerte leest u de volledige uitwerking: de hardware, de installatie, het doorlopende beheer en de tarieven. Bekijk de offerte online en onderteken direct digitaal via onderstaande knop.";
