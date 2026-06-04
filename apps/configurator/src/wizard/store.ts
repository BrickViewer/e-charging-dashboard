import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ConfiguratorSettings, PricingInput } from "@echarging/pricing-engine";
import { defaultConfiguratorSettings, pricingInputSchema } from "@echarging/pricing-engine";

export const steps = [
  { id: 1, label: "Klant" },
  { id: 2, label: "Gebruik" },
  { id: 3, label: "Service" },
  { id: 4, label: "Tarieven" },
  { id: 5, label: "Samenvatting" },
];

export function createDefaultInput(settings: ConfiguratorSettings = defaultConfiguratorSettings): PricingInput {
  const usage = settings.locationTypeDefaults.workplace;
  return pricingInputSchema.parse({
    customer: {
      companyName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      locationAddress: "",
      postalCode: "",
      city: "",
      locationType: "workplace",
    },
    hardware: {
      chargePoints: 10,
      socketsPerChargePoint: 1,
      hardwareInvestment: 0,
    },
    usage,
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
    },
    targetMode: { type: "tieredTarget" },
  });
}

type WizardStore = {
  input: PricingInput;
  settings: ConfiguratorSettings;
  settingsVersion: number;
  sellerMode: boolean;
  applySettings: (settings: ConfiguratorSettings, version: number) => void;
  updateInput: (updater: (draft: PricingInput) => void) => void;
  setLocationType: (locationType: PricingInput["customer"]["locationType"]) => void;
  setSellerMode: (sellerMode: boolean) => void;
};

export const useWizardStore = create<WizardStore>()(
  immer((set) => ({
    input: createDefaultInput(defaultConfiguratorSettings),
    settings: defaultConfiguratorSettings,
    settingsVersion: 1,
    sellerMode: true,
    applySettings: (settings, version) =>
      set((state) => {
        const currentType = state.input.customer.locationType;
        state.settings = settings;
        state.settingsVersion = version;
        state.input.contract.durationMonths = settings.defaultContractDurationMonths;
        state.input.contract.noticePeriodMonths = settings.defaultNoticePeriodMonths;
        state.input.usage = settings.locationTypeDefaults[currentType];
      }),
    updateInput: (updater) => set((state) => updater(state.input)),
    setLocationType: (locationType) =>
      set((state) => {
        state.input.customer.locationType = locationType;
        state.input.usage = state.settings.locationTypeDefaults[locationType];
      }),
    setSellerMode: (sellerMode) => set((state) => { state.sellerMode = sellerMode; }),
  })),
);
