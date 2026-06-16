import type { ReactNode } from "react";
import type { DemoDataset } from "@/lib/demoData";
import { DemoDatasetContext } from "@/contexts/demoDatasetContextValue";
import { DemoModeProvider } from "@/contexts/DemoModeContext";

// Levert de actieve demo-dataset én zet demo-modus aan (zodat ClientLayout/
// NavIconBar's `useDemoMode()` blijft werken).
export function DemoDatasetProvider({ dataset, children }: { dataset: DemoDataset; children: ReactNode }) {
  return (
    <DemoDatasetContext.Provider value={dataset}>
      <DemoModeProvider>{children}</DemoModeProvider>
    </DemoDatasetContext.Provider>
  );
}
