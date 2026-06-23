import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ConfiguratorSettings, PricingInput } from "@echarging/pricing-engine";
import { defaultConfiguratorSettings, pricingInputSchema } from "@echarging/pricing-engine";

// Alle cijfers komen uit de admin-instellingen (ConfiguratorSettings). Hieronder
// staan alleen afgeleide helpers — geen hardcoded tarieven/grenzen meer.

function firstLocationKey(settings: ConfiguratorSettings): string {
  return settings.locationTypes[0]?.key ?? "workplace";
}

function usageFor(settings: ConfiguratorSettings, key: string): PricingInput["usage"] {
  return (
    settings.locationTypeDefaults[key] ??
    settings.locationTypeDefaults[firstLocationKey(settings)] ??
    Object.values(settings.locationTypeDefaults)[0]
  );
}

// Totale investeringsband + gemiddelde, afgeleid van de schatting per laadpunt.
function bandFor(settings: ConfiguratorSettings, sockets: number) {
  const min = sockets * settings.investmentPerSocketLow;
  const max = sockets * settings.investmentPerSocketHigh;
  return { min, max, avg: Math.round((min + max) / 2) };
}

export function createDefaultInput(settings: ConfiguratorSettings = defaultConfiguratorSettings): PricingInput {
  const locationType = firstLocationKey(settings);
  const sockets = settings.defaultSocketCount;
  const band = bandFor(settings, sockets);
  return pricingInputSchema.parse({
    customer: {
      companyName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      locationAddress: "",
      postalCode: "",
      city: "",
      locationType,
    },
    hardware: {
      // "Sockets" is de enige hardware-invoer: 1 socket = 1 laadpunt = 1 chargePoint.
      chargePoints: sockets,
      socketsPerChargePoint: 1,
      hardwareInvestment: band.avg,
    },
    usage: usageFor(settings, locationType),
    contract: {
      durationMonths: settings.defaultContractDurationMonths,
      noticePeriodMonths: settings.defaultNoticePeriodMonths,
    },
    tariffs: {
      chargeTariffPerKwh: settings.defaultChargeTariffPerKwh,
      energyCostPerKwh: settings.defaultEnergyCostPerKwh,
      startFeeEnabled: settings.defaultStartFeeEnabled,
      startFeePerSession: settings.defaultStartFeePerSession,
      idleFeeEnabled: settings.defaultIdleFeeEnabled,
      idleFeePerMinute: settings.defaultIdleFeePerMinute,
      idleGraceMinutes: settings.defaultIdleGraceMinutes,
      perHourFeeEnabled: settings.defaultPerHourFeeEnabled,
      perHourFeePerHour: settings.defaultPerHourFeePerHour,
    },
  });
}

type WizardStore = {
  input: PricingInput;
  // Totale investeringsband (UI-only): bepaalt de terugverdientijd-range.
  investmentMinTotal: number;
  investmentMaxTotal: number;
  // ERE-subsidie aan/uit (tarief zelf staat in settings.ereSubsidyPerKwh).
  ereEnabled: boolean;
  settings: ConfiguratorSettings;
  settingsVersion: number;
  applySettings: (settings: ConfiguratorSettings, version: number) => void;
  updateInput: (updater: (draft: PricingInput) => void) => void;
  setSockets: (count: number) => void;
  setInvestmentRange: (min: number, max: number) => void;
  setEreEnabled: (enabled: boolean) => void;
  setLocationType: (locationType: string) => void;
  // Laadt een eerder opgeslagen configuratie (lead) volledig in.
  hydrateFromSaved: (
    input: PricingInput,
    extras: { ere: boolean; investmentMin: number | null; investmentMax: number | null },
  ) => void;
};

const initialBand = bandFor(defaultConfiguratorSettings, defaultConfiguratorSettings.defaultSocketCount);

