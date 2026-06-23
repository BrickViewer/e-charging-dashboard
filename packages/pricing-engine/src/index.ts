import { z } from "zod";

// Locatietype is een vrije string (de "key"). Admins kunnen types toevoegen,
// verwijderen en hernoemen; de beschikbare types staan in settings.locationTypes.
export const locationTypeSchema = z.string().trim().min(1);

export const locationTypeEntrySchema = z.object({
  key: z.string().trim().min(1),
  // Label niet trimmen/min: anders breekt het typen van spaties in de admin-UI.
  label: z.string(),
});

export const locationTypeDefaultsSchema = z.object({
  sessionsPerChargePointMonth: z.number().min(0),
  kwhPerChargePointMonth: z.number().min(0),
  averageSessionDurationHours: z.number().min(0),
  effectiveChargingPowerKw: z.number().positive(),
  // Blokkeertarief-basis per locatietype: de GEMIDDELDE stilstaande minuten per sessie over ÁLLE
  // sessies (movers = 0 min, niet-movers = veel → het gemiddelde vangt de spreiding al). Na de
  // gratis grace-minuten betaalt iedereen het blokkeertarief; er is bewust géén apart "% dat
  // betaalt" meer. `.default(0)` houdt oude opgeslagen settings/inputs geldig.
  idleMinutesPerSession: z.number().min(0).default(0),
});

// Invoer-/slidergrenzen die de configurator-UI gebruikt (geen invloed op de math).
export const inputRangesSchema = z.object({
  chargeTariffMin: z.number().min(0).default(0.39),
  chargeTariffMax: z.number().min(0).default(0.79),
  chargeTariffStep: z.number().positive().default(0.01),
  energyCostMin: z.number().min(0).default(0.10),
  energyCostMax: z.number().min(0).default(0.50),
  energyCostStep: z.number().positive().default(0.01),
  kwhMin: z.number().min(0).default(0),
  kwhMax: z.number().min(0).default(900),
  kwhStep: z.number().positive().default(10),
  sessionsMin: z.number().min(0).default(0),
  sessionsMax: z.number().min(0).default(90),
  sessionsStep: z.number().positive().default(1),
  socketsMin: z.number().int().min(1).default(1),
  socketsMax: z.number().int().min(1).default(200),
  investmentSliderFloor: z.number().min(0).default(6000),
  investmentSliderStep: z.number().positive().default(500),
  intensityDivisor: z.number().positive().default(650),
}).default({});

// Org-standaarden voor de offerte-PDF. Deze "vaste" waarden vullen automatisch
// elke offerte; ze zijn per offerte te overschrijven in het offerte-bewerkscherm.
export const offerTemplateSchema = z.object({
  // Scope-defaults (levering en installatie).
  defaultChargerModel: z.string().default("Zaptec Go 2 Asphalt Black"),
  loadBalancerModel: z.string().default("Zaptec Sense"),
  defaultEindgroepen: z.number().int().min(0).default(1),
  defaultEindgroepAmperage: z.number().min(0).default(32),
  defaultStelpostGraafwerk: z.number().min(0).default(0),
  // Tarieven (offerte-voorwaarden).
  serviceFeePerKwh: z.number().min(0).default(0.10),
  servicemonteurPerHour: z.number().min(0).default(0),
  voorrijkostenPerKm: z.number().min(0).default(0),
  toeslagWerkuur: z.number().min(0).default(0),
  activatiekostenPerSocket: z.number().min(0).default(0),
  // Betaalregeling (3 termijnen, samen idealiter 100%).
  betaalBijOpdrachtPct: z.number().min(0).max(100).default(50),
  betaalBijStartPct: z.number().min(0).max(100).default(0),
  betaalNaWerkPct: z.number().min(0).max(100).default(50),
  // Ondertekenaar namens E-Charging.
  echargingSignerName: z.string().default("Willi-Jan Jonkers"),
  echargingSignerFunction: z.string().default("Directeur"),
  // Tekstsjablonen voor de briefkoppen.
  defaultObjectTemplate: z.string().default(""),
  defaultBetreftTemplate: z.string().default("Offerte laadinfrastructuur"),
  defaultAanhef: z.string().default("heer/mevrouw"),
}).default({});

// Demo-presets (keuzescherm van de no-login demo). Per preset een aantal locaties met
// elk een aantal palen + vermogen; de demo synthetiseert hieruit een portaal-dataset.
export const demoPresetLocationSchema = z.object({
  name: z.string().default("Locatie"),
  chargePoints: z.number().int().min(1).default(4),
  powerKw: z.number().min(1).default(11),
});
export const demoPresetSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().default("Demo"),
  customerName: z.string().default("Demo Laadplein B.V."),
  kwhPerCpMonth: z.number().min(0).default(420),
  sessionsPerCpMonth: z.number().min(0).default(35),
  locations: z.array(demoPresetLocationSchema).min(1).default([{ name: "Hoofdlocatie", chargePoints: 5, powerKw: 11 }]),
});

