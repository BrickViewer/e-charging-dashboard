import { CheckCircle2, AlertCircle } from "lucide-react";

export function CronStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
        Geen run
      </span>
    );
  }
  if (status === "succeeded" || status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
        <CheckCircle2 className="w-3 h-3" />
        Geslaagd
      </span>
    );
  }
  if (status === "failed" || status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-red)/0.15)] text-[hsl(var(--status-red))] border border-[hsl(var(--status-red)/0.25)]">
        <AlertCircle className="w-3 h-3" />
        Gefaald
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-amber)/0.15)] text-[hsl(var(--status-amber))] border border-[hsl(var(--status-amber)/0.25)]">
      {status}
    </span>
  );
}
