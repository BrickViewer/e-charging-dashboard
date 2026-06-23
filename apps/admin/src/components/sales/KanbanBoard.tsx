import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { StageColumn } from "./StageColumn";
import { LeadCard } from "./LeadCard";
import { useReorderLeads, type LeadStage, type LeadWithTasks } from "@/hooks/useLeads";

type Items = Record<string, string[]>;

export function KanbanBoard({
  stages,
  leads,
  ownerName,
  dragDisabled,
  onAddInStage,
  onCardClick,
  onMarkLost,
}: {
  stages: LeadStage[];
  leads: LeadWithTasks[];
  ownerName: (id: string | null) => string | null;
  dragDisabled?: boolean;
  onAddInStage: (stageId: string) => void;
  onCardClick: (l: LeadWithTasks) => void;
  onMarkLost?: (l: LeadWithTasks) => void;
}) {
  const reorder = useReorderLeads();
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const [items, setItems] = useState<Items>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync van props → lokale items, behalve tijdens het slepen.
  useEffect(() => {
    if (activeId) return;
    const next: Items = {};
    for (const s of stages) next[s.id] = [];
    const sorted = [...leads].sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1));
    for (const l of sorted) {
      const key = l.stage_id && next[l.stage_id] ? l.stage_id : stages[0]?.id;
      if (key) next[key].push(l.id);
    }
    setItems(next);
  }, [leads, stages, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const containerOf = (id: string): string | undefined => {
    if (id.startsWith("stage:")) return id.slice(6);
    return Object.keys(items).find((k) => items[k].includes(id));
  };

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const overId = String(over.id);
    const from = containerOf(aId);
    const to = containerOf(overId);
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const fromArr = [...(prev[from] ?? [])];
      const toArr = [...(prev[to] ?? [])];
      const idx = fromArr.indexOf(aId);
      if (idx === -1) return prev;
      fromArr.splice(idx, 1);
      let insertAt = toArr.length;
      if (!overId.startsWith("stage:")) {
        const oi = toArr.indexOf(overId);
        insertAt = oi >= 0 ? oi : toArr.length;
      }
      toArr.splice(insertAt, 0, aId);
      return { ...prev, [from]: fromArr, [to]: toArr };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const aId = String(active.id);
    setActiveId(null);
    if (!over) return;
    const from = containerOf(aId);
    const to = containerOf(String(over.id));
    if (!from || !to) return;

    let finalItems = items;
    if (from === to && !String(over.id).startsWith("stage:")) {
      const arr = items[to] ?? [];
      const oldIdx = arr.indexOf(aId);
      const newIdx = arr.indexOf(String(over.id));
      if (oldIdx !== newIdx && newIdx >= 0) finalItems = { ...items, [to]: arrayMove(arr, oldIdx, newIdx) };
    }

    // Persisteer alleen leads waarvan fase of positie wijzigde.
    const updates: { id: string; stage_id: string; position: number }[] = [];
    for (const stageId of Object.keys(finalItems)) {
      finalItems[stageId].forEach((leadId, pos) => {
        const l = leadById.get(leadId);
        if (!l) return;
        if (l.stage_id !== stageId || l.position !== pos) updates.push({ id: leadId, stage_id: stageId, position: pos });
      });
    }
    setItems(finalItems);
    if (updates.length) reorder.mutate(updates);
  }

  const active = activeId ? leadById.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="ec-scroll flex gap-4 overflow-x-auto pb-3">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            leads={(items[stage.id] ?? []).map((id) => leadById.get(id)).filter((l): l is LeadWithTasks => !!l)}
            ownerName={ownerName}
            dragDisabled={dragDisabled}
            onAdd={() => onAddInStage(stage.id)}
            onCardClick={onCardClick}
            onMarkLost={onMarkLost}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? <LeadCard lead={active} ownerName={ownerName(active.owner_user_id)} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