// Kleinste demo = 1 locatie / 5 palen, oplopend naar 2 en 3 locaties. Vrij aanpasbaar.
export const defaultDemoPresets = [
  { key: "1-locatie", label: "1 locatie", customerName: "Van der Velde Retail B.V.", kwhPerCpMonth: 420, sessionsPerCpMonth: 35, locations: [{ name: "Hoofdlocatie", chargePoints: 5, powerKw: 11 }] },
  { key: "2-locaties", label: "2 locaties", customerName: "Hofstede Vastgoed B.V.", kwhPerCpMonth: 480, sessionsPerCpMonth: 40, locations: [{ name: "Hoofdkantoor", chargePoints: 4, powerKw: 22 }, { name: "Bezoekersparkeren", chargePoints: 4, powerKw: 11 }] },
  { key: "3-locaties", label: "3 locaties", customerName: "Rijnpoort Logistiek B.V.", kwhPerCpMonth: 520, sessionsPerCpMonth: 42, locations: [{ name: "Distributiecentrum", chargePoints: 6, powerKw: 22 }, { name: "Wagenpark", chargePoints: 4, powerKw: 11 }, { name: "Kantoor", chargePoints: 2, powerKw: 22 }] },
];

export const configuratorSettingsSchema = z.object({
  // e-charging-marge: vast bedrag per kWh dat e-charging op het verbruik verdient.
  echargingMarginPerKwh: z.number().min(0).default(0.05),
  defaultContractDurationMonths: z.number().int().positive().default(12),
  defaultNoticePeriodMonths: z.number().int().min(0).default(3),
  defaultChargeTariffPerKwh: z.number().min(0).default(0.58),
  defaultEnergyCostPerKwh: z.number().min(0).default(0.25),
  // Start- en blokkeertarief staan standaard UIT; de admin kan ze per organisatie aanzetten.
  defaultStartFeeEnabled: z.boolean().default(false),
  defaultStartFeePerSession: z.number().min(0).default(0.5),
  defaultIdleFeeEnabled: z.boolean().default(false),
  defaultIdleFeePerMinute: z.number().min(0).default(0.05),
  defaultIdleGraceMinutes: z.number().min(0).default(60),
  // Uurtarief: bedrag per uur aan de paal (hele sessieduur). Staat standaard UIT.
  defaultPerHourFeeEnabled: z.boolean().default(false),
  defaultPerHourFeePerHour: z.number().min(0).default(1),
  // ERE-subsidie: extra opbrengst per kWh per laadpaal (UI-laag in de configurator).
  ereSubsidyPerKwh: z.number().min(0).default(0.10),
  ereEnabledByDefault: z.boolean().default(false),
  // Investeringsschatting per laadpunt → stuurt de investeringsband + slider-max.
  investmentPerSocketLow: z.number().min(0).default(1500),
  investmentPerSocketHigh: z.number().min(0).default(3000),
  investmentPerSocketMax: z.number().min(0).default(4500),
  defaultSocketCount: z.number().int().positive().default(8),
  inputRanges: inputRangesSchema,
  // Beschikbare locatietypes (volgorde + labels). De eerste is de standaard.
  locationTypes: z.array(locationTypeEntrySchema).min(1).default([
    { key: "workplace", label: "Werkplek" },
    { key: "destination", label: "Bestemming" },
    { key: "fleet", label: "Vloot" },
    { key: "public", label: "Publiek" },
    { key: "other", label: "Anders" },
  ]),
  locationTypeDefaults: z.record(z.string(), locationTypeDefaultsSchema),
  // Demo-presets voor het keuzescherm (instelbaar in de admin "Demo"-tab).
  demoPresets: z.array(demoPresetSchema).min(1).default(defaultDemoPresets),
  offerTemplate: offerTemplateSchema,
});

