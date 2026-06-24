import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { LeadCard } from "./LeadCard";
import type { LeadStage, LeadWithTasks } from "@/hooks/useLeads";

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function StageColumn({
  stage,
  leads,
  ownerName,
  dragDisabled,
  onAdd,
  onCardClick,
}: {
  stage: LeadStage;
  leads: LeadWithTasks[];
  ownerName: (id: string | null) => string | null;
  dragDisabled?: boolean;
  onAdd: () => void;
  onCardClick: (l: LeadWithTasks) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const total = leads.reduce((s, l) => s + (l.estimated_value ?? 0), 0);

  return (
    <div className="flex min-w-[17rem] max-w-[24rem] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
          <span className="text-sm font-semibold text-foreground">{stage.name}</span>
          <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{leads.length}</span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Lead toevoegen in ${stage.name}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {total > 0 && <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">{euro(total)}</p>}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 rounded-xl p-2 transition-colors ${
          isOver ? "bg-primary/5 ring-1 ring-primary/30" : "bg-muted/30"
        }`}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              ownerName={ownerName(l.owner_user_id)}
              dragDisabled={dragDisabled}
              onClick={() => onCardClick(l)}
            />
          ))}
        </SortableContext>
        {leads.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Geen leads</p>}
      </div>
    </div>
  );
}