export const useWizardStore = create<WizardStore>()(
  immer((set) => ({
    input: createDefaultInput(defaultConfiguratorSettings),
    investmentMinTotal: initialBand.min,
    investmentMaxTotal: initialBand.max,
    ereEnabled: defaultConfiguratorSettings.ereEnabledByDefault,
    settings: defaultConfiguratorSettings,
    settingsVersion: 1,
    applySettings: (settings, version) =>
      set((state) => {
        state.settings = settings;
        state.settingsVersion = version;
        state.input.contract.durationMonths = settings.defaultContractDurationMonths;
        state.input.contract.noticePeriodMonths = settings.defaultNoticePeriodMonths;
        // Locatietype geldig houden t.o.v. de (mogelijk gewijzigde) types.
        const validKey = settings.locationTypes.some((t) => t.key === state.input.customer.locationType)
          ? state.input.customer.locationType
          : firstLocationKey(settings);
        state.input.customer.locationType = validKey;
        state.input.usage = usageFor(settings, validKey);
        // Aantal laadpunten + investeringsband (her)afleiden uit settings.
        const sockets = settings.defaultSocketCount;
        state.input.hardware.chargePoints = sockets;
        state.input.hardware.socketsPerChargePoint = 1;
        const band = bandFor(settings, sockets);
        state.investmentMinTotal = band.min;
        state.investmentMaxTotal = band.max;
        state.input.hardware.hardwareInvestment = band.avg;
        state.ereEnabled = settings.ereEnabledByDefault;
        // Tariefdefaults uit de admin-instellingen toepassen (laad-/stroomtarief +
        // start- en blokkeertarief, incl. of ze standaard aan staan). Bij een
        // opgeslagen lead overschrijft hydrateFromSaved dit hierna (keuze: herstellen).
        state.input.tariffs.chargeTariffPerKwh = settings.defaultChargeTariffPerKwh;
        state.input.tariffs.energyCostPerKwh = settings.defaultEnergyCostPerKwh;
        state.input.tariffs.startFeeEnabled = settings.defaultStartFeeEnabled;
        state.input.tariffs.startFeePerSession = settings.defaultStartFeePerSession;
        state.input.tariffs.idleFeeEnabled = settings.defaultIdleFeeEnabled;
        state.input.tariffs.idleFeePerMinute = settings.defaultIdleFeePerMinute;
        state.input.tariffs.idleGraceMinutes = settings.defaultIdleGraceMinutes;
        state.input.tariffs.perHourFeeEnabled = settings.defaultPerHourFeeEnabled;
        state.input.tariffs.perHourFeePerHour = settings.defaultPerHourFeePerHour;
      }),
    updateInput: (updater) => set((state) => updater(state.input)),
    setSockets: (count) =>
      set((state) => {
        const n = Math.max(1, Math.round(count) || 1);
        state.input.hardware.chargePoints = n;
        state.input.hardware.socketsPerChargePoint = 1;
        const band = bandFor(state.settings, n);
        state.investmentMinTotal = band.min;
        state.investmentMaxTotal = band.max;
        state.input.hardware.hardwareInvestment = band.avg;
      }),
    setInvestmentRange: (min, max) =>
      set((state) => {
        const lo = Math.max(0, Math.round(min) || 0);
        const hi = Math.max(lo, Math.round(max) || 0);
        state.investmentMinTotal = lo;
        state.investmentMaxTotal = hi;
        state.input.hardware.hardwareInvestment = Math.round((lo + hi) / 2);
      }),
    setEreEnabled: (enabled) => set((state) => { state.ereEnabled = enabled; }),
    setLocationType: (locationType) =>
      set((state) => {
        state.input.customer.locationType = locationType;
        state.input.usage = usageFor(state.settings, locationType);
      }),
    hydrateFromSaved: (input, extras) =>
      set((state) => {
        const parsed = pricingInputSchema.parse(input);
        state.input = parsed;
        if (extras.investmentMin != null && extras.investmentMax != null) {
          const lo = Math.max(0, Math.round(extras.investmentMin));
          state.investmentMinTotal = lo;
          state.investmentMaxTotal = Math.max(lo, Math.round(extras.investmentMax));
        } else {
          const band = bandFor(state.settings, parsed.hardware.chargePoints);
          state.investmentMinTotal = band.min;
          state.investmentMaxTotal = band.max;
        }
        state.ereEnabled = extras.ere;
      }),
  })),
);