export const pricingInputSchema = z.object({
  customer: z.object({
    companyName: z.string().trim().default(""),
    contactName: z.string().trim().optional().default(""),
    // E-mailadres is GEEN prijsinput; format-validatie hoort bij het opslaan, niet bij elke
    // toetsaanslag (anders crasht de live-berekening op een half-getypt adres). Hier dus tolerant.
    contactEmail: z.string().trim().optional().default(""),
    contactPhone: z.string().trim().optional().default(""),
    locationAddress: z.string().trim().optional().default(""),
    postalCode: z.string().trim().optional().default(""),
    city: z.string().trim().optional().default(""),
    locationType: locationTypeSchema,
  }),
  hardware: z.object({
    chargePoints: z.number().int().positive(),
    socketsPerChargePoint: z.number().positive(),
    hardwareInvestment: z.number().min(0).optional().default(0),
  }),
  usage: locationTypeDefaultsSchema,
  contract: z.object({
    durationMonths: z.number().int().positive(),
    noticePeriodMonths: z.number().int().min(0),
  }),
  tariffs: z.object({
    chargeTariffPerKwh: z.number().min(0),
    energyCostPerKwh: z.number().min(0),
    startFeeEnabled: z.boolean(),
    startFeePerSession: z.number().min(0),
    idleFeeEnabled: z.boolean(),
    idleFeePerMinute: z.number().min(0),
    idleGraceMinutes: z.number().min(0),
    // Uurtarief: per uur aan de paal (hele sessieduur). `.default()` houdt oude inputs geldig.
    perHourFeeEnabled: z.boolean().default(false),
    perHourFeePerHour: z.number().min(0).default(0),
  }),
});

export type LocationType = z.infer<typeof locationTypeSchema>;
export type OfferTemplate = z.infer<typeof offerTemplateSchema>;
export type ConfiguratorSettings = z.infer<typeof configuratorSettingsSchema>;
export type PricingInput = z.infer<typeof pricingInputSchema>;

export type PricingStatus = "ok" | "blocked";

export type PricingResult = {
  status: PricingStatus;
  blockingReasons: string[];
  kwhPerSession: number;
  chargingMinutesPerSession: number;
  sessionDurationMinutes: number;
  // Referentie: oude afleiding (sessieduur − laadtijd). Telt NIET mee in de opbrengst.
  derivedIdleMinutesPerSession: number;
  // Billing-basis: instelbare gem. stilstaande min/sessie (per locatietype).
  idleMinutesPerSession: number;
  billableIdleMinutesPerSession: number;
  billableIdleMinutesPerChargePointMonth: number;
  grossChargingRevenuePerChargePointMonth: number;
  energyCostPerChargePointMonth: number;
  startFeeRevenuePerChargePointMonth: number;
  idleFeeRevenuePerChargePointMonth: number;
  perHourFeeRevenuePerChargePointMonth: number;
  netReturnPerChargePointMonth: number;
  // e-charging verdient een vaste marge per kWh; serviceFeePct is daarvan afgeleid
  // (= marge / netto rendement) en blijft beschikbaar voor de klant-revenue-share.
  echargingMarginPerKwh: number;
  echargingMarginPerChargePointMonth: number;
  serviceFeePct: number;
  customerNetPerChargePointMonth: number;
  echargingGrossPerChargePointMonth: number;
  echargingNetPerChargePointMonth: number;
  totals: {
    customerPerMonth: number;
    customerPerYear: number;
    customerOverContract: number;
    echargingGrossPerMonth: number;
    echargingNetPerMonth: number;
    echargingNetPerYear: number;
    netReturnPerMonth: number;
  };
  deltas: {
    startFeeCustomerPerMonth: number;
    idleFeeCustomerPerMonth: number;
    perHourFeeCustomerPerMonth: number;
    lowerTariffLossPerYear: number;
  };
};

