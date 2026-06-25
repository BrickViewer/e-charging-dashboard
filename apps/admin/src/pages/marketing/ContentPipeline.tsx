import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Plus, RefreshCw, Mic, Sparkles, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  useContentTopics, useCreateTopic, useUpdateTopic, useMarkTopicDiscussed, useProfileNames,
  useGenerateBlogFromRecording, useContentSettings, useRunDiscovery, SOURCE_LABEL, type ContentTopic,
} from "@/hooks/useContentPipeline";
import { TopicSheet } from "@/components/marketing/TopicSheet";
import { ContentSettingsSheet } from "@/components/marketing/ContentSettingsSheet";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "");
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
  const create = useCreateTopic();
  const update = useUpdateTopic();
  const markDiscussed = useMarkTopicDiscussed();
  const profileNamesQ = useProfileNames();
  const genFromRec = useGenerateBlogFromRecording();
  const runDiscovery = useRunDiscovery();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDate, setRecDate] = useState("");
  const [recTranscript, setRecTranscript] = useState("");

  const topics = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);
  const profileNames = profileNamesQ.data ?? {};
  const settings = settingsQ.data?.settings;
  const sources = useMemo(() => {
    const feeds = (settings?.feeds ?? []).map((f) => ({ name: f.name || f.url, url: f.url }));
    const comps = (settings?.competitors ?? []).map((c) => ({ name: c.name || c.sitemap || c.url || "", url: c.sitemap || c.url || "" }));
    return [...feeds, ...comps].filter((s) => s.name);
  }, [settings]);

  const agenda = useMemo(() => topics.filter((t) => t.status === "idea"), [topics]);
  const discovered = useMemo(() => agenda.filter((t) => !["manual", "recording"].includes(t.source_type)), [agenda]);
  const writing = useMemo(() => topics.filter((t) => ["approved_for_draft", "drafting"].includes(t.status)), [topics]);
  const publishing = useMemo(() => topics.filter((t) => ["drafted", "scheduled", "published"].includes(t.status)), [topics]);
  const rejectedCount = topics.filter((t) => t.status === "rejected").length;

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try { await create.mutateAsync({ raw_title: title, source_type: "manual" }); setQuickTitle(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Toevoegen mislukt"); }
  };
  const approveForDraft = async (id: string) => {
    try { await update.mutateAsync({ id, patch: { status: "approved_for_draft" } }); toast.success("Klaargezet om uit te schrijven"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };
  const fetchNow = async () => {
    try { const r = await runDiscovery.mutateAsync(); toast.success(`Opgehaald: ${r?.created ?? 0} nieuw, ${r?.skipped ?? 0} bekend, ${r?.errors ?? 0} fout`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ophalen mislukt"); }
  };
  const generateFromRecording = async () => {
    if (!recTitle.trim() || !recTranscript.trim()) return;
    try {
      const blogId = await genFromRec.mutateAsync({ title: recTitle.trim(), recorded_on: recDate || null, transcript: recTranscript });
      toast.success("Concept aangemaakt - open in de blog-editor");
      setRecTitle(""); setRecDate(""); setRecTranscript("");
      navigate(`/marketing/blogs/${blogId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Genereren mislukt");
    }
  };

  const sourceBadge = (t: ContentTopic) =>
    t.source_type === "manual" ? "Eigen idee" : t.source_type === "recording" ? "Opname" : `${SOURCE_LABEL[t.source_type] ?? t.source_type}${t.source_name ? ` - ${t.source_name}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Sparkles className="h-6 w-6 text-primary" /> Contentmachine</h1>
          <p className="text-sm text-muted-foreground">Zo loopt de week: ophalen, bespreken, schrijven, publiceren.</p>
        </div>
        <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="mr-1.5 h-4 w-4" /> Instellingen</Button>
      </div>

      {/* STAP 1 - VERZAMELEN */}
      <StepCard n={1} title="Verzamelen" day="Automatisch op woensdag - de nieuwsagent scant je bronnen" count={discovered.length}>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Globe className="h-3.5 w-3.5" /> Gescande bronnen</p>
            <button onClick={() => setSettingsOpen(true)} className="text-[11px] font-medium text-primary hover:underline">beheer</button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Betrouwbare nieuwslijsten (RSS) die we automatisch uitlezen - al voor je ingevuld.</p>
          {sources.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">Nog geen bronnen ingesteld. Klik "beheer" en voeg vertrouwde bronnen toe (bijv. ElaadNL, RVO, Solar &amp; Storage).</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sources.map((s, i) => (
                <span key={i} className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-foreground" title={s.url}>{s.name}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Laatst opgehaald: {fmtWhen(settings?.last_discovery_at)}</span>
            <Button size="sm" variant="outline" onClick={fetchNow} disabled={runDiscovery.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${runDiscovery.isPending ? "animate-spin" : ""}`} /> Nu ophalen
            </Button>
          </div>
        </div>
        <div>
          <Label className="text-xs">Eigen idee of observatie toevoegen (door de week)</Label>
          <div className="mt-1 flex gap-2">
            <Input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAdd(); } }}
              placeholder="Hier moeten we het over hebben..." />
            <Button onClick={quickAdd} disabled={!quickTitle.trim() || create.isPending}><Plus className="mr-1.5 h-4 w-4" /> Toevoegen</Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Zodra ingeschakeld draait dit wekelijks automatisch. Er gaat nooit iets vanzelf live.</p>
      </StepCard>

      {/* STAP 2 - BESPREKEN */}
      <StepCard n={2} title="Bespreken" day="Donderdag in het overleg - dit is de agenda" count={agenda.length}>
        <ul className="divide-y">
          {agenda.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
              <button onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-foreground">{t.raw_title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {sourceBadge(t)}{t.source_type === "manual"
                    ? ` - ${(t.created_by && profileNames[t.created_by]) || "onbekend"} - ${fmtDate(t.created_at)}`
                    : t.source_published_at ? ` - Gepubliceerd: ${fmtDate(t.source_published_at)}` : ""}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {!t.discussed_at && <Button size="sm" variant="ghost" onClick={() => markDiscussed.mutate({ id: t.id, discussed: true })}>Besproken</Button>}
                <Button size="sm" variant="outline" onClick={() => approveForDraft(t.id)}>Maak blog</Button>
              </div>
            </li>
          ))}
          {agenda.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog niets te bespreken. Haal onderwerpen op (stap 1) of voeg een idee toe.</li>}
        </ul>
      </StepCard>

      {/* STAP 3 - SCHRIJVEN */}
      <StepCard n={3} title="Schrijven" day="Na het overleg - opname wordt een concept" count={writing.length}>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Mic className="h-3.5 w-3.5" /> Opname naar blog</p>
          <p className="text-[11px] text-muted-foreground">Plak het transcript van het wekelijkse gesprek. Het concept verschijnt in je Blogs-module (stap 4).</p>
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
                  <button onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left text-sm text-foreground">{t.raw_title}</button>
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
                <p className="truncate text-sm font-medium text-foreground">{t.raw_title}</p>
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

      {rejectedCount > 0 && <p className="text-center text-[11px] text-muted-foreground">{rejectedCount} afgewezen onderwerp(en) verborgen.</p>}

      <TopicSheet topicId={selectedId} open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)} />
      <ContentSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
