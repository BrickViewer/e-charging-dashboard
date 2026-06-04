import { createConfiguratorApi } from "@echarging/api-client";

export const configuratorApi = createConfiguratorApi({
  baseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
});
