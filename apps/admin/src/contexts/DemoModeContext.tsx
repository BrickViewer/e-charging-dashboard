import type { ReactNode } from "react";
import { DemoModeContext } from "@/contexts/demoModeContextValue";

/** Markeert de subtree als demo-omgeving: alle portal-datahooks en -services
 *  schakelen dan over op de fixtures uit lib/demoData.ts. */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  return <DemoModeContext.Provider value={true}>{children}</DemoModeContext.Provider>;
}
