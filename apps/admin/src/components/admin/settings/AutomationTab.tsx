import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestEfluxSync, useCronStatus } from "@/hooks/useAdminData";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Hourglass } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import type { CronJobStatus, EfluxSyncLog } from "@/types/db";
import { CronStatusBadge } from "./CronStatusBadge";
import { describeSchedule } from "./settingsUtils";

export function AutomationTab() {
  const { data: syncLogs } = useLatestEfluxSync();
  const { data: cronJobs, isLoading: cronLoading } = useCronStatus();
  const queryClient = useQueryClient();

  return (
    <>
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="p-5 border-b border-border">
            <h2 className="text-base font-semibold">Geplande taken</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              pg_cron jobs die periodiek edge functions aanroepen voor sync en aggregatie
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 cockpit-section-label">Taak</th>
                  <th className="text-left p-3 cockpit-section-label">Schedule</th>
                  <th className="text-left p-3 cockpit-section-label">Laatste run</th>
                  <th className="text-left p-3 cockpit-section-label">Status</th>
                  <th className="text-right p-3 cockpit-section-label">Duur</th>
                  <th className="text-left p-3 cockpit-section-label">Actief</th>
                </tr>
              </thead>
              <tbody>
                {cronLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : !cronJobs?.length ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                      <Hourglass className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-medium text-foreground mb-1">Geen geplande taken</p>
                      <p className="text-sm">pg_cron jobs verschijnen hier zodra ze zijn ingericht</p>
                    </td>
                  </tr>
                ) : (
                  cronJobs.map((job: CronJobStatus & { jobid?: number | string; last_duration_ms?: number | null }) => (
                    <tr key={job.jobid} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="p-3">
                        <div className="font-medium">{job.jobname}</div>
                        <div className="text-[11px] text-muted-foreground">jobid {job.jobid}</div>
                      </td>
                      <td className="p-3">
                        <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{job.schedule}</code>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{describeSchedule(job.schedule)}</div>
                      </td>
                      <td className="p-3 text-xs">
                        {job.last_run ? (
                          <>
                            <div>{formatDistanceToNow(new Date(job.last_run), { addSuffix: true, locale: nl })}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(job.last_run).toLocaleString("nl-NL")}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <CronStatusBadge status={job.last_status} />
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">
                        {job.last_duration_ms != null
                          ? `${job.last_duration_ms} ms`
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3">
                        {job.active ? (
                          <span className="badge-actief">Actief</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
                            Gepauzeerd
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
            <span>Cron draait in Supabase project — wijzig schedules via migrations</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-cron-status"] })}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Vernieuwen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recente sync-activiteit */}
      <Card className="portal-card mt-4">
        <CardContent className="p-0">
          <div className="p-5 border-b border-border">
            <h2 className="text-base font-semibold">Recente sync-activiteit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Laatste 10 e-Flux sync-runs (locaties, laadpunten, sessies)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 cockpit-section-label">Tijdstip</th>
                  <th className="text-left p-3 cockpit-section-label">Entiteit</th>
                  <th className="text-left p-3 cockpit-section-label">Status</th>
                  <th className="text-right p-3 cockpit-section-label">Records</th>
                  <th className="text-left p-3 cockpit-section-label">Bericht</th>
                </tr>
              </thead>
              <tbody>
                {!syncLogs?.length ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      Geen sync-runs gelogd
                    </td>
                  </tr>
                ) : (
                  syncLogs.slice(0, 10).map((log: EfluxSyncLog) => (
                    <tr key={log.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-xs">
                        {log.last_synced_at
                          ? formatDistanceToNow(new Date(log.last_synced_at), { addSuffix: true, locale: nl })
                          : "—"}
                      </td>
                      <td className="p-3 text-xs font-mono">{log.entity_type}</td>
                      <td className="p-3">
                        <CronStatusBadge status={log.status === "success" ? "succeeded" : log.status === "error" ? "failed" : log.status} />
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">
                        {log.records_synced ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-md">
                        {log.error_message || "OK"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
