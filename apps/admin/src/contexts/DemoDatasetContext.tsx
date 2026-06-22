import type { ReactNode } from "react";
import type { DemoDataset } from "@/lib/demoData";
import { DemoDatasetContext } from "@/contexts/demoDatasetContextValue";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { DemoConfiguratorSourceContext, type ConfiguratorSource } from "@/contexts/demoConfiguratorSourceValue";

// Levert de actieve demo-dataset én zet demo-modus aan (zodat ClientLayout/
// NavIconBar's `useDemoMode()` blijft werken). `source` voedt de "Start configurator"-
// knop: de lead of de demo-schaal achter deze demo.
export function DemoDatasetProvider({
  dataset,
  source = null,
  children,
}: {
  dataset: DemoDataset;
  source?: ConfiguratorSource | null;
  children: ReactNode;
}) {
  return (
    <DemoDatasetContext.Provider value={dataset}>
      <DemoConfiguratorSourceContext.Provider value={source}>
        <DemoModeProvider>{children}</DemoModeProvider>
      </DemoConfiguratorSourceContext.Provider>
    </DemoDatasetContext.Provider>
  );
}
