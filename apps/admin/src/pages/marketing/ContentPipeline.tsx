import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Plus, Mic, Sparkles, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  useContentTopics, useCreateTopic, useUpdateTopic, useMarkTopicDiscussed,
  useGenerateBlogFromRecording, useContentSettings, useContentKeywords,
  useRunResearch, useSetAgenda, useIgnoreTopic, type ContentTopic,
} from "@/hooks/useContentPipeline";
import { TopicSheet } from "@/components/marketing/TopicSheet";
import { ContentSettingsSheet } from "@/components/marketing/ContentSettingsSheet";

const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nog niet";

// Eén stap-kaart in de weekflow (genummerd, met dag-label + teller).
function StepCard({ n, title, day, count, children }: { n: number; title: string; day: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold leading-tight text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{day}</p>
        </div>
        {count != null && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{count}</span>}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

const PUBLISH_LABEL: Record<string, string> = { drafted: "Te publiceren", scheduled: "Gepland", published: "Gepubliceerd" };

export default function ContentPipeline() {
  const navigate = useNavigate();
  const topicsQ = useContentTopics();
  const settingsQ = useContentSettings();
  const keywordsQ = useContentKeywords();
  const create = useCreateTopic();
  const update = useUpdateTopic();
  const markDiscussed = useMarkTopicDiscussed();
  const genFromRec = useGenerateBlogFromRecording();
  const research = useRunResearch();
  const setAgenda = useSetAgenda();
  const ignoreTopic = useIgnoreTopic();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDate, setRecDate] = useState("");
  const [recTranscript, setRecTranscript] = useState("");
  const [recTopicId, setRecTopicId] = useState("");

  const topics = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);
  const settings = settingsQ.data?.settings;
  const keywordById = useMemo(() => {
    const m: Record<string, { query: string }> = {};
    for (const k of keywordsQ.data ?? []) m[k.id] = { query: k.query };
    return m;
  }, [keywordsQ.data]);

  const byOpportunity = (a: ContentTopic, b: ContentTopic) => (b.seo_opportunity ?? -1) - (a.seo_opportunity ?? -1);
  // Stap 1 = pool: idea, nog niet op de agenda, en een echte vraag of een eigen idee.
  const pool = useMemo(
    () => topics.filter((t) => t.status === "idea" && !t.agenda_at && (t.conversation_question || t.source_type === "manual")).sort(byOpportunity),
    [topics],
  );
  // Stap 2 = agenda: idea + op de agenda gezet.
  const agenda = useMemo(() => topics.filter((t) => t.status === "idea" && !!t.agenda_at).sort(byOpportunity), [topics]);
  const writing = useMemo(() => topics.filter((t) => ["approved_for_draft", "drafting"].includes(t.status)), [topics]);
  const publishing = useMemo(() => topics.filter((t) => ["drafted", "scheduled", "published"].includes(t.status)), [topics]);
  const rejectedCount = topics.filter((t) => t.status === "rejected").length;

  const metaLine = (t: ContentTopic) => {
    const kw = t.matched_keyword_id ? keywordById[t.matched_keyword_id] : null;
    if (kw) return `Zoekvraag: ${kw.query}${t.seo_opportunity != null ? ` - kans ${Math.round(Number(t.seo_opportunity) * 100)}%` : ""}`;
    if (t.target_keyword) return `Zoekwoord: ${t.target_keyword}`;
    if (t.source_type === "manual") return "Eigen idee";
    return "";
  };
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const runResearch = async () => {
    try {
      const r = await research.mutateAsync();
      if (r?.status === "no_key") { toast.message(r.message || "Claude-sleutel ontbreekt nog"); return; }
      if (r?.status !== "ok") { toast.error(r?.message || "Verzamelen mislukt"); return; }
      toast.success(`Verzameld: ${r?.created ?? 0} nieuwe onderwerpen (${r?.skipped ?? 0} al bekend)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verzamelen mislukt"); }
  };
  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try { await create.mutateAsync({ raw_title: title, source_type: "manual" }); setQuickTitle(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Toevoegen mislukt"); }
  };
  const addToAgenda = async (id: string) => {
    try { await setAgenda.mutateAsync({ id, on: true }); toast.success("Op de agenda gezet"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const removeFromAgenda = async (id: string) => {
    try { await setAgenda.mutateAsync({ id, on: false }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const ignore = async (id: string) => {
    try { await ignoreTopic.mutateAsync(id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const approveForDraft = async (id: string) => {
    try { await update.mutateAsync({ id, patch: { status: "approved_for_draft" } }); toast.success("Klaargezet om uit te schrijven"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const generateFromRecording = async () => {
    if (!recTitle.trim() || !recTranscript.trim()) return;
    try {
      const blogId = await genFromRec.mutateAsync({ title: recTitle.trim(), recorded_on: recDate || null, transcript: recTranscript, topic_id: recTopicId || null });
      toast.success("Concept aangemaakt - open in de blog-editor");
      setRecTitle(""); setRecDate(""); setRecTranscript(""); setRecTopicId("");
      navigate(`/marketing/blogs/${blogId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Genereren mislukt");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Sparkles className="h-6 w-6 text-primary" /> Contentmachine</h1>
          <p className="text-sm text-muted-foreground">Zo loopt de week: verzamelen, bespreken, schrijven, publiceren.</p>
        </div>
        <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="mr-1.5 h-4 w-4" /> Instellingen</Button>
      </div>

      {/* STAP 1 - VERZAMELEN */}
      <StepCard n={1} title="Verzamelen" day="Claude zoekt het web af naar de juiste onderwerpen" count={pool.length}>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Onderwerpen verzamelen</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Claude onderzoekt online waar je doelgroep op zoekt en maakt er vragen van. Laatst: {fmtWhen(settings?.last_research_at)}</p>
          </div>
          <Button size="sm" onClick={runResearch} disabled={research.isPending}>
            <Sparkles className={`mr-1.5 h-4 w-4 ${research.isPending ? "animate-pulse" : ""}`} /> {research.isPending ? "Bezig..." : "Verzamelen"}
          </Button>
        </div>

        <ul className="divide-y">
          {pool.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => toggle(t.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">{t.conversation_question || t.raw_title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{metaLine(t)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => addToAgenda(t.id)}><Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen</Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => ignore(t.id)}>Negeren</Button>
                </div>
              </div>
              {expandedId === t.id && (t.background || t.source_url) && (
                <div className="mt-1 space-y-1.5 rounded-md bg-muted/30 p-2">
                  {t.background && <p className="whitespace-pre-line text-xs text-muted-foreground">{t.background}</p>}
                  {t.source_url && <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">bron <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )}
            </li>
          ))}
          {pool.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog geen onderwerpen. Klik "Verzamelen" om Claude online te laten zoeken.</li>}
        </ul>

        <div className="border-t pt-3">
          <Label className="text-xs">Eigen idee toevoegen</Label>
          <div className="mt-1 flex gap-2">
            <Input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAdd(); } }}
              placeholder="Waar moeten we het over hebben?" />
            <Button onClick={quickAdd} disabled={!quickTitle.trim() || create.isPending}><Plus className="mr-1.5 h-4 w-4" /> Toevoegen</Button>
          </div>
        </div>
      </StepCard>

      {/* STAP 2 - BESPREKEN */}
      <StepCard n={2} title="Bespreken" day="Je agenda voor het overleg - klap een vraag open en tik af" count={agenda.length}>
        <ul className="divide-y">
          {agenda.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => toggle(t.id)} className="min-w-0 flex-1 text-left">
                  <p className={`text-sm font-medium ${t.discussed_at ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.conversation_question || t.raw_title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{metaLine(t)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!t.discussed_at && <Button size="sm" variant="ghost" onClick={() => markDiscussed.mutate({ id: t.id, discussed: true })}><Check className="mr-1 h-3.5 w-3.5" /> Besproken</Button>}
                  <Button size="sm" variant="outline" onClick={() => approveForDraft(t.id)}>Maak blog</Button>
                </div>
              </div>
              {expandedId === t.id && (
                <div className="mt-1 space-y-1.5 rounded-md bg-muted/30 p-2">
                  {t.background ? <p className="whitespace-pre-line text-xs text-muted-foreground">{t.background}</p> : <p className="text-xs text-muted-foreground">Geen toelichting. Open details voor meer.</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setSelectedId(t.id)} className="text-[11px] font-medium text-primary hover:underline">Open details</button>
                    {t.source_url && <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">bron <ExternalLink className="h-3 w-3" /></a>}
                    <button onClick={() => removeFromAgenda(t.id)} className="text-[11px] text-muted-foreground hover:underline">Terug naar verzamelen</button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {agenda.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog niets op de agenda. Voeg onderwerpen toe vanuit stap 1.</li>}
        </ul>
      </StepCard>

      {/* STAP 3 - SCHRIJVEN */}
      <StepCard n={3} title="Schrijven" day="Na het overleg - opname wordt een concept" count={writing.length}>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Mic className="h-3.5 w-3.5" /> Opname naar blog</p>
          <p className="text-[11px] text-muted-foreground">Plak het transcript van het wekelijkse gesprek. Het concept verschijnt in je Blogs-module (stap 4).</p>
          {writing.length > 0 && (
            <div className="mt-2">
              <Label className="text-xs">Voor welk onderwerp? (koppelt bron + gespreksvraag aan de blog)</Label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={recTopicId}
                onChange={(e) => { setRecTopicId(e.target.value); const tt = writing.find((w) => w.id === e.target.value); if (tt && !recTitle.trim()) setRecTitle(tt.conversation_question || tt.raw_title); }}
              >
                <option value="">Los concept (geen onderwerp)</option>
                {writing.map((w) => <option key={w.id} value={w.id}>{w.conversation_question || w.raw_title}</option>)}
              </select>
            </div>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="Titel, bijv. Weekoverleg netcongestie" />
            <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
          </div>
          <Textarea className="mt-2" rows={5} value={recTranscript} onChange={(e) => setRecTranscript(e.target.value)} placeholder="Plak hier het uitgeschreven gesprek..." />
          <div className="mt-2 flex justify-end">
            <Button onClick={generateFromRecording} disabled={!recTitle.trim() || !recTranscript.trim() || genFromRec.isPending}>
              <Sparkles className="mr-1.5 h-4 w-4" /> {genFromRec.isPending ? "Bezig..." : "Genereer concept"}
            </Button>
          </div>
        </div>
        {writing.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-foreground">Klaar om uit te schrijven</p>
            <ul className="divide-y">
              {writing.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <button onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left text-sm text-foreground">{t.conversation_question || t.raw_title}</button>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{t.status === "drafting" ? "Bezig" : "Goedgekeurd"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </StepCard>

      {/* STAP 4 - PUBLICEREN */}
      <StepCard n={4} title="Publiceren" day="Maandag - in de Blogs-module, daarna LinkedIn + nieuwsbrief" count={publishing.length}>
        <ul className="divide-y">
          {publishing.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t.conversation_question || t.raw_title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{PUBLISH_LABEL[t.status] ?? t.status}</p>
              </div>
              {t.blog_post_id ? (
                <Button size="sm" variant="outline" onClick={() => navigate(`/marketing/blogs/${t.blog_post_id}`)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Blogs
                </Button>
              ) : null}
            </li>
          ))}
          {publishing.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog geen concepten klaar. Die verschijnen hier zodra ze uit stap 3 komen.</li>}
        </ul>
        <p className="text-[11px] text-muted-foreground">Publiceren doe je in de Blogs-module (de bron van waarheid). Daarna gaat het automatisch naar LinkedIn en de maandelijkse nieuwsbrief, zodra die kanalen aanstaan.</p>
      </StepCard>

      {rejectedCount > 0 && <p className="text-center text-[11px] text-muted-foreground">{rejectedCount} genegeerd/afgewezen onderwerp(en) verborgen.</p>}

      <TopicSheet topicId={selectedId} open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)} />
      <ContentSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
