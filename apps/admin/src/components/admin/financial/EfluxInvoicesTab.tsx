import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Minus, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { useEfluxInvoices } from "@/hooks/useAdminData";
import { formatEuro } from "@/services/calculations";
import { monthFullLabel } from "@/lib/period";
import { PeriodStepper } from "@/components/portal/PeriodStepper";

// Tab 3 — ruwe eFlux-facturen (read-only). cpo-credit = vergoeding aan ons, cpo-usage = platformkosten.
export function EfluxInvoicesTab() {
  const { data, isLoading, isError, refetch } = useEfluxInvoices();

  const years = useMemo(() => {
    const set = new Set<number>((data ?? []).map((r) => r.year ?? 0).filter(Boolean));
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);
  const [yearIdx, setYearIdx] = useState<number | null>(null);
  const idx = yearIdx ?? Math.max(0, years.length - 1);
  const year = years[idx];
  const rows = useMemo(
    () => (data ?? []).filter((r) => r.year === year),
    [data, year],
  );

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  // Laadfout — de eFlux-facturen konden niet geladen worden; bied een retry i.p.v.
  // stilzwijgend de lege "geen facturen gevonden"-staat te tonen.
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
      >
        <div className="flex items-center gap-2 text-sm text-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
          <span>De eFlux-facturen konden niet worden geladen. Controleer je verbinding en probeer opnieuw.</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">eFlux-facturen</h2>
          <p className="text-sm text-muted-foreground">
            Vergoeding (credit) die eFlux ons betaalt en platformkosten (usage) die eFlux ons rekent.
          </p>
        </div>
        {years.length > 0 && (
          <PeriodStepper label={`Heel ${year}`} index={idx} count={years.length} onIndexChange={setYearIdx} />
        )}
      </div>

      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-left font-medium">Maand</th>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="p-3 text-right font-medium">Bedrag incl. BTW</th>
                  <th className="p-3 text-center font-medium">Betaald</th>
                  <th className="p-3 text-left font-medium">Identifier</th>
                  <th className="p-3 text-left font-medium">Account</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isCredit = r.type === "cpo-credit";
                  const amount = isCredit
                    ? Number(r.total_credit_amount_with_vat || 0)
                    : Number(r.total_amount_with_vat || 0);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="p-3 font-medium capitalize">{r.year && r.month ? monthFullLabel(r.year, r.month) : "—"}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                          isCredit
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-[hsl(var(--status-amber)/0.3)] bg-[hsl(var(--status-amber)/0.1)] text-[hsl(var(--status-amber))]"
                        }`}>
                          {isCredit ? "Vergoeding" : "Kosten"}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatEuro(amount)}</td>
                      <td className="p-3 text-center">
                        {r.has_error ? (
                          <AlertTriangle className="mx-auto h-4 w-4 text-[hsl(var(--status-red))]" />
                        ) : r.is_paid ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-primary" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{r.identifier ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{r.account_name ?? "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Geen eFlux-facturen gevonden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
