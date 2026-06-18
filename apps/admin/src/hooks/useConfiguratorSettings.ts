import { useQuery } from "@tanstack/react-query";
import { configuratorSettingsSchema, defaultConfiguratorSettings, type ConfiguratorSettings } from "@echarging/pricing-engine";
import { supabase } from "@/integrations/supabase/client";

// Haalt de actieve configurator-instellingen op (zelfde edge function als de
// instellingenpagina). Gebruikt o.a. door het offerte-bewerkscherm om de
// offerte-sjabloon-standaarden voor te vullen.
export function useConfiguratorSettings() {
  return useQuery<ConfiguratorSettings>({
    queryKey: ["configurator-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ version: number; settings: ConfiguratorSettings }>(
        "configurator-settings",
        { body: { action: "get" } },
      );
      if (error) throw error;
      const parsed = configuratorSettingsSchema.safeParse(data?.settings);
      return parsed.success ? parsed.data : defaultConfiguratorSettings;
    },
  });
}
