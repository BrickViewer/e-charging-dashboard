import { useNavigate } from "react-router-dom";
import { Zap, MapPin, TrendingUp, ArrowRight } from "lucide-react";
import { DemoShell } from "@/components/portal/DemoShell";
import { SCENARIO_KEYS, scenarioDescriptor, type ScenarioKey } from "@/lib/demoScenarios";

const SS_SCENARIO = "demo.scenario";
const SS_LEAD = "demo.leadId";

export function DemoScenarioChooser() {
  const navigate = useNavigate();

  const pick = (key: ScenarioKey) => {
    sessionStorage.setItem(SS_SCENARIO, String(key));
    sessionStorage.removeItem(SS_LEAD);
    navigate(`/demo?scenario=${key}`);
  };

  return (
    <DemoShell>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/80">Demo-omgeving</p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold">Kies een demo-scenario</h1>
          <p className="mt-3 text-sm md:text-base text-muted-foreground">
            Laat een prospect zien hoe hun portaal eruitziet. Kies de schaal die het beste past.
          </p>
        </div>

        <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
          {SCENARIO_KEYS.map((key) => {
            const d = scenarioDescriptor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-[hsl(var(--gauge-green)/0.6)] hover:shadow-[0_0_0_1px_hsl(var(--gauge-green)/0.4),0_12px_40px_-12px_hsl(var(--gauge-green)/0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gauge-green))]"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-semibold tabular-nums leading-none">{key}</span>
                  <span className="text-sm text-muted-foreground">laadpalen</span>
                </div>

                <div className="mt-6 space-y-2.5 text-sm">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Zap className="h-4 w-4 shrink-0 text-[hsl(var(--gauge-green))]" />
                    <span className="truncate text-foreground">{d.klant}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-[hsl(var(--gauge-green))]" />
                    <span>{d.locaties} {d.locaties === 1 ? "locatie" : "locaties"}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <TrendingUp className="h-4 w-4 shrink-0 text-[hsl(var(--gauge-green))]" />
                    <span>{d.maandopbrengst} <span className="text-muted-foreground/70">per maand (indicatief)</span></span>
                  </div>
                </div>

                <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--gauge-green))]">
                  Open demo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-muted-foreground/70">
          Tip: vanuit de configurator open je een demo met exact de geconfigureerde gegevens.
        </p>
      </div>
    </DemoShell>
  );
}
