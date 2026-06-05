import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
  useMoveStage,
  useStageTasks,
  useStageTaskMutations,
  type LeadStage,
} from "@/hooks/useLeads";

export function StageManagerDialog({
  open,
  onOpenChange,
  organizationId,
  stages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | undefined;
  stages: LeadStage[];
}) {
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const moveStage = useMoveStage();
  const stageTasks = useStageTasks();
  const { add: addTemplate, remove: removeTemplate } = useStageTaskMutations();

  const addStage = () => {
    if (!organizationId) return;
    createStage.mutate({
      organization_id: organizationId,
      name: "Nieuwe fase",
      position: (stages[stages.length - 1]?.position ?? -1) + 1,
      color: "#64748b",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fasen beheren</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {stages.map((stage, i) => (
            <StageRow
              key={stage.id}
              stage={stage}
              first={i === 0}
              last={i === stages.length - 1}
              canDelete={stages.length > 1}
              templates={(stageTasks.data ?? []).filter((t) => t.stage_id === stage.id)}
              onMove={(dir) => moveStage.mutate({ id: stage.id, dir })}
              onUpdate={(patch) => updateStage.mutate({ id: stage.id, patch })}
              onDelete={() => deleteStage.mutate(stage.id)}
              onAddTemplate={(title) =>
                addTemplate.mutate({
                  stage_id: stage.id,
                  organization_id: stage.organization_id,
                  title,
                  position: (stageTasks.data ?? []).filter((t) => t.stage_id === stage.id).length,
                })
              }
              onRemoveTemplate={(id) => removeTemplate.mutate(id)}
            />
          ))}
          <Button variant="outline" className="w-full" onClick={addStage} disabled={!organizationId}>
            <Plus className="mr-2 h-4 w-4" /> Fase toevoegen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  stage,
  first,
  last,
  canDelete,
  templates,
  onMove,
  onUpdate,
  onDelete,
  onAddTemplate,
  onRemoveTemplate,
}: {
  stage: LeadStage;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  templates: { id: string; title: string }[];
  onMove: (dir: -1 | 1) => void;
  onUpdate: (patch: Partial<LeadStage>) => void;
  onDelete: () => void;
  onAddTemplate: (title: string) => void;
  onRemoveTemplate: (id: string) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [newTpl, setNewTpl] = useState("");

  const commitName = () => {
    if (name.trim() && name.trim() !== stage.name) onUpdate({ name: name.trim() });
  };

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => color !== stage.color && onUpdate({ color })}
          className="h-8 w-8 flex-shrink-0 cursor-pointer rounded border bg-transparent"
          aria-label="Kleur"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitName();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-9 flex-1"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Gewonnen-fase">
          <Checkbox checked={stage.is_won} onCheckedChange={(c) => onUpdate({ is_won: !!c, is_lost: c ? false : stage.is_lost })} /> Gewonnen
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Verloren-fase">
          <Checkbox checked={stage.is_lost} onCheckedChange={(c) => onUpdate({ is_lost: !!c, is_won: c ? false : stage.is_won })} /> Verloren
        </label>
        <div className="flex">
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={first} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={last} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" disabled={!canDelete}><Trash2 className="h-4 w-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fase "{stage.name}" verwijderen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Leads in deze fase worden automatisch naar een andere fase verplaatst (ze gaan niet verloren).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">Verwijderen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Per-fase sjabloon-to-do's */}
      <div className="mt-2 pl-10">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Standaard to-do's bij deze fase</p>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {t.title}
              <button onClick={() => onRemoveTemplate(t.id)} className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          <Input
            value={newTpl}
            onChange={(e) => setNewTpl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTpl.trim()) {
                onAddTemplate(newTpl.trim());
                setNewTpl("");
              }
            }}
            placeholder="Bv. 'Bel de klant'…"
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (newTpl.trim()) {
                onAddTemplate(newTpl.trim());
                setNewTpl("");
              }
            }}
          >
            Toevoegen
          </Button>
        </div>
      </div>
    </div>
  );
}
