import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, Clock, ListChecks, MapPin, User, XCircle } from "lucide-react";
import type { LeadWithTasks } from "@/hooks/useLeads";

const euro = (n: number | null | undefined) =>
  n == null
    ? null
    : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-zinc-400",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Handmatig",
  website: "Website",
  contactformulier: "Contactformulier",
  configurator: "Configurator",
  referral: "Referral",
  campaign: "Campagne",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LeadCard({
  lead,
  ownerName,
  onClick,
  onMarkLost,
  overlay,
  dragDisabled,
}: {
  lead: LeadWithTasks;
  ownerName?: string | null;
  onClick?: () => void;
  onMarkLost?: () => void;
  overlay?: boolean;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    disabled: overlay || dragDisabled,
  });
  const openTasks = lead.lead_tasks?.filter((t) => !t.done).length ?? 0;
  const address = [lead.address_street, [lead.postal_code, lead.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={onClick}
      className={`group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow ${
        overlay ? "shadow-lg ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">{lead.company_name}</p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {onMarkLost && !overlay && (
            <button
              type="button"
              title="Markeer als verloren"
              aria-label="Markeer als verloren"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onMarkLost(); }}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
          <span
            className={`mt-1 h-2 w-2 rounded-full ${PRIORITY_COLOR[lead.priority] ?? "bg-zinc-400"}`}
            title={`Prioriteit: ${lead.priority}`}
          />
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {lead.contact_name && (
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <User className="h-3 w-3 flex-shrink-0" />
            {lead.contact_name}
          </p>
        )}
        {address && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span className="truncate">{address}</span>
          </p>
        )}
      </div>
      {(euro(lead.estimated_value) || lead.source) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {euro(lead.estimated_value) && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
              {euro(lead.estimated_value)}
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {SOURCE_LABEL[lead.source] ?? lead.source}
          </span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          {openTasks > 0 && (
            <span className="flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              {openTasks}
            </span>
          )}
          {lead.appointment_at ? (
            <span className="flex items-center gap-1 font-medium text-primary">
              <CalendarClock className="h-3 w-3" />
              {new Date(lead.appointment_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
              {" "}
              {new Date(lead.appointment_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : lead.expected_close_date ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(lead.expected_close_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
            </span>
          ) : null}
        </span>
        {ownerName && (
          <span
            className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[9px] font-bold text-foreground"
            title={ownerName}
          >
            {initials(ownerName)}
          </span>
        )}
      </div>
    </div>
  );
}