export const defaultConfiguratorSettings: ConfiguratorSettings = configuratorSettingsSchema.parse({
  echargingMarginPerKwh: 0.05,
  defaultContractDurationMonths: 12,
  defaultNoticePeriodMonths: 3,
  defaultChargeTariffPerKwh: 0.58,
  defaultEnergyCostPerKwh: 0.25,
  defaultStartFeeEnabled: false,
  defaultStartFeePerSession: 0.5,
  defaultIdleFeeEnabled: false,
  defaultIdleFeePerMinute: 0.05,
  defaultIdleGraceMinutes: 60,
  defaultPerHourFeeEnabled: false,
  defaultPerHourFeePerHour: 1,
  ereSubsidyPerKwh: 0.10,
  ereEnabledByDefault: false,
  investmentPerSocketLow: 1500,
  investmentPerSocketHigh: 3000,
  investmentPerSocketMax: 4500,
  defaultSocketCount: 8,
  inputRanges: {
    chargeTariffMin: 0.39, chargeTariffMax: 0.79, chargeTariffStep: 0.01,
    energyCostMin: 0.10, energyCostMax: 0.50, energyCostStep: 0.01,
    kwhMin: 0, kwhMax: 900, kwhStep: 10,
    sessionsMin: 0, sessionsMax: 90, sessionsStep: 1,
    socketsMin: 1, socketsMax: 200,
    investmentSliderFloor: 6000, investmentSliderStep: 500,
    intensityDivisor: 650,
  },
  locationTypes: [
    { key: "workplace", label: "Werkplek" },
    { key: "destination", label: "Bestemming" },
    { key: "fleet", label: "Vloot" },
    { key: "public", label: "Publiek" },
    { key: "other", label: "Anders" },
  ],
  // idleMinutesPerSession = conservatieve GEMIDDELDE stilstaande minuten per sessie over álle sessies
  // (movers + niet-movers). Na de gratis grace betaalt iedereen; daarom bewust conservatief gekozen
  // (net boven de standaard-grace van 60), vrij aanpasbaar per locatietype in de admin.
  locationTypeDefaults: {
    workplace: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8, idleMinutesPerSession: 75 },
    destination: { sessionsPerChargePointMonth: 35, kwhPerChargePointMonth: 420, averageSessionDurationHours: 2.5, effectiveChargingPowerKw: 10, idleMinutesPerSession: 70 },
    fleet: { sessionsPerChargePointMonth: 24, kwhPerChargePointMonth: 650, averageSessionDurationHours: 8, effectiveChargingPowerKw: 11, idleMinutesPerSession: 65 },
    public: { sessionsPerChargePointMonth: 50, kwhPerChargePointMonth: 520, averageSessionDurationHours: 1.8, effectiveChargingPowerKw: 11, idleMinutesPerSession: 70 },
    other: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8, idleMinutesPerSession: 70 },
  },
  demoPresets: defaultDemoPresets,
});

export const excelDefaultPricingInput: PricingInput = pricingInputSchema.parse({
  customer: {
    companyName: "[Naam organisatie]",
    locationType: "workplace",
  },
  hardware: {
    chargePoints: 10,
    socketsPerChargePoint: 1,
  },
  usage: {
    kwhPerChargePointMonth: 200,
    sessionsPerChargePointMonth: 12,
    averageSessionDurationHours: 6,
    effectiveChargingPowerKw: 8,
    idleMinutesPerSession: 180,
  },
  contract: {
    durationMonths: 12,
    noticePeriodMonths: 3,
  },
  tariffs: {
    chargeTariffPerKwh: 0.58,
    energyCostPerKwh: 0.25,
    startFeeEnabled: true,
    startFeePerSession: 0.5,
    idleFeeEnabled: true,
    idleFeePerMinute: 0.05,
    idleGraceMinutes: 60,
  },
});

