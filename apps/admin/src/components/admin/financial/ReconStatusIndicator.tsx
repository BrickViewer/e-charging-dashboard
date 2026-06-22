import { CheckCircle2, AlertTriangle, Clock, FileQuestion } from "lucide-react";
import { formatEuro } from "@/services/calculations";
import type { MonthlyFinancialRow } from "@/hooks/useAdminData";

// Toont of de maand sluit (eFlux-vergoeding = sessie-omzet × 1,21) of een verschil heeft.
export function ReconStatusIndicator({ status, diff }: { status: MonthlyFinancialRow["recon_status"]; diff: number }) {
  if (status === "sluit") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-primary" title="eFlux-vergoeding sluit op de cent met onze sessie-omzet.">
        <CheckCircle2 className="h-4 w-4" /> Sluit
      </span>
    );
  }
  if (status === "verschil") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-medium text-[hsl(var(--status-amber))]"
        title="Onze sessie-omzet × 1,21 wijkt af van de eFlux-creditfactuur. Vaak maandgrens-timing: een verschil dat in de aangrenzende maand tegengesteld terugkomt en saldeert. Controleer beide maanden."
      >
        <AlertTriangle className="h-4 w-4" /> {formatEuro(diff)}
      </span>
    );
  }
  if (status === "lopend") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Lopende maand — eFlux heeft nog geen creditfactuur opgemaakt.">
        <Clock className="h-4 w-4" /> Lopend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Nog geen eFlux-creditfactuur voor deze maand ontvangen.">
      <FileQuestion className="h-4 w-4" /> Geen factuur
    </span>
  );
}
