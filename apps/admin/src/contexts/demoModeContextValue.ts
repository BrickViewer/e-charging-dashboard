// Demo-modus voor het klantportaal (sales-demo op fictieve data).
// Default false: buiten de DemoModeProvider gedraagt alles zich exact als het
// echte portaal. Gesplitst van de provider voor react-refresh (zelfde patroon
// als authContextValue).
import { createContext, useContext } from "react";

export const DemoModeContext = createContext<boolean>(false);

export function useDemoMode(): boolean {
  return useContext(DemoModeContext);
}