function calculateWith(input: PricingInput, settings: ConfiguratorSettings, override?: Partial<PricingInput["tariffs"]>) {
  const tariffs = { ...input.tariffs, ...override };
  const kwh = input.usage.kwhPerChargePointMonth;
  const sessions = input.usage.sessionsPerChargePointMonth;
  const kwhPerSession = sessions > 0 ? kwh / sessions : 0;
  const chargingMinutesPerSession = input.usage.effectiveChargingPowerKw > 0
    ? (kwhPerSession / input.usage.effectiveChargingPowerKw) * 60
    : 0;
  const sessionDurationMinutes = input.usage.averageSessionDurationHours * 60;
  // Referentie ("theoretisch max"): de oude afleiding sessieduur − laadtijd. Telt NIET
  // mee in de opbrengst (nacht-/langparkeren vertekent dit) — alleen ter context.
  const derivedIdleMinutesPerSession = Math.max(0, sessionDurationMinutes - chargingMinutesPerSession);
  // Blokkeer-basis: de GEMIDDELDE stilstaande minuten per sessie (over álle sessies; movers = 0,
  // niet-movers = veel → het gemiddelde vangt de spreiding al). Na de gratis grace-minuten betaalt
  // IEDEREEN het blokkeertarief — geen apart "% dat betaalt" meer.
  const idleMinutesPerSession = Math.max(0, input.usage.idleMinutesPerSession);
  const billableIdleMinutesPerSession = tariffs.idleFeeEnabled
    ? Math.max(0, idleMinutesPerSession - tariffs.idleGraceMinutes)
    : 0;
  const billableIdleMinutesPerChargePointMonth = billableIdleMinutesPerSession * sessions;
  const grossChargingRevenuePerChargePointMonth = kwh * tariffs.chargeTariffPerKwh;
  const energyCostPerChargePointMonth = -(kwh * tariffs.energyCostPerKwh);
  const startFeeRevenuePerChargePointMonth = tariffs.startFeeEnabled ? sessions * tariffs.startFeePerSession : 0;
  const idleFeeRevenuePerChargePointMonth = tariffs.idleFeeEnabled
    ? billableIdleMinutesPerChargePointMonth * tariffs.idleFeePerMinute
    : 0;
  // Uurtarief: per uur aan de paal = sessies × gemiddelde sessieduur (uren) × tarief/uur.
  const perHourFeeRevenuePerChargePointMonth = tariffs.perHourFeeEnabled
    ? sessions * input.usage.averageSessionDurationHours * tariffs.perHourFeePerHour
    : 0;
  const netReturnPerChargePointMonth =
    grossChargingRevenuePerChargePointMonth +
    energyCostPerChargePointMonth +
    startFeeRevenuePerChargePointMonth +
    idleFeeRevenuePerChargePointMonth +
    perHourFeeRevenuePerChargePointMonth;

  // e-charging verdient een vaste marge per kWh; de rest is voor de klant.
  const echargingMarginPerKwh = settings.echargingMarginPerKwh;
  const echargingMarginPerChargePointMonth = echargingMarginPerKwh * kwh;
  const customerNetPerChargePointMonth = netReturnPerChargePointMonth - echargingMarginPerChargePointMonth;
  const echargingGrossPerChargePointMonth = echargingMarginPerChargePointMonth;
  const echargingNetPerChargePointMonth = echargingMarginPerChargePointMonth;
  // Afgeleid effectief fee-percentage (voor klant-revenue-share bij conversie).
  const serviceFeePct = netReturnPerChargePointMonth > 0
    ? echargingMarginPerChargePointMonth / netReturnPerChargePointMonth
    : 0;
  const chargePoints = input.hardware.chargePoints;

  return {
    kwhPerSession,
    chargingMinutesPerSession,
    sessionDurationMinutes,
    derivedIdleMinutesPerSession,
    idleMinutesPerSession,
    billableIdleMinutesPerSession,
    billableIdleMinutesPerChargePointMonth,
    grossChargingRevenuePerChargePointMonth,
    energyCostPerChargePointMonth,
    startFeeRevenuePerChargePointMonth,
    idleFeeRevenuePerChargePointMonth,
    perHourFeeRevenuePerChargePointMonth,
    netReturnPerChargePointMonth,
    echargingMarginPerKwh,
    echargingMarginPerChargePointMonth,
    serviceFeePct,
    customerNetPerChargePointMonth,
    echargingGrossPerChargePointMonth,
    echargingNetPerChargePointMonth,
    totals: {
      customerPerMonth: customerNetPerChargePointMonth * chargePoints,
      customerPerYear: customerNetPerChargePointMonth * chargePoints * 12,
      customerOverContract: customerNetPerChargePointMonth * chargePoints * input.contract.durationMonths,
      echargingGrossPerMonth: echargingGrossPerChargePointMonth * chargePoints,
      echargingNetPerMonth: echargingNetPerChargePointMonth * chargePoints,
      echargingNetPerYear: echargingNetPerChargePointMonth * chargePoints * 12,
      netReturnPerMonth: netReturnPerChargePointMonth * chargePoints,
    },
  };
}

export function calculatePricing(rawInput: PricingInput, rawSettings: ConfiguratorSettings = defaultConfiguratorSettings): PricingResult {
  const input = pricingInputSchema.parse(rawInput);
  const settings = configuratorSettingsSchema.parse(rawSettings);
  const base = calculateWith(input, settings);
  const withoutStart = calculateWith(input, settings, { startFeeEnabled: false });
  const withoutIdle = calculateWith(input, settings, { idleFeeEnabled: false });
  const withoutPerHour = calculateWith(input, settings, { perHourFeeEnabled: false });
  const friendlyTariff = calculateWith(input, settings, { chargeTariffPerKwh: Math.min(0.49, input.tariffs.chargeTariffPerKwh) });

  const blockingReasons: string[] = [];
  if (base.netReturnPerChargePointMonth <= 0) {
    blockingReasons.push("Netto rendement is nul of negatief. Verhoog tarief of verwacht gebruik voordat u kunt finaliseren.");
  }

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ok",
    blockingReasons,
    ...base,
    deltas: {
      startFeeCustomerPerMonth: base.totals.customerPerMonth - withoutStart.totals.customerPerMonth,
      idleFeeCustomerPerMonth: base.totals.customerPerMonth - withoutIdle.totals.customerPerMonth,
      perHourFeeCustomerPerMonth: base.totals.customerPerMonth - withoutPerHour.totals.customerPerMonth,
      lowerTariffLossPerYear: Math.max(0, base.totals.customerPerYear - friendlyTariff.totals.customerPerYear),
    },
  };
}
