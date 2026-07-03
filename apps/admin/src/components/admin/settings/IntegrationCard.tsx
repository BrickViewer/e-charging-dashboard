import { Card, CardContent } from "@/components/ui/card";

export function IntegrationCard({
  label,
  icon,
  status,
  summary,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  status: "ok" | "warning" | "error" | "not_configured";
  summary: string;
  detail?: string;
}) {
  const cfg = {
    ok: {
      bg: "bg-primary/10 border-primary/20 text-primary",
      dot: "bg-primary",
      label: "Operationeel",
      labelClass: "text-primary",
    },
    warning: {
      bg: "bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] text-[hsl(var(--status-amber))]",
      dot: "bg-[hsl(var(--status-amber))]",
      label: "Aandacht",
      labelClass: "text-[hsl(var(--status-amber))]",
    },
    error: {
      bg: "bg-[hsl(var(--status-red)/var(--status-tile-alpha))] border-[hsl(var(--status-red)/var(--status-tile-border-alpha))] text-[hsl(var(--status-red))]",
      dot: "bg-[hsl(var(--status-red))]",
      label: "Fout",
      labelClass: "text-[hsl(var(--status-red))]",
    },
    not_configured: {
      bg: "bg-muted/30 border-border text-muted-foreground",
      dot: "bg-muted-foreground/50",
      label: "Niet ingesteld",
      labelClass: "text-muted-foreground",
    },
  }[status];

  return (
    <Card className="portal-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="cockpit-section-label">{label}</p>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            </div>
            <p className={`text-sm font-semibold mt-1.5 leading-none ${cfg.labelClass}`}>
              {summary}
            </p>
            {detail && (
              <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{detail}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
