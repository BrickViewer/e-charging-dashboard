import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListChecks, MapPin, Plug, Send, User } from "lucide-react";
import { primaryQuote, type LeadWithTasks } from "@/hooks/useLeads";
import { scopeFromFlags, SCOPE_SHORT, SCOPE_BADGE_CLASS } from "@/lib/quoteScope";
import { tagTextColor } from "@/hooks/useLeadTags";
import { useAvgRevenuePerChargePoint } from "@/hooks/useAdminData";
import { leadMgmtYearEstimate } from "@/lib/leadEstimate";
import { formatObjectAddress } from "@/lib/objectLabel";

const euro0 = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

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
  overlay,
  dragDisabled,
}: {
  lead: LeadWithTasks;
  ownerName?: string | null;
  onClick?: () => void;
  overlay?: boolean;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    disabled: overlay || dragDisabled,
  });
  const openTasks = lead.lead_tasks?.filter((t) => !t.done).length ?? 0;
  const address = (lead.address_street || lead.city) ? formatObjectAddress(lead) : "";
  const pq = primaryQuote(lead);
  const scope = pq ? scopeFromFlags(pq.with_installation !== false, pq.with_management !== false) : null;
  const palen = pq?.num_charge_points ?? lead.estimated_charge_points ?? null;
  const sentDate = pq?.sent_at ?? null;
  const { data: avgPerPaal } = useAvgRevenuePerChargePoint();
  // Installatie = hard offertebedrag; beheer = geschatte jaaropbrengst voor E-Charging
  // (gemiddelde service-fee-omzet per paal × aantal palen op de offerte).
  const inst = pq ? (pq.total_hardware_cost ?? 0) + (pq.total_installation_cost ?? 0) : 0;
  const mgmtYear = leadMgmtYearEstimate(lead, avgPerPaal?.value);
  // Eenmalige (installatie)prijs niet tonen bij 'alleen beheer' — daar hoort geen installatie.
  const showInst = inst > 0 && scope !== "alleen_beheer";
  const showMgmt = mgmtYear != null && mgmtYear > 0;
  const tags = (lead.lead_tag_links ?? []).flatMap((l) => (l.lead_tags ? [l.lead_tags] : []));
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
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{lead.company_name}</p>
          {!lead.company_id && (
            <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Particulier</span>
          )}
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {lead.contact_name && lead.contact_name !== lead.company_name && (
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
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t.id} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.color, color: tagTextColor(t.color) }}>
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {showInst && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary" title="Offerte waarde">
            {euro0(inst)}
          </span>
        )}
        {showMgmt && (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700" title="Geschatte beheeropbrengst per jaar">
            ≈ {euro0(mgmtYear)}/jr
          </span>
        )}
        {scope && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SCOPE_BADGE_CLASS[scope]}`}>
            {SCOPE_SHORT[scope]}
          </span>
        )}
        {palen != null && (
          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Plug className="h-3 w-3" />{palen}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          {openTasks > 0 && (
            <span className="flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              {openTasks}
            </span>
          )}
          {sentDate && (
            <span className="flex items-center gap-1" title="Offerte verzonden">
              <Send className="h-3 w-3" />
              Offerte {new Date(sentDate).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
            </span>
          )}
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
