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
  // Tekstversie van de VASTE offerte-copy (fee-vrije handboek-teksten). Afwezig of >= 2 =
  // huidige (handboek-conforme) teksten; 1 = de oorspronkelijke teksten van vóór 2026-07-16.
  // Verstuurde offertes zijn via een backfill op 1 gezet zodat her-renderen (accept-pagina,
  // getekende PDF) byte-voor-byte hetzelfde document oplevert als wat de klant ontving.
  text_version?: number | null;
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
  // Begeleidende aanpak-tekst op pagina 1 bij scope "alleen beheer"; standaard = DEFAULT_BEHEER_INTRO.
  beheerIntroText?: string | null;
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
  // Extra laadkosten-varianten (€/kWh, zelfde eenheid als laadkosten). null = niet ingevuld (geel).
  laadkostenGasten?: number | null;
  laadkostenEigenGebruik?: number | null;
  // Laadtarief-modus: dynamisch (excl. tarief) i.p.v. een vast €/kWh-bedrag → offerte toont "Dynamisch (excl. tarief)".
  chargeTariffDynamic?: boolean | null;
  // Tariefregels in de offerte: geordende lijst van zichtbare keys (in de lijst = zichtbaar; laatst
  // aangezette regel bovenaan). Afwezig = standaard (laadkosten/blokkeer/start + uurtarief bij >0; nieuwe uit).
  tariffOrder?: string[] | null;
  // Documentopbouw (uitzonderingspad): sectie-ids die BUITEN dit document vallen — die pagina's
  // gaan niet naar de klant, niet in de PDF-bijlage en niet naar de online offerte.
  // Afwezig / null / [] = het volledige sjabloon → byte-gelijk aan vóór deze functie bestond.
  // Ids zijn BEVROREN identifiers (OFFER_SECTIONS in offerTemplate.ts, nooit hernoemen); onbekende,
  // niet-bestaande en vergrendelde ids zijn inert. Bewust een UITsluitlijst en geen insluitlijst:
  // een later toegevoegde sectie mag nooit stil wegvallen uit een bestaande offerte.
  docSections?: string[] | null;
  // Losse zinnen — fijnere korrel dan docSections: ids van individuele, hard-gecodeerde
  // verkoopzinnen (slogans, het rekenvoorbeeld, de afsluitende contactvraag) die buiten dit
  // document vallen. In de UI heet dit "Zinnen"; in dit systeem is "quote" een OFFERTE, vandaar
  // phrase. Afwezig / null / [] = het volledige sjabloon → byte-gelijk aan vóór deze functie.
  // Ids zijn BEVROREN identifiers (OFFER_PHRASES in offerTemplate.ts); onbekende en
  // scope-vreemde ids zijn inert. Uitsluitlijst, net als docSections.
  docPhrases?: string[] | null;
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
  // Aanhef van de klant-mail (eerste regel). Leeg = automatisch "Beste {contact}," / "Geachte heer/mevrouw,".
  emailGreeting?: string | null;
  // Body-tekst van de klant-offertemail (per offerte aanpasbaar). Leeg = standaardtekst.
  emailMessage?: string | null;
  // Ondertekening van de klant-mail (na "Met vriendelijke groet,"). Leeg = naam van de ondertekenaar.
  emailClosingName?: string | null;
}

// Standaard body-tekst van de offerte-e-mail aan de klant — voorvulling van het bewerkbare veld.
// Platte tekst met markdown-vet (`**woord**`) en lege regel = nieuwe alinea (zie lib/emailBody.ts).
// Stemt af op de scope (installatie/beheer) en het aantal palen. MOET gelijk blijven aan de
// fallback in supabase/functions/_shared/offer-email.ts (renderOfferEmail).
export function defaultOfferEmail(o?: { withInstallation?: boolean | null; withManagement?: boolean | null; chargePoints?: number | null; isContract?: boolean | null }): string {
  const inst = o?.withInstallation ?? true;   // onbekend → aanname installatie+beheer (meest voorkomend)
  const mgmt = o?.withManagement ?? true;
  const ct = o?.isContract === true; // particulier alleen-beheer = contract (E-Charging tekent eerst)
  const palen = (o?.chargePoints ?? 1) >= 2 ? "laadpalen" : "laadpaal";
  const subject = inst && mgmt ? `de levering, installatie en het beheer van uw ${palen}`
    : inst ? `de levering en installatie van uw ${palen}`
    : mgmt ? `het beheer van uw ${palen}`
    : `uw ${palen}`;
  const detail = inst && mgmt ? "de hardware, de installatie, het beheer en de tarieven"
    : inst ? "de hardware, de installatie en de kosten"
    : mgmt ? "het beheer, de tarieven en de maandafrekening"
    : "de uitwerking en de kosten";
  if (ct) {
    return `Goed nieuws: alles staat voor u klaar. Hierbij ontvangt u het contract voor ${subject}. Wij hebben het contract al ondertekend.\n\n`
      + `In het contract leest u alle afspraken: ${detail}. Zet uw digitale handtekening via onderstaande knop. Daarna regelen wij de rest.\n\n`
      + "Het volledige contract vindt u als **PDF-bijlage** bij deze e-mail.";
  }
  return `Hierbij ontvangt u onze offerte voor ${subject}.\n\n`
    + `In de offerte leest u de volledige uitwerking: ${detail}. Bekijk de offerte online en onderteken direct digitaal via onderstaande knop.\n\n`
    + "De volledige offerte vindt u als **PDF-bijlage** bij deze e-mail.";
}
export const DEFAULT_OFFER_EMAIL = defaultOfferEmail();
