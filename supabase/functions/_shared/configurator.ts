export type ConfiguratorSettings = {
  // e-charging-marge: vast bedrag per kWh dat e-charging op het verbruik verdient.
  echargingMarginPerKwh: number;
  defaultContractDurationMonths: number;
  defaultNoticePeriodMonths: number;
  defaultChargeTariffPerKwh: number;
  defaultEnergyCostPerKwh: number;
  defaultStartFeeEnabled: boolean;
  defaultStartFeePerSession: number;
  defaultIdleFeeEnabled: boolean;
  defaultIdleFeePerMinute: number;
  defaultIdleGraceMinutes: number;
  ereSubsidyPerKwh: number;
  ereEnabledByDefault: boolean;
  investmentPerSocketLow: number;
  investmentPerSocketHigh: number;
  investmentPerSocketMax: number;
  defaultSocketCount: number;
  inputRanges: {
    chargeTariffMin: number;
    chargeTariffMax: number;
    chargeTariffStep: number;
    energyCostMin: number;
    energyCostMax: number;
    energyCostStep: number;
    kwhMin: number;
    kwhMax: number;
    kwhStep: number;
    sessionsMin: number;
    sessionsMax: number;
    sessionsStep: number;
    socketsMin: number;
    socketsMax: number;
    investmentSliderFloor: number;
    investmentSliderStep: number;
    intensityDivisor: number;
  };
  locationTypes: Array<{ key: string; label: string }>;
  locationTypeDefaults: Record<string, {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
    idleMinutesPerSession: number;
    idleBillableSharePct: number;
  }>;
  offerTemplate: OfferTemplate;
};

// Org-standaarden voor de offerte-PDF (mirror van de Zod-versie in de pricing-engine).
export type OfferTemplate = {
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
};

export const defaultOfferTemplate: OfferTemplate = {
  defaultChargerModel: "Zaptec Go 2 Asphalt Black",
  loadBalancerModel: "Zaptec Sense",
  defaultEindgroepen: 1,
  defaultEindgroepAmperage: 32,
  defaultStelpostGraafwerk: 0,
  serviceFeePerKwh: 0.10,
  servicemonteurPerHour: 0,
  voorrijkostenPerKm: 0,
  toeslagWerkuur: 0,
  activatiekostenPerSocket: 0,
  betaalBijOpdrachtPct: 50,
  betaalBijStartPct: 0,
  betaalNaWerkPct: 50,
  echargingSignerName: "Willi-Jan Jonkers",
  echargingSignerFunction: "Directeur",
  defaultObjectTemplate: "",
  defaultBetreftTemplate: "Offerte laadinfrastructuur",
  defaultAanhef: "heer/mevrouw",
};

export type PricingInput = {
  customer: {
    companyName: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    locationAddress?: string;
    postalCode?: string;
    city?: string;
    locationType: string;
  };
  hardware: {
    chargePoints: number;
    socketsPerChargePoint: number;
    hardwareInvestment?: number;
  };
  usage: {
    sessionsPerChargePointMonth: number;
    kwhPerChargePointMonth: number;
    averageSessionDurationHours: number;
    effectiveChargingPowerKw: number;
    idleMinutesPerSession: number;
    idleBillableSharePct: number;
  };
  contract: {
    durationMonths: number;
    noticePeriodMonths: number;
  };
  tariffs: {
    chargeTariffPerKwh: number;
    energyCostPerKwh: number;
    startFeeEnabled: boolean;
    startFeePerSession: number;
    idleFeeEnabled: boolean;
    idleFeePerMinute: number;
    idleGraceMinutes: number;
  };
};

