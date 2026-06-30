import { useMemo, useState } from "react";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLeadTags, useCreateLeadTag, TAG_COLORS, tagTextColor } from "@/hooks/useLeadTags";

// Interne tag-kiezer voor leads: toont gekozen tags als gekleurde chips en laat je bestaande tags kiezen of
// een nieuwe tag (naam + kleur) aanmaken. value = geselecteerde tag-id's; herbruikbaar (add-lead + lead-detail).
export function LeadTagPicker({ value, onChange, organizationId, disabled }: {
  value: string[];
  onChange: (ids: string[]) => void;
  organizationId: string | undefined;
  disabled?: boolean;
}) {
  const { data: tags = [] } = useLeadTags();
  const createTag = useCreateLeadTag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  const selected = useMemo(() => tags.filter((t) => value.includes(t.id)), [tags, value]);
  const q = search.trim().toLowerCase();
  const filtered = tags.filter((t) => t.name.toLowerCase().includes(q));
  const exactExists = tags.some((t) => t.name.toLowerCase() === q);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const create = async () => {
    const name = search.trim();
    if (!name || !organizationId) return;
    try {
      const tag = await createTag.mutateAsync({ organization_id: organizationId, name, color: newColor });
      onChange([...value, tag.id]);
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tag aanmaken mislukt");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: t.color, color: tagTextColor(t.color) }}>
          {t.name}
          {!disabled && (
            <button type="button" onClick={() => toggle(t.id)} className="opacity-70 transition-opacity hover:opacity-100" aria-label={`Verwijder ${t.name}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]">
              <TagIcon className="h-3 w-3" /> Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q && !exactExists) { e.preventDefault(); create(); } }}
              placeholder="Zoek of maak een tag…"
              className="h-8 text-sm"
            />
            <div className="ec-scroll mt-2 max-h-48 space-y-0.5 overflow-y-auto">
              {filtered.map((t) => (
                <button key={t.id} type="button" onClick={() => toggle(t.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-muted">
                  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {value.includes(t.id) && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
              {filtered.length === 0 && q === "" && (
                <p className="px-1.5 py-2 text-xs text-muted-foreground">Nog geen tags. Typ een naam om er een te maken.</p>
              )}
            </div>
            {q && !exactExists && (
              <div className="mt-2 space-y-1.5 border-t pt-2">
                <div className="flex flex-wrap gap-1">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-4 w-4 rounded-full ${newColor === c ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Kleur ${c}`}
                    />
                  ))}
                </div>
                <Button type="button" size="sm" className="h-7 w-full gap-1 text-xs" disabled={createTag.isPending} onClick={create}>
                  <Plus className="h-3 w-3" /> Maak tag &ldquo;{search.trim()}&rdquo;
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
