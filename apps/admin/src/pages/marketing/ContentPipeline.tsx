import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Sparkles, Newspaper, Settings, Inbox, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BLOG_CATEGORIES } from "@/lib/blogTaxonomy";
import {
  useContentTopics, useCreateTopic, useUpdateTopic, useMarkTopicDiscussed, useProfileNames,
  useGenerateBlogFromRecording, SOURCE_LABEL, type ContentTopic, type TopicSource,
} from "@/hooks/useContentPipeline";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "");
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
  const navigate = useNavigate();
  const topicsQ = useContentTopics();
  const create = useCreateTopic();
  const update = useUpdateTopic();
  const markDiscussed = useMarkTopicDiscussed();
  const profileNamesQ = useProfileNames();
  const genFromRec = useGenerateBlogFromRecording();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDate, setRecDate] = useState("");
  const [recTranscript, setRecTranscript] = useState("");

  const topics = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);
  const profileNames = profileNamesQ.data ?? {};
  // Onderwerpen-inbox = handmatig toegevoegde ideeën die nog niet de pijplijn in zijn.
  const inbox = useMemo(() => topics.filter((t) => t.source_type === "manual" && t.status === "idea"), [topics]);
  // Nieuwsbriefing = door de AI-nieuwsagent ontdekte onderwerpen om in het overleg te bespreken.
  const briefing = useMemo(() => topics.filter((t) => ["rss", "competitor", "web_research"].includes(t.source_type) && t.status === "idea"), [topics]);

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await create.mutateAsync({ raw_title: title, source_type: "manual" });
      setQuickTitle("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };
  const approveForDraft = async (id: string) => {
    try {
      await update.mutateAsync({ id, patch: { status: "approved_for_draft" } });
      toast.success("Goedgekeurd voor concept");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt");
    }
  };
  const generateFromRecording = async () => {
    if (!recTitle.trim() || !recTranscript.trim()) return;
    try {
      const blogId = await genFromRec.mutateAsync({ title: recTitle.trim(), recorded_on: recDate || null, transcript: recTranscript });
      toast.success("Concept aangemaakt — open in de blog-editor");
      setRecTitle(""); setRecDate(""); setRecTranscript("");
      navigate(`/marketing/blogs/${blogId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Genereren mislukt");
    }
  };
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

      {/* Onderwerpen-inbox: lichte team-triage voor het wekelijkse overleg. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><Inbox className="h-4 w-4 text-primary" /> Onderwerpen-inbox</h2>
            <p className="text-xs text-muted-foreground">Voeg snel een idee of observatie toe voor het wekelijkse overleg. Markeer als besproken of keur goed voor een concept.</p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{inbox.length}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAdd(); } }}
            placeholder="Hier moeten we het over hebben..."
          />
          <Button onClick={quickAdd} disabled={!quickTitle.trim() || create.isPending}><Plus className="mr-1.5 h-4 w-4" /> Toevoegen</Button>
        </div>
        <ul className="mt-2 divide-y">
          {inbox.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
              <button onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-foreground">{t.raw_title}</p>
                {t.raw_summary && <p className="truncate text-xs text-muted-foreground">{t.raw_summary}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {(t.created_by && profileNames[t.created_by]) || "Onbekend"} · {fmtDate(t.created_at)}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.discussed_at ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {t.discussed_at ? "Besproken" : "Open"}
                </span>
                {!t.discussed_at && (
                  <Button size="sm" variant="ghost" onClick={() => markDiscussed.mutate({ id: t.id, discussed: true })}>Besproken</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => approveForDraft(t.id)}>Goedkeuren</Button>
              </div>
            </li>
          ))}
          {inbox.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog geen open onderwerpen.</li>}
        </ul>
      </section>

      {/* Opname -> blog: plak het transcript van de wekelijkse sessie; er komt een concept in de blogs-module. */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><Mic className="h-4 w-4 text-primary" /> Opname naar blog</h2>
        <p className="text-xs text-muted-foreground">Plak het transcript van de wekelijkse opname. Er wordt een blog-concept klaargezet dat je daarna in de blog-editor redigeert en publiceert. Audio-upload met automatische transcriptie komt later.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Titel *</Label>
            <Input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="Bijv. Weekoverleg: netcongestie en ERE" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Opnamedatum</Label>
            <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs">Transcript *</Label>
          <Textarea rows={6} value={recTranscript} onChange={(e) => setRecTranscript(e.target.value)} placeholder="Plak hier het uitgeschreven gesprek..." />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={generateFromRecording} disabled={!recTitle.trim() || !recTranscript.trim() || genFromRec.isPending}>
            <Sparkles className="mr-1.5 h-4 w-4" /> {genFromRec.isPending ? "Bezig..." : "Genereer concept"}
          </Button>
        </div>
      </section>

      {/* Nieuwsbriefing: door de AI-nieuwsagent ontdekte onderwerpen om in het overleg te bespreken. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><Newspaper className="h-4 w-4 text-primary" /> Nieuwsbriefing</h2>
            <p className="text-xs text-muted-foreground">Door de AI-nieuwsagent ontdekte ontwikkelingen uit de vertrouwde bronnen. Bespreek ze in het overleg en keur de relevante goed voor een concept.</p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{briefing.length}</span>
        </div>
        <ul className="mt-2 divide-y">
          {briefing.slice(0, 12).map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
              <button onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
                <p className="line-clamp-2 text-sm font-medium text-foreground">{t.raw_title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {SOURCE_LABEL[t.source_type] ?? t.source_type}{t.source_name ? ` · ${t.source_name}` : ""} · {fmtDate(t.created_at)}
                </p>
              </button>
              <Button size="sm" variant="outline" onClick={() => approveForDraft(t.id)}>Goedkeuren</Button>
            </li>
          ))}
          {briefing.length === 0 && (
            <li className="py-3 text-center text-xs text-muted-foreground">Nog geen ontdekte onderwerpen. Voeg vertrouwde bronnen toe via Instellingen en klik "Nu ophalen".</li>
          )}
        </ul>
      </section>

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