export const defaultConfiguratorSettings: ConfiguratorSettings = {
  echargingMarginPerKwh: 0.05,
  defaultContractDurationMonths: 12,
  defaultNoticePeriodMonths: 3,
  defaultChargeTariffPerKwh: 0.58,
  defaultEnergyCostPerKwh: 0.25,
  // Start- en blokkeertarief staan standaard UIT (identiek aan de pricing-engine).
  defaultStartFeeEnabled: false,
  defaultStartFeePerSession: 0.5,
  defaultIdleFeeEnabled: false,
  defaultIdleFeePerMinute: 0.05,
  defaultIdleGraceMinutes: 60,
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
  locationTypeDefaults: {
    workplace: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8, idleMinutesPerSession: 180, idleBillableSharePct: 10 },
    destination: { sessionsPerChargePointMonth: 35, kwhPerChargePointMonth: 420, averageSessionDurationHours: 2.5, effectiveChargingPowerKw: 10, idleMinutesPerSession: 90, idleBillableSharePct: 25 },
    fleet: { sessionsPerChargePointMonth: 24, kwhPerChargePointMonth: 650, averageSessionDurationHours: 8, effectiveChargingPowerKw: 11, idleMinutesPerSession: 90, idleBillableSharePct: 5 },
    public: { sessionsPerChargePointMonth: 50, kwhPerChargePointMonth: 520, averageSessionDurationHours: 1.8, effectiveChargingPowerKw: 11, idleMinutesPerSession: 120, idleBillableSharePct: 20 },
    other: { sessionsPerChargePointMonth: 12, kwhPerChargePointMonth: 200, averageSessionDurationHours: 6, effectiveChargingPowerKw: 8, idleMinutesPerSession: 90, idleBillableSharePct: 15 },
  },
  offerTemplate: defaultOfferTemplate,
};

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Merge per locatietype: default + opgeslagen waarden veld-voor-veld, zodat oude rows
// (zonder de idle-velden) tóch geldige idle-defaults krijgen i.p.v. undefined → NaN.
function mergeLocationTypeDefaults(raw: unknown): ConfiguratorSettings["locationTypeDefaults"] {
  const base = defaultConfiguratorSettings.locationTypeDefaults;
  const rawMap = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<ConfiguratorSettings["locationTypeDefaults"][string]>>;
  const out: ConfiguratorSettings["locationTypeDefaults"] = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(rawMap)])) {
    const d = base[key] ?? base.workplace;
    const r = rawMap[key] ?? {};
    out[key] = {
      sessionsPerChargePointMonth: Math.max(0, numberOr(r.sessionsPerChargePointMonth, d.sessionsPerChargePointMonth)),
      kwhPerChargePointMonth: Math.max(0, numberOr(r.kwhPerChargePointMonth, d.kwhPerChargePointMonth)),
      averageSessionDurationHours: Math.max(0, numberOr(r.averageSessionDurationHours, d.averageSessionDurationHours)),
      effectiveChargingPowerKw: Math.max(0.1, numberOr(r.effectiveChargingPowerKw, d.effectiveChargingPowerKw)),
      idleMinutesPerSession: Math.max(0, numberOr(r.idleMinutesPerSession, d.idleMinutesPerSession)),
      idleBillableSharePct: Math.min(100, Math.max(0, numberOr(r.idleBillableSharePct, d.idleBillableSharePct))),
    };
  }
  return out;
}

export function normalizeSettings(value: unknown): ConfiguratorSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ConfiguratorSettings>;
  return {
    ...defaultConfiguratorSettings,
    ...raw,
    // Oude opgeslagen rows missen dit veld → val terug op de standaardmarge.
    echargingMarginPerKwh: Math.max(0, numberOr(raw.echargingMarginPerKwh, defaultConfiguratorSettings.echargingMarginPerKwh)),
    locationTypes: Array.isArray(raw.locationTypes) && raw.locationTypes.length > 0
      ? raw.locationTypes
      : defaultConfiguratorSettings.locationTypes,
    inputRanges: { ...defaultConfiguratorSettings.inputRanges, ...(raw.inputRanges ?? {}) },
    locationTypeDefaults: mergeLocationTypeDefaults(raw.locationTypeDefaults),
    // Oude rijen missen offerTemplate → val veld-voor-veld terug op de standaarden.
    offerTemplate: { ...defaultOfferTemplate, ...(raw.offerTemplate ?? {}) },
  };
}

export function normalizePricingInput(value: unknown, settings: ConfiguratorSettings): PricingInput {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<PricingInput>;
  const customer = (raw.customer ?? {}) as Partial<PricingInput["customer"]>;
  const hardware = (raw.hardware ?? {}) as Partial<PricingInput["hardware"]>;
  const usage = (raw.usage ?? {}) as Partial<PricingInput["usage"]>;
  const contract = (raw.contract ?? {}) as Partial<PricingInput["contract"]>;
  const tariffs = (raw.tariffs ?? {}) as Partial<PricingInput["tariffs"]>;
  const defaults = settings.locationTypeDefaults[customer.locationType ?? "workplace"] ?? settings.locationTypeDefaults.workplace;

  return {
    customer: {
      companyName: String(customer.companyName ?? "").trim(),
      contactName: String(customer.contactName ?? "").trim(),
      contactEmail: String(customer.contactEmail ?? "").trim(),
      contactPhone: String(customer.contactPhone ?? "").trim(),
      locationAddress: String(customer.locationAddress ?? "").trim(),
      postalCode: String(customer.postalCode ?? "").trim(),
      city: String(customer.city ?? "").trim(),
      locationType: String(customer.locationType ?? "workplace"),
    },
    hardware: {
      chargePoints: Math.max(1, Math.round(numberOr(hardware.chargePoints, 1))),
      socketsPerChargePoint: Math.max(1, numberOr(hardware.socketsPerChargePoint, 1)),
      hardwareInvestment: Math.max(0, numberOr(hardware.hardwareInvestment, 0)),
    },
    usage: {
      sessionsPerChargePointMonth: Math.max(0, numberOr(usage.sessionsPerChargePointMonth, defaults.sessionsPerChargePointMonth)),
      kwhPerChargePointMonth: Math.max(0, numberOr(usage.kwhPerChargePointMonth, defaults.kwhPerChargePointMonth)),
      averageSessionDurationHours: Math.max(0, numberOr(usage.averageSessionDurationHours, defaults.averageSessionDurationHours)),
      effectiveChargingPowerKw: Math.max(0.1, numberOr(usage.effectiveChargingPowerKw, defaults.effectiveChargingPowerKw)),
      idleMinutesPerSession: Math.max(0, numberOr(usage.idleMinutesPerSession, defaults.idleMinutesPerSession ?? 0)),
      idleBillableSharePct: Math.min(100, Math.max(0, numberOr(usage.idleBillableSharePct, defaults.idleBillableSharePct ?? 0))),
    },
    contract: {
      durationMonths: Math.max(1, Math.round(numberOr(contract.durationMonths, settings.defaultContractDurationMonths))),
      noticePeriodMonths: Math.max(0, Math.round(numberOr(contract.noticePeriodMonths, settings.defaultNoticePeriodMonths))),
    },
    tariffs: {
      chargeTariffPerKwh: Math.max(0, numberOr(tariffs.chargeTariffPerKwh, settings.defaultChargeTariffPerKwh)),
      energyCostPerKwh: Math.max(0, numberOr(tariffs.energyCostPerKwh, settings.defaultEnergyCostPerKwh)),
      startFeeEnabled: typeof tariffs.startFeeEnabled === "boolean" ? tariffs.startFeeEnabled : settings.defaultStartFeeEnabled,
      startFeePerSession: Math.max(0, numberOr(tariffs.startFeePerSession, settings.defaultStartFeePerSession)),
      idleFeeEnabled: typeof tariffs.idleFeeEnabled === "boolean" ? tariffs.idleFeeEnabled : settings.defaultIdleFeeEnabled,
      idleFeePerMinute: Math.max(0, numberOr(tariffs.idleFeePerMinute, settings.defaultIdleFeePerMinute)),
      idleGraceMinutes: Math.max(0, numberOr(tariffs.idleGraceMinutes, settings.defaultIdleGraceMinutes)),
    },
  };
}

