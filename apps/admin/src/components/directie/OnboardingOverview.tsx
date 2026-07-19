// Onboarding-statusoverzicht voor het directie-dashboard: de pijplijn (hoeveel
// onboardings in welke fase) + een geprioriteerde "aandacht nodig"-lijst zodat
// de CEO altijd ziet wat er nog moet gebeuren en niets blijft liggen. Leunt op
// de bestaande onboarding-hooks + de pure samenvatting in services/onboardingOverview.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, CheckCircle2, ChevronRight, Rocket } from "lucide-react";
import { ONBOARDING_STAGES, useOnboardingClients, useOnboardingOrders } from "@/hooks/useOnboarding";
import { useSignedQuotesAwaitingClient } from "@/hooks/useQuotes";
import { onboardingName, summarizeOnboarding, type AttentionTone } from "@/services/onboardingOverview";

const STAGE_META = new Map(ONBOARDING_STAGES.map((s) => [s.key, s]));
const GETEKEND = STAGE_META.get("getekend");

interface ActionRow {
  key: string;
  name: string;
  stageLabel?: string;
  stageColor?: string;
  tone: AttentionTone;
  label: string;
  priority: number;
}

const TONE_CLASS: Record<AttentionTone, string> = {
  red: "bg-destructive/10 text-destructive",
  amber: "bg-[hsl(var(--status-amber)/0.14)] text-[hsl(var(--status-amber))]",
  green: "bg-[hsl(var(--status-green,152_60%_40%)/0.14)] text-[hsl(var(--status-green,152_60%_40%))]",
  muted: "bg-muted text-muted-foreground",
};

const MAX_ATTENTION = 6;

function formatPlanDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export function OnboardingOverview() {
  const clientsQ = useOnboardingClients();
  const ordersQ = useOnboardingOrders();
  // Getekende offertes zonder klantaccount (nog géén klant/order) — de eerste
  // onboardingstap. Vallen anders buiten clients + order-only, dus expliciet erbij.
  const awaitingQ = useSignedQuotesAwaitingClient();
  const isLoading = clientsQ.isLoading || ordersQ.isLoading || awaitingQ.isLoading;

  const summary = useMemo(
    () => summarizeOnboarding([...(clientsQ.data ?? []), ...(ordersQ.data ?? [])]),
    [clientsQ.data, ordersQ.data],
  );

  const awaiting = useMemo(
    () => (awaitingQ.data ?? []).map((q) => ({
      id: q.id,
      name: (q.prospect_company ?? "").trim() || (q.prospect_contact ?? "").trim() || q.quote_number || "Getekende offerte",
    })),
    [awaitingQ.data],
  );

  // Getekende-offertes tellen als fase "getekend" en hebben altijd actie nodig
  // (klantaccount aanmaken). Samen met de aandachtslijst gesorteerd op urgentie.
  const total = summary.total + awaiting.length;
  const getekenedCount = summary.stageCounts.getekend + awaiting.length;
  const actionRows: ActionRow[] = [
    ...awaiting.map((a) => ({ key: `q-${a.id}`, name: a.name, stageLabel: GETEKEND?.label, stageColor: GETEKEND?.color, tone: "amber" as AttentionTone, label: "Klant account aanmaken", priority: 4 })),
    ...summary.attention.map((a) => ({ key: `c-${a.item.id}`, name: onboardingName(a.item), stageLabel: STAGE_META.get(a.stage)?.label, stageColor: STAGE_META.get(a.stage)?.color, tone: a.tone, label: a.label, priority: a.priority })),
  ].sort((x, y) => x.priority - y.priority);

  // Actieve fases (archief apart onderaan getoond).
  const pipelineStages = ONBOARDING_STAGES.filter((s) => s.key !== "archief");

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Rocket className="h-3.5 w-3.5" /> Onboarding
            {!isLoading && <span className="text-foreground">· {total} lopend</span>}
          </p>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to="/sales/onboarding">Naar onboarding</Link></Button>
        </div>

        {isLoading ? (
          <>
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </>
        ) : (
          <>
            {/* Pijplijn: aantal per fase */}
            <div className="flex flex-wrap gap-1.5">
              {pipelineStages.map((s) => {
                const n = s.key === "getekend" ? getekenedCount : summary.stageCounts[s.key];
                return (
                  <span
                    key={s.key}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${n === 0 ? "opacity-40" : ""}`}
                    title={s.hint}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                    <span className="font-semibold tabular-nums">{n}</span>
                  </span>
                );
              })}
              {summary.archived > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {summary.archived} afgerond
                </span>
              )}
            </div>

            {/* Ingepland: aankomende installaties met datum */}
            {summary.planned.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ingepland</p>
                {summary.planned.slice(0, MAX_ATTENTION).map((p) => (
                  <Link
                    key={p.item.id}
                    to="/sales/onboarding"
                    className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{onboardingName(p.item)}</span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-primary">{formatPlanDate(p.date)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
                {summary.planned.length > MAX_ATTENTION && (
                  <Link to="/sales/onboarding" className="block px-1 pt-0.5 text-xs text-muted-foreground hover:text-foreground">
                    +{summary.planned.length - MAX_ATTENTION} meer ingepland…
                  </Link>
                )}
              </div>
            )}

            {/* Aandacht nodig */}
            {actionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {total === 0 ? "Geen lopende onboardings." : "Alles op koers — niets dat op ons wacht."}
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aandacht nodig</p>
                {actionRows.slice(0, MAX_ATTENTION).map((a) => (
                  <Link
                    key={a.key}
                    to="/sales/onboarding"
                    className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.stageColor }} />
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{a.stageLabel}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[a.tone]}`}>{a.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
                {actionRows.length > MAX_ATTENTION && (
                  <Link to="/sales/onboarding" className="block px-1 pt-0.5 text-xs text-muted-foreground hover:text-foreground">
                    +{actionRows.length - MAX_ATTENTION} meer met openstaande actie…
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
