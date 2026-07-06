import { useEffect, useState } from "react";
import { Tags, Plus, GripVertical, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useCategories, useUpsertCategory, useDeleteCategory, type BlogCategoryRow,
} from "@/hooks/useCategories";
import { iconByName } from "@/lib/blogIcon";

// Beheer van de kennisbank-categorieën (bron van waarheid = tabel blog_categories). Hier zie je alle
// categorieën met hun post-tellingen, kun je ze toevoegen/bewerken/(de)activeren, en verschijnen ook de
// categorieën die de automatische blog-engine zelf heeft aangemaakt bij terugkerende thema's.
export default function MarketingCategories() {
  const catsQ = useCategories();
  const [editing, setEditing] = useState<BlogCategoryRow | "new" | null>(null);
  const cats = catsQ.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Categorieën</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            De onderwerpen van de kennisbank. Blogs kunnen in meerdere categorieën staan; de automatische engine
            kiest ze zelf en mag er nieuwe toevoegen.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> Nieuwe categorie</Button>
      </div>

      {catsQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : cats.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Tags className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen categorieën. Maak er een aan met "Nieuwe categorie".</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cats.map((c) => {
            const Icon = iconByName(c.icon);
            return (
              <button
                key={c.slug}
                onClick={() => setEditing(c)}
                className="portal-card flex w-full items-center gap-4 p-3 text-left transition-colors hover:border-primary/30"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-foreground">{c.name}</span>
                    {!c.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                        <EyeOff className="h-3 w-3" /> Verborgen
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.description || `/kennisbank/${c.slug}`}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <span className="font-semibold tabular-nums text-foreground">{c.post_count ?? 0}</span>
                  <span className="text-muted-foreground"> {c.post_count === 1 ? "blog" : "blogs"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <CategorySheet
        value={editing}
        onClose={() => setEditing(null)}
        nextOrder={(cats.length ? cats[cats.length - 1].sort_order : 0) + 10}
      />
    </div>
  );
}

function CategorySheet({
  value, onClose, nextOrder,
}: { value: BlogCategoryRow | "new" | null; onClose: () => void; nextOrder: number }) {
  const upsert = useUpsertCategory();
  const del = useDeleteCategory();
  const isNew = value === "new";
  const existing = value && value !== "new" ? value : null;

  const [form, setForm] = useState({ name: "", description: "", icon: "", sort_order: nextOrder, is_active: true });
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name, description: existing.description ?? "", icon: existing.icon ?? "",
        sort_order: existing.sort_order, is_active: existing.is_active,
      });
    } else if (isNew) {
      setForm({ name: "", description: "", icon: "", sort_order: nextOrder, is_active: true });
    }
  }, [existing, isNew, nextOrder]);

  const open = value !== null;
  const Icon = iconByName(form.icon);
  const postCount = existing?.post_count ?? 0;

  const save = async () => {
    if (!form.name.trim()) { toast.error("Naam is verplicht"); return; }
    try {
      await upsert.mutateAsync({
        slug: existing?.slug,
        name: form.name,
        description: form.description,
        icon: form.icon,
        sort_order: form.sort_order,
        is_active: form.is_active,
      });
      toast.success(isNew ? "Categorie toegevoegd" : "Categorie opgeslagen");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt";
      toast.error(/duplicate|unique/i.test(msg) ? "Er bestaat al een categorie met deze naam/slug." : msg);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (postCount > 0) { toast.error("Deze categorie is nog aan blogs gekoppeld. Zet 'm op verborgen in plaats van verwijderen."); return; }
    if (!window.confirm(`Categorie "${existing.name}" definitief verwijderen?`)) return;
    try {
      await del.mutateAsync(existing.slug);
      toast.success("Categorie verwijderd");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">{isNew ? "Nieuwe categorie" : existing?.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {/* Live preview */}
          <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{form.name || "Categorienaam"}</p>
              <p className="truncate text-xs text-muted-foreground">{form.description || "Korte omschrijving"}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Naam</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Bijv. Laadpalen & hardware" />
            {existing && <p className="text-[11px] text-muted-foreground">Slug (URL): /kennisbank/{existing.slug}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Omschrijving</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Waar gaat deze categorie over? (verschijnt op de kennisbank)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Icoon (lucide-naam)</Label>
              <Input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="Zap" />
              <p className="text-[11px] text-muted-foreground">Bijv. Zap, Leaf, Building2, TrendingUp, ScrollText.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Volgorde</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
              <p className="text-[11px] text-muted-foreground">Laag = eerst.</p>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>
              <span className="font-medium text-foreground">Zichtbaar op de site</span>
              <span className="block text-[11px] text-muted-foreground">Verborgen categorieën verdwijnen uit de kennisbank en keuzelijsten.</span>
            </span>
            <Switch checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: c }))} />
          </label>

          <div className="flex items-center gap-2 border-t pt-4">
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isNew ? "Toevoegen" : "Opslaan"}
            </Button>
            {existing && (
              <Button variant="ghost" className="ml-auto text-red-600" onClick={remove} disabled={del.isPending}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Verwijderen
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
