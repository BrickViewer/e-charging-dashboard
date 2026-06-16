import { createContext, useContext } from "react";
import type { DemoDataset } from "@/lib/demoData";

// De actieve demo-dataset (scenario of config-gedreven). null buiten de demo.
export const DemoDatasetContext = createContext<DemoDataset | null>(null);

export function useDemoDataset(): DemoDataset {
  const ds = useContext(DemoDatasetContext);
  if (!ds) throw new Error("useDemoDataset moet binnen een DemoDatasetProvider gebruikt worden");
  return ds;
}

// Niet-gooiende variant voor hooks/pagina's die ook buiten de demo draaien.
export function useDemoDatasetOptional(): DemoDataset | null {
  return useContext(DemoDatasetContext);
}
