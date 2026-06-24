import { useMemo, useState } from "react";
import { Plus, Sparkles, Newspaper, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BLOG_CATEGORIES } from "@/lib/blogTaxonomy";
import {
  useContentTopics, useCreateTopic, SOURCE_LABEL, type ContentTopic, type TopicSource,
} from "@/hooks/useContentPipeline";
import { TopicSheet } from "@/components/marketing/TopicSheet";
import { ContentSettingsSheet } from "@/components/marketing/ContentSettingsSheet";

// Kolommen op het bord: meerdere statussen kunnen onder één kolom vallen.
const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "idea", label: "Ideeën", statuses: ["idea"] },
  { key: "approved", label: "Goedgekeurd", statuses: ["approved_for_draft"] },
  { key: "review", label: "In review", statuses: ["drafting", "drafted"] },
  { key: "scheduled", label: "Gepland", statuses: ["scheduled"] },
  { key: "published", label: "Gepubliceerd", statuses: ["published"] },
];

export default function ContentPipeline() {
  const topicsQ = useContentTopics();
  const create = useCreateTopic();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const topics = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);
  const byColumn = useMemo(() => {
    const map: Record<string, ContentTopic[]> = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const t of topics) {
      const col = COLUMNS.find((c) => c.statuses.includes(t.status));
      if (col) map[col.key].push(t);
    }
    return map;
  }, [topics]);
  const rejectedCount = topics.filter((t) => t.status === "rejected").length;

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-primary" /> Content-pijplijn
          </h1>
          <p className="text-sm text-muted-foreground">
            Van onderwerp → concept (AI-gegenereerd, met SEO/AEO-score) → jouw goedkeuring → publiceren.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="mr-1.5 h-4 w-4" /> Instellingen</Button>
          <Button onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nieuw onderwerp</Button>
        </div>
      </div>

      {topicsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : topics.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">Nog geen onderwerpen</p>
          <p className="text-xs text-muted-foreground">Voeg een onderwerp toe; daarna genereert de AI een concept dat jij kunt reviewen.</p>
          <Button className="mt-4" variant="outline" onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nieuw onderwerp</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <div key={col.key} className="rounded-xl border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{col.label}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{byColumn[col.key].length}</span>
              </div>
              <div className="space-y-2">
                {byColumn[col.key].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="w-full rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-foreground">{t.raw_title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{SOURCE_LABEL[t.source_type] ?? t.source_type}</span>
                      {t.assigned_category && <span className="truncate">{t.assigned_category}</span>}
                      {typeof t.quality_score === "number" && (
                        <span className={`ml-auto font-medium ${t.quality_score >= 75 ? "text-green-600" : "text-amber-600"}`}>
                          Q {t.quality_score}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {byColumn[col.key].length === 0 && (
                  <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectedCount > 0 && (
        <p className="text-xs text-muted-foreground">{rejectedCount} afgewezen onderwerp(en) verborgen.</p>
      )}

      <NewTopicDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={async (input) => {
          try {
            const id = await create.mutateAsync(input);
            toast.success("Onderwerp toegevoegd");
            setNewOpen(false);
            setSelectedId(id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
          }
        }}
        pending={create.isPending}
      />

      <TopicSheet topicId={selectedId} open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)} />
      <ContentSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function NewTopicDialog({
  open, onOpenChange, onCreate, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (input: { raw_title: string; raw_summary: string; source_type: TopicSource; target_keyword: string; assigned_category: string | null }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>("");

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ raw_title: title, raw_summary: summary, source_type: "manual", target_keyword: keyword, assigned_category: category || null });
    setTitle(""); setSummary(""); setKeyword(""); setCategory("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Nieuw onderwerp</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Onderwerp / titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Wat levert een laadplein op voor vastgoedeigenaren in 2026?" />
          </div>
          <div className="space-y-1.5">
            <Label>Korte omschrijving / invalshoek</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Waarom is dit relevant, welke eigen e-charging-data/hoek gebruiken we?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Doel-zoekwoord</Label>
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="bijv. laadplein opbrengst" />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Kies…" /></SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.label}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={!title.trim() || pending}>{pending ? "Bezig…" : "Toevoegen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
