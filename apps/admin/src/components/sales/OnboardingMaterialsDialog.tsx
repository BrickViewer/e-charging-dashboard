import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { OrderLinksCell } from "@/components/sales/OrderLinksCell";
import {
  queueMaterialSync, useAddMaterial, useOrderMaterials, useRemoveMaterial,
  useUpdateMaterialStatus, useUpdateOrderPrepInfo,
} from "@/hooks/useOrderMaterials";
import { materialsGate, materialsProgressLabel } from "@/services/workPreparation";
import { MATERIAL_STATUSES, type MaterialStatus } from "@/services/installationHandoff";

// Werkvoorbereiding: de materialen uit de calculatie bestellen vóór de opdracht
// naar de installateur gaat. Ná de handoff blijft de dialog volledig bruikbaar
// (binnen melden, vergeten materiaal toevoegen); alleen de Doorsturen-knop
// maakt dan plaats voor het opdrachtnummer.

export type MaterialsDialogOrder = {
  id: string;
  egroup_order_id: string | null;
  egroup_order_number: string | null;
  materials_expected_at: string | null;
  preparation_notes: string | null;
  last_sync_error?: string | null;
};

const STATUS_LABEL: Record<MaterialStatus, string> = {
  niet_nodig: "Niet nodig",
  te_bestellen: "Te bestellen",
  besteld: "Besteld",
  binnen: "Binnen",
};

const STATUS_DOT: Record<MaterialStatus, string> = {
  niet_nodig: "bg-muted-foreground/40",
  te_bestellen: "bg-amber-500",
  besteld: "bg-sky-500",
  binnen: "bg-emerald-500",
};

const getal = (n: number) => n.toLocaleString("nl-NL");

