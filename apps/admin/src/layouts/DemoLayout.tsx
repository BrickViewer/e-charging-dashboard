import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildDemoDataset, type DemoParams } from "@/lib/demoData";
import {
  DEMO_SCENARIOS,
  isScenarioKey,
  demoParamsFromConfiguration,
  decodeDemoConfig,
  type LeadConfiguration,
} from "@/lib/demoScenarios";
import { DemoDatasetProvider } from "@/contexts/DemoDatasetContext";
import type { ConfiguratorSeed, ConfiguratorSource } from "@/contexts/demoConfiguratorSourceValue";
import { DemoShell } from "@/components/portal/DemoShell";
import { DemoScenarioChooser } from "@/components/portal/DemoScenarioChooser";
import ClientLayout from "@/layouts/ClientLayout";

const SS_SCENARIO = "demo.scenario";
const SS_LEAD = "demo.leadId";
const SS_CFG = "demo.cfg";

function DemoMessage({ title, sub }: { title: string; sub?: string }) {
  return (
    <DemoShell>
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-medium">{title}</p>
        {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
      </div>
    </DemoShell>
  );
}

// Beslist op /demo tussen het keuzescherm en het portaal. Leest cfg/scenario/leadId
// uit de URL (met sessionStorage-fallback zodat nav binnen de demo + refresh de
// keuze behouden), bouwt de bijbehorende dataset en levert die via context.
// `cfg` (config-in-de-link) is no-login: geen Supabase-call. `leadId` is een
// ingelogde fallback. Prioriteit: cfg > leadId > scenario.
// Demo-schaal → configurator-seed (palen/verbruik). Voor presets/scenario's zonder
// lead; de configurator start hiermee voorgevuld. Met een lead is geen seed nodig.
function seedFromParams(p: DemoParams): ConfiguratorSeed {
  return {
    chargePoints: p.chargePoints,
    kwhPerChargePointMonth: p.kwhPerCpMonth,
    sessionsPerChargePointMonth: p.sessionsPerCpMonth,
    effectiveChargingPowerKw: p.chargerPowerKw ?? 11,
    ere: p.ereEnabled === true,
  };
}

export default function DemoLayout() {
  const [sp] = useSearchParams();
  const cfgParam = sp.get("cfg");
  const scenarioParam = sp.get("scenario");
  const leadParam = sp.get("leadId");

  const { cfg, scenario, leadId } = useMemo(() => {
    let c: string | null = cfgParam || null;
    let s: number | null = scenarioParam ? Number(scenarioParam) : null;
    let l: string | null = leadParam || null;
    // Portal-navlinks dragen de query niet mee → val terug op sessionStorage.
    if (!c && !s && !l && typeof sessionStorage !== "undefined") {
      const ssCfg = sessionStorage.getItem(SS_CFG);
      const ssLead = sessionStorage.getItem(SS_LEAD);
      const ssScenario = sessionStorage.getItem(SS_SCENARIO);
      if (ssCfg) c = ssCfg;
      else if (ssLead) l = ssLead;
      else if (ssScenario) s = Number(ssScenario);
    }
    // Bewaar de actieve keuze en wis de andere, zodat er geen oude keuze blijft hangen.
    if (typeof sessionStorage !== "undefined") {
      if (c) { sessionStorage.setItem(SS_CFG, c); sessionStorage.removeItem(SS_LEAD); sessionStorage.removeItem(SS_SCENARIO); }
      else if (l) { sessionStorage.setItem(SS_LEAD, l); sessionStorage.removeItem(SS_CFG); sessionStorage.removeItem(SS_SCENARIO); }
      else if (s) { sessionStorage.setItem(SS_SCENARIO, String(s)); sessionStorage.removeItem(SS_CFG); sessionStorage.removeItem(SS_LEAD); }
    }
    return { cfg: c, scenario: s, leadId: l };
  }, [cfgParam, scenarioParam, leadParam]);

  // leadId-fallback (ingelogd): haalt de configuratie uit de DB. Bij een cfg-link
  // niet nodig — die staat al in de link.
  const leadQuery = useQuery({
    queryKey: ["demo-lead-config", leadId],
    enabled: !!leadId && !cfg,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("configuration, company_name, contact_name")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { dataset, source } = useMemo<{ dataset: ReturnType<typeof buildDemoDataset> | null; source: ConfiguratorSource | null }>(() => {
    if (cfg) {
      // No-login: config staat in de link, geen Supabase-call.
      try {
        const payload = decodeDemoConfig(cfg);
        const params = demoParamsFromConfiguration(payload.leadId || "demo", payload.config);
        const src: ConfiguratorSource = payload.leadId
          ? { leadId: payload.leadId, seed: null }
          : { leadId: null, seed: seedFromParams(params) };
        return { dataset: buildDemoDataset(params), source: src };
      } catch {
        return { dataset: null, source: null };
      }
    }
    if (leadId) {
      if (!leadQuery.data) return { dataset: null, source: null };
      const params = demoParamsFromConfiguration(
        leadId,
        leadQuery.data.configuration as LeadConfiguration | null,
      );
      return { dataset: buildDemoDataset(params), source: { leadId, seed: null } };
    }
    if (scenario && isScenarioKey(scenario)) {
      const params = DEMO_SCENARIOS[scenario];
      return { dataset: buildDemoDataset(params), source: { leadId: null, seed: seedFromParams(params) } };
    }
    return { dataset: null, source: null };
  }, [cfg, leadId, leadQuery.data, scenario]);

  if (!cfg && !leadId && !(scenario && isScenarioKey(scenario))) return <DemoScenarioChooser />;
  if (cfg && !dataset) {
    return <DemoMessage title="Configuratie niet leesbaar" sub="Open de demo opnieuw vanuit de configurator." />;
  }
  if (leadId && !cfg && leadQuery.isLoading) return <DemoMessage title="Demo wordt voorbereid…" />;
  if (leadId && !cfg && (leadQuery.isError || !leadQuery.data)) {
    return <DemoMessage title="Configuratie niet gevonden" sub="Open de demo opnieuw vanuit de configurator." />;
  }
  if (!dataset) return <DemoMessage title="Demo wordt voorbereid…" />;

  return (
    <DemoDatasetProvider dataset={dataset} source={source}>
      <ClientLayout />
    </DemoDatasetProvider>
  );
}
