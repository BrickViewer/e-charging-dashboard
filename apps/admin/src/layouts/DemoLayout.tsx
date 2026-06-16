import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildDemoDataset } from "@/lib/demoData";
import {
  DEMO_SCENARIOS,
  isScenarioKey,
  demoParamsFromConfiguration,
  type LeadConfiguration,
} from "@/lib/demoScenarios";
import { DemoDatasetProvider } from "@/contexts/DemoDatasetContext";
import { DemoShell } from "@/components/portal/DemoShell";
import { DemoScenarioChooser } from "@/components/portal/DemoScenarioChooser";
import ClientLayout from "@/layouts/ClientLayout";

const SS_SCENARIO = "demo.scenario";
const SS_LEAD = "demo.leadId";

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

// Beslist op /demo tussen het keuzescherm en het portaal. Leest scenario/leadId
// uit de URL (met sessionStorage-fallback zodat nav binnen de demo + refresh de
// keuze behouden), bouwt de bijbehorende dataset en levert die via context.
export default function DemoLayout() {
  const [sp] = useSearchParams();
  const scenarioParam = sp.get("scenario");
  const leadParam = sp.get("leadId");

  const { scenario, leadId } = useMemo(() => {
    let s: number | null = scenarioParam ? Number(scenarioParam) : null;
    let l: string | null = leadParam || null;
    if (!s && !l && typeof sessionStorage !== "undefined") {
      const ssLead = sessionStorage.getItem(SS_LEAD);
      const ssScenario = sessionStorage.getItem(SS_SCENARIO);
      if (ssLead) l = ssLead;
      else if (ssScenario) s = Number(ssScenario);
    }
    if (typeof sessionStorage !== "undefined") {
      if (l) { sessionStorage.setItem(SS_LEAD, l); sessionStorage.removeItem(SS_SCENARIO); }
      else if (s) { sessionStorage.setItem(SS_SCENARIO, String(s)); sessionStorage.removeItem(SS_LEAD); }
    }
    return { scenario: s, leadId: l };
  }, [scenarioParam, leadParam]);

  // leadId wint (config-gedreven demo, vergrendeld op de exacte configuratie).
  const leadQuery = useQuery({
    queryKey: ["demo-lead-config", leadId],
    enabled: !!leadId,
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

  const dataset = useMemo(() => {
    if (leadId) {
      if (!leadQuery.data) return null;
      const params = demoParamsFromConfiguration(
        leadId,
        leadQuery.data.configuration as LeadConfiguration | null,
        leadQuery.data.company_name,
      );
      return buildDemoDataset(params);
    }
    if (scenario && isScenarioKey(scenario)) return buildDemoDataset(DEMO_SCENARIOS[scenario]);
    return null;
  }, [leadId, leadQuery.data, scenario]);

  if (!leadId && !(scenario && isScenarioKey(scenario))) return <DemoScenarioChooser />;
  if (leadId && leadQuery.isLoading) return <DemoMessage title="Demo wordt voorbereid…" />;
  if (leadId && (leadQuery.isError || !leadQuery.data)) {
    return <DemoMessage title="Configuratie niet gevonden" sub="Open de demo opnieuw vanuit de configurator." />;
  }
  if (!dataset) return <DemoMessage title="Demo wordt voorbereid…" />;

  return (
    <DemoDatasetProvider dataset={dataset}>
      <ClientLayout />
    </DemoDatasetProvider>
  );
}
