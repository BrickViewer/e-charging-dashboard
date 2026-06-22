import { createContext, useContext } from "react";

// De "bron" achter de actieve demo, zodat de demo door kan naar de configurator:
// óf een bestaande lead (heropenen met opgeslagen config), óf een seed (de demo-
// schaal: palen/verbruik) voor een verse, voorgevulde configurator-sessie.
export type ConfiguratorSeed = {
  chargePoints: number;
  kwhPerChargePointMonth: number;
  sessionsPerChargePointMonth: number;
  effectiveChargingPowerKw: number;
  locationType?: string;
  ere?: boolean;
};

export type ConfiguratorSource = {
  leadId: string | null;
  seed: ConfiguratorSeed | null;
};

export const DemoConfiguratorSourceContext = createContext<ConfiguratorSource | null>(null);

export function useConfiguratorSource(): ConfiguratorSource | null {
  return useContext(DemoConfiguratorSourceContext);
}