export function calculatePricing(input: PricingInput, settings: ConfiguratorSettings) {
  const sessions = input.usage.sessionsPerChargePointMonth;
  const kwh = input.usage.kwhPerChargePointMonth;
  const kwhPerSession = sessions > 0 ? kwh / sessions : 0;
  const chargingMinutesPerSession = input.usage.effectiveChargingPowerKw > 0
    ? (kwhPerSession / input.usage.effectiveChargingPowerKw) * 60
    : 0;
  const sessionDurationMinutes = input.usage.averageSessionDurationHours * 60;
  // Referentie (oude afleiding sessieduur − laadtijd); telt NIET mee in de opbrengst.
  const derivedIdleMinutesPerSession = Math.max(0, sessionDurationMinutes - chargingMinutesPerSession);
  // Billing-basis: instelbare gem. stilstaande min/sessie + % sessies dat betaalt.
  const idleMinutesPerSession = Math.max(0, input.usage.idleMinutesPerSession);
  const idleBillableSharePct = Math.min(100, Math.max(0, input.usage.idleBillableSharePct));
  const billableIdleMinutesPerSession = input.tariffs.idleFeeEnabled
    ? Math.max(0, idleMinutesPerSession - input.tariffs.idleGraceMinutes)
    : 0;
  const effectiveBillableIdleMinutesPerSession = billableIdleMinutesPerSession * (idleBillableSharePct / 100);
  const billableIdleMinutesPerChargePointMonth = effectiveBillableIdleMinutesPerSession * sessions;
  const grossChargingRevenuePerChargePointMonth = kwh * input.tariffs.chargeTariffPerKwh;
  const energyCostPerChargePointMonth = -(kwh * input.tariffs.energyCostPerKwh);
  const startFeeRevenuePerChargePointMonth = input.tariffs.startFeeEnabled ? sessions * input.tariffs.startFeePerSession : 0;
  const idleFeeRevenuePerChargePointMonth = input.tariffs.idleFeeEnabled
    ? billableIdleMinutesPerChargePointMonth * input.tariffs.idleFeePerMinute
    : 0;
  const netReturnPerChargePointMonth =
    grossChargingRevenuePerChargePointMonth +
    energyCostPerChargePointMonth +
    startFeeRevenuePerChargePointMonth +
    idleFeeRevenuePerChargePointMonth;

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
  const blockingReasons: string[] = [];

  if (netReturnPerChargePointMonth <= 0) {
    blockingReasons.push("Netto rendement is nul of negatief.");
  }

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ok",
    blockingReasons,
    kwhPerSession,
    chargingMinutesPerSession,
    sessionDurationMinutes,
    derivedIdleMinutesPerSession,
    idleMinutesPerSession,
    idleBillableSharePct,
    billableIdleMinutesPerSession,
    effectiveBillableIdleMinutesPerSession,
    billableIdleMinutesPerChargePointMonth,
    grossChargingRevenuePerChargePointMonth,
    energyCostPerChargePointMonth,
    startFeeRevenuePerChargePointMonth,
    idleFeeRevenuePerChargePointMonth,
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