export function OnboardingMaterialsDialog({
  order,
  title,
  onClose,
  onSend,
}: {
  order: MaterialsDialogOrder | null;
  /** Bv. de klant-/bedrijfsnaam; alleen voor de kop. */
  title?: string;
  onClose: () => void;
  /** Opent de handoff-dialog; alleen aangeboden zolang de order niet verstuurd is. */
  onSend?: () => void;
}) {
  const materials = useOrderMaterials(order?.id);
  const updateStatus = useUpdateMaterialStatus();
  const addMaterial = useAddMaterial();
  const removeMaterial = useRemoveMaterial();
  const updatePrepInfo = useUpdateOrderPrepInfo();

  const handedOff = !!order?.egroup_order_id;
  const list = materials.data ?? [];
  const gate = materialsGate(list);
  const relevant = list.filter((m) => m.status !== "niet_nodig");
  const done = relevant.filter((m) => m.status === "besteld" || m.status === "binnen").length;

  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newSupplier, setNewSupplier] = useState("");

  // Orderniveau-velden verversen wanneer een andere order geopend wordt.
  useEffect(() => {
    setExpectedAt(order?.materials_expected_at ?? "");
    setNote(order?.preparation_notes ?? "");
    setAdding(false);
    setNewDesc("");
    setNewQty("1");
    setNewSupplier("");
  }, [order?.id, order?.materials_expected_at, order?.preparation_notes]);

  if (!order) return null;

  const savePrepInfo = (patch: { materials_expected_at?: string | null; preparation_notes?: string | null }) => {
    updatePrepInfo.mutate(
      { orderId: order.id, patch, handedOff },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Opslaan mislukt") },
    );
  };

  const submitNewMaterial = () => {
    const qty = Number(newQty.replace(",", "."));
    if (!newDesc.trim() || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Vul een omschrijving en een geldig aantal in");
      return;
    }
    addMaterial.mutate(
      {
        orderId: order.id,
        description: newDesc.trim(),
        qty,
        supplier: newSupplier.trim() || null,
        position: list.length,
        handedOff,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setNewDesc("");
          setNewQty("1");
          setNewSupplier("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Toevoegen mislukt"),
      },
    );
  };

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Werkvoorbereiding{title ? ` — ${title}` : ""}</DialogTitle>
          <DialogDescription>
            Bestel de materialen uit de calculatie via de bestellinks. Doorsturen naar de installateur kan
            zodra niets meer op "te bestellen" staat; de planner in de e-portal ziet de status mee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{materialsProgressLabel(list)}</span>
              {handedOff && order.last_sync_error && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-amber-600 hover:underline"
                  title={order.last_sync_error}
                  onClick={() => {
                    queueMaterialSync(order.id);
                    toast.info("Sync naar e-portal opnieuw gestart");
                  }}
                >
                  <RefreshCw className="h-3 w-3" /> Sync mislukt — opnieuw syncen
                </button>
              )}
            </div>
            {relevant.length > 0 && <Progress value={(done / relevant.length) * 100} className="h-1.5" />}
          </div>

          {materials.isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {list.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Geen materialen uit de calculatie — voeg zo nodig zelf regels toe.
                </p>
              )}
              {list.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm" data-testid={`material-${m.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="tabular-nums text-muted-foreground">{getal(Number(m.qty))}×</span> {m.description}
                      <span className="ml-1.5 align-middle">
                        <OrderLinksCell
                          orderUrl={m.catalog_products?.order_url ?? null}
                          extraLinks={m.catalog_products?.extra_links ?? null}
                          supplier={m.supplier}
                        />
                      </span>
                    </p>
                    {(m.supplier || m.order_number) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[m.supplier, m.order_number].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Select
                    value={m.status}
                    onValueChange={(v) =>
                      updateStatus.mutate(
                        { id: m.id, orderId: order.id, status: v as MaterialStatus, handedOff },
                        { onError: (e) => toast.error(e instanceof Error ? e.message : "Status wijzigen mislukt") },
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs" aria-label={`Status ${m.description}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} /> {STATUS_LABEL[s]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Alleen handmatige regels zijn verwijderbaar; regels uit de
                      calculatie zet je op "niet nodig" zodat de lijst compleet blijft. */}
                  {m.source_line_id === null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Regel ${m.description} verwijderen`}
                      onClick={() =>
                        removeMaterial.mutate(
                          { id: m.id, orderId: order.id, handedOff },
                          { onError: (e) => toast.error(e instanceof Error ? e.message : "Verwijderen mislukt") },
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}

              {adding ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5">
                  <Input
                    className="h-8 w-14 text-xs tabular-nums"
                    inputMode="decimal"
                    aria-label="Aantal"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                  <Input
                    className="h-8 flex-1 text-xs"
                    placeholder="Omschrijving"
                    aria-label="Omschrijving"
                    autoFocus
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewMaterial()}
                  />
                  <Input
                    className="h-8 w-32 text-xs"
                    placeholder="Leverancier"
                    aria-label="Leverancier"
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewMaterial()}
                  />
                  <Button size="sm" className="h-8" onClick={submitNewMaterial} disabled={addMaterial.isPending}>
                    Toevoegen
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Regel toevoegen
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="materials-expected" className="text-xs">Verwachte leverdatum</Label>
              <Input
                id="materials-expected"
                type="date"
                className="h-9"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
                onBlur={() => savePrepInfo({ materials_expected_at: expectedAt || null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prep-note" className="text-xs">Notitie voor de planner</Label>
              <Input
                id="prep-note"
                className="h-9"
                placeholder="Bv. meterkast levert pas week 32"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => savePrepInfo({ preparation_notes: note.trim() || null })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {!gate.ok ? (
            <p className="text-[11px] font-medium text-amber-600">
              Nog {gate.open} materia{gate.open === 1 ? "al" : "len"} te bestellen — doorsturen kan nog niet.
            </p>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Sluiten</Button>
            {handedOff ? (
              <span className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                Verstuurd{order.egroup_order_number ? ` · ${order.egroup_order_number}` : ""}
              </span>
            ) : onSend ? (
              <Button onClick={onSend} disabled={!gate.ok || materials.isLoading}>
                {materials.isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Doorsturen naar installateur
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
