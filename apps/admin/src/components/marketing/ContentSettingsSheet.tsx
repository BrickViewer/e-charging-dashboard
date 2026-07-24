import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Play, Trash2, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useContentSettings, useUpdateContentSettings, useRunMetrics, useRunSerpGap, useRunClustering, useRunAutoblog, type ContentEngineSettings } from "@/hooks/useContentPipeline";

const fmtAt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "nog niet");

export function ContentSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const settingsQ = useContentSettings();
  const update = useUpdateContentSettings();
  const runMetrics = useRunMetrics();
  const runSerpGap = useRunSerpGap();
  const runCluster = useRunClustering();
  const runAutoblog = useRunAutoblog();
  const row = settingsQ.data;

  const [s, setS] = useState<ContentEngineSettings>({});
  const [running, setRunning] = useState(false);
  const [kwRunning, setKwRunning] = useState(false);
  const [autoblogRunning, setAutoblogRunning] = useState(false);
  useEffect(() => { if (row?.settings) setS(row.settings); }, [row?.settings]);

  if (!open) return null;

  const setField = <K extends keyof ContentEngineSettings>(k: K, v: ContentEngineSettings[K]) => setS((c) => ({ ...c, [k]: v }));
  const feeds = s.feeds ?? [];
  const seeds = s.keyword_seeds ?? [];
  const author = s.author ?? {};
  const setAuthor = (patch: Partial<NonNullable<ContentEngineSettings["author"]>>) => setField("author", { ...author, ...patch });
  // Data-acties (DataForSEO/Claude): eerst opslaan zodat de edge actuele instellingen gebruikt; no_key netjes melden.
  const runData = async (label: string, mut: { mutateAsync: () => Promise<{ status?: string; message?: string } | null> }) => {
    try {
      if (row) await update.mutateAsync({ id: row.id, settings: s });
      const r = await mut.mutateAsync();
      if (r?.status === "no_key") { toast.message(r.message || "Sleutel ontbreekt nog"); return; }
      if (r && r.status !== "ok") { toast.error(r.message || `${label} mislukt`); return; }
      toast.success(`${label}: klaar`);
    } catch (e) { toast.error(e instanceof Error ? e.message : `${label} mislukt`); }
  };

  const save = async () => {
    if (!row) return;
    try {
      await update.mutateAsync({ id: row.id, settings: s });
      toast.success("Instellingen opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const runDiscovery = async () => {
    setRunning(true);
    try {
      // Eerst opslaan zodat de edge de actuele feeds/concurrenten gebruikt.
      if (row) await update.mutateAsync({ id: row.id, settings: s });
      const { data, error } = await supabase.functions.invoke("content-discovery", { body: { force: true } });
      if (error) throw error;
      const r = data as { created?: number; skipped?: number; errors?: number } | null;
      toast.success(`Nieuws opgehaald: ${r?.created ?? 0} nieuw, ${r?.skipped ?? 0} bekend, ${r?.errors ?? 0} fout`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ophalen mislukt");
    } finally {
      setRunning(false);
    }
  };

  const runKeywords = async () => {
    setKwRunning(true);
    try {
      if (row) await update.mutateAsync({ id: row.id, settings: s });
      const { data, error } = await supabase.functions.invoke("content-keyword-research", { body: {} });
      if (error) throw error;
      const r = data as { created?: number; skipped?: number; message?: string } | null;
      toast.success(`Zoekwoorden bijgewerkt: ${r?.created ?? 0} nieuw, ${r?.skipped ?? 0} bekend`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bijwerken mislukt");
    } finally {
      setKwRunning(false);
    }
  };

  // Testblog: eerst opslaan zodat de edge de actuele instellingen gebruikt, dan altijd als CONCEPT
  // genereren (publish:false), ook als auto-publiceren aan zou staan. Zo kun je de kwaliteit beoordelen.
  const runAutoblogTest = async () => {
    setAutoblogRunning(true);
    try {
      if (row) await update.mutateAsync({ id: row.id, settings: s });
      const r = await runAutoblog.mutateAsync({ force: true, publish: false });
      if (r?.status === "no_key") { toast.message(r.message || "Claude-sleutel ontbreekt nog"); return; }
      if (r?.status === "disabled") { toast.message("Autoblog staat uit; testknop draait toch (concept)."); return; }
      if (!r || r.status !== "ok") { toast.error(r?.message || "Testblog mislukt"); return; }
      if ((r.generated ?? 0) === 0) { toast.message(r.message || "Geen onderwerpen in de pool om over te schrijven."); return; }
      const slug = r.results?.find((x) => x.slug)?.slug;
      toast.success(`Testblog als concept klaar${slug ? `: ${slug}` : ""}. Vind hem terug bij de blogs ter review.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Testblog mislukt");
    } finally {
      setAutoblogRunning(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Content-engine instellingen</SheetTitle></SheetHeader>

        {!row ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <div className="mt-5 space-y-6">
            {/* Kill-switches */}
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Automatisering</p>
              <ToggleRow label="Ontdekking aan" desc="Laat de scraper feeds/concurrenten periodiek ophalen (cron moet apart staan)."
                checked={!!s.discovery_enabled} onChange={(v) => setField("discovery_enabled", v)} />
              <ToggleRow label="Generatie aan" desc="Laat de AI-routine concepten genereren uit goedgekeurde onderwerpen."
                checked={!!s.generation_enabled} onChange={(v) => setField("generation_enabled", v)} />
              <p className="text-[11px] text-muted-foreground">Concepten uit de opname-machine gaan nooit automatisch live — jij keurt elke blog goed.</p>
            </section>

            {/* Automatische blogs (autonome tak) */}
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Automatische blogs</p>
              <p className="text-[11px] text-muted-foreground">De autonome tak pakt zelf de best-scorende onderwerpen, laat Claude met web-research een blog schrijven, en publiceert die alleen als hij door de kwaliteitspoort komt. Zakt-ie eronder, dan blijft het een concept ter review. Het ritme (ma/wo/vr) staat als aparte planning; hier zet je de motor aan.</p>
              <ToggleRow label="Autoblog aan" desc="Laat de geplande runs automatisch blogs genereren uit de onderwerpen-pool."
                checked={!!s.autoblog_enabled} onChange={(v) => setField("autoblog_enabled", v)} />
              <ToggleRow label="Automatisch publiceren" desc="Publiceer direct als de blog door de kwaliteitspoort komt; anders blijft het een concept ter review."
                checked={!!s.autoblog_autopublish} onChange={(v) => setField("autoblog_autopublish", v)} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField label="Blogs per run" value={s.autoblog_per_run} onChange={(v) => setField("autoblog_per_run", v)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notificatie-e-mail</Label>
                <Input type="email" value={s.notify_email ?? ""} onChange={(e) => setField("notify_email", e.target.value)} placeholder="info@e-charging.nl" />
                <p className="text-[11px] text-muted-foreground">Krijgt een mail wanneer een geplande run eindigt zónder publicatie (blog bleef in review, lege pool of fout). Leeg = geen mail.</p>
              </div>
              <p className="text-[11px] text-muted-foreground">Laatste autoblog-run: {fmtAt(s.last_autoblog_at)}.</p>
              <Button variant="outline" size="sm" onClick={runAutoblogTest} disabled={autoblogRunning}>
                <Sparkles className="mr-1.5 h-4 w-4" /> {autoblogRunning ? "Bezig..." : "Genereer nu 1 testblog (concept)"}
              </Button>
            </section>

            {/* Filters */}
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Filters (laat gerust op standaard staan)</p>
              <p className="text-[11px] text-muted-foreground">Min. kwaliteit/SEO/AEO = minimale score voordat de AI er een concept van maakt. Uniek = hoe nieuw een onderwerp moet zijn; we slaan dingen over die te veel lijken op wat we al hebben.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField label="Min. kwaliteit" value={s.min_quality} onChange={(v) => setField("min_quality", v)} />
                <NumField label="Min. SEO" value={s.min_seo} onChange={(v) => setField("min_seo", v)} />
                <NumField label="Min. AEO" value={s.min_aeo} onChange={(v) => setField("min_aeo", v)} />
                <NumField label="Uniek (0-1)" step="0.05" value={s.novelty_threshold} onChange={(v) => setField("novelty_threshold", v)} />
              </div>
            </section>

            {/* Bronnen die we automatisch volgen */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bronnen die we automatisch volgen</p>
              <p className="text-[11px] text-muted-foreground">Dit zijn nieuwslijsten van betrouwbare sites; we lezen ze uit als je op "Nu ophalen" klikt. Ze staan al voor je ingevuld - je hoeft hier niets te doen, maar je mag bronnen toevoegen of weghalen.</p>
              <ListSection
                title=""
                addLabel="Bron toevoegen"
                rows={feeds.map((f, i) => ({ key: i, a: f.url, b: f.name ?? "" }))}
                aPlaceholder="https://site.nl/feed" bPlaceholder="naam"
                onChange={(rows) => setField("feeds", rows.map((r) => ({ url: r.a, name: r.b || undefined })))}
              />
            </section>

            {/* Zaad-termen voor zoekvraag-onderzoek */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Zaad-termen voor zoekvraag-onderzoek</p>
              <p className="text-[11px] text-muted-foreground">Onderwerpen waarop we Google-suggesties ophalen om te zien waar je doelgroep op zoekt. Vul een onderwerp + (optioneel) doelgroep in. Staan al voor je ingevuld.</p>
              <ListSection
                title=""
                addLabel="Zaad-term toevoegen"
                rows={seeds.map((sd, i) => ({ key: i, a: sd.term, b: sd.audience ?? "" }))}
                aPlaceholder="laadpaal vve" bPlaceholder="vve/vastgoed/bedrijf"
                onChange={(rows) => setField("keyword_seeds", rows.map((r) => ({ term: r.a, audience: r.b || undefined, cluster: r.b || undefined })))}
              />
            </section>

            {/* Schrijven met AI (Claude) */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Schrijven met AI (Claude)</p>
              <p className="text-[11px] text-muted-foreground">Gebruikt voor gespreksvragen en blogconcepten. Vereist de Claude-sleutel (ANTHROPIC_API_KEY); zonder sleutel blijft alles handmatig.</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={s.generation_model ?? "claude-sonnet-5"}
                  onChange={(e) => setField("generation_model", e.target.value)}
                >
                  <option value="claude-sonnet-5">Sonnet 5 (aanbevolen)</option>
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5 (snelst/goedkoopst)</option>
                </select>
              </div>
            </section>

            {/* Zoekdata (DataForSEO) */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Zoekdata (DataForSEO)</p>
              <p className="text-[11px] text-muted-foreground">Echte zoekvolumes, difficulty en SERP-analyse vereisen de DataForSEO-sleutels (DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD), op naam ingesteld in de Vault. Zonder sleutels blijft de prioritering op de slimme schatting staan.</p>
              <p className="text-[11px] text-muted-foreground">Laatst: zoekvolumes {fmtAt(s.last_metrics_at)}, SERP-gap {fmtAt(s.last_serp_gap_at)}, clusters {fmtAt(s.last_cluster_at)}.</p>
            </section>

            {/* Auteur (E-E-A-T) */}
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Auteur van alle blogs (E-E-A-T)</p>
              <p className="text-[11px] text-muted-foreground">Deze persoon staat als auteur op élke blog: zichtbaar op de pagina (naam, functie, bio, LinkedIn) én in de schema-data voor Google en AI-antwoorden. Een geverifieerde auteur met LinkedIn (via sameAs) versterkt je vindbaarheid. Laat je dit leeg, dan valt het terug op "E-Charging redactie".</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={author.name ?? ""} onChange={(e) => setAuthor({ name: e.target.value })} placeholder="Naam" />
                <Input value={author.role ?? ""} onChange={(e) => setAuthor({ role: e.target.value })} placeholder="Functie, bijv. Specialist laadinfra" />
              </div>
              <Input value={author.url ?? ""} onChange={(e) => setAuthor({ url: e.target.value })} placeholder="Profiel-URL (bijv. over-ons-pagina)" />
              <Textarea rows={2} value={(author.sameAs ?? []).join("\n")}
                onChange={(e) => setAuthor({ sameAs: e.target.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) })}
                placeholder="sameAs (1 per regel): LinkedIn-profiel, bedrijfssite..." />
              <Textarea rows={2} value={author.bio ?? ""} onChange={(e) => setAuthor({ bio: e.target.value })} placeholder="Korte bio (gebruikt in de schrijfstijl)" />
            </section>

            {/* Distributie */}
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Distributie</p>
              <ToggleRow label="Nieuwsbrief" desc="Stuur bij publiceren een mail naar de ontvangers (Resend)."
                checked={!!s.channels?.newsletter} onChange={(v) => setField("channels", { ...s.channels, newsletter: v })} />
              <ToggleRow label="LinkedIn" desc="Zet een LinkedIn-item in de wachtrij (via Hey_Reach-routine)."
                checked={!!s.channels?.linkedin} onChange={(v) => setField("channels", { ...s.channels, linkedin: v })} />
              <div className="space-y-1.5">
                <Label className="text-xs">Nieuwsbrief-ontvangers (één per regel)</Label>
                <Textarea rows={3} value={(s.newsletter_recipients ?? []).join("\n")}
                  onChange={(e) => setField("newsletter_recipients", e.target.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))}
                  placeholder="naam@bedrijf.nl" />
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button variant="outline" onClick={runDiscovery} disabled={running}>
                <Play className="mr-1.5 h-4 w-4" /> {running ? "Bezig..." : "Nieuws ophalen"}
              </Button>
              <Button variant="outline" onClick={runKeywords} disabled={kwRunning}>
                <Search className="mr-1.5 h-4 w-4" /> {kwRunning ? "Bezig..." : "Zoekwoorden bijwerken"}
              </Button>
              <Button variant="outline" onClick={() => runData("Zoekvolumes ophalen", runMetrics)} disabled={runMetrics.isPending}>
                {runMetrics.isPending ? "Bezig..." : "Zoekvolumes ophalen"}
              </Button>
              <Button variant="outline" onClick={() => runData("SERP-gap analyseren", runSerpGap)} disabled={runSerpGap.isPending}>
                {runSerpGap.isPending ? "Bezig..." : "SERP-gap analyseren"}
              </Button>
              <Button variant="outline" onClick={() => runData("Clusters bijwerken", runCluster)} disabled={runCluster.isPending}>
                {runCluster.isPending ? "Bezig..." : "Clusters bijwerken"}
              </Button>
              <Button className="ml-auto" onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan..." : "Opslaan"}</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div><p className="text-sm font-medium text-foreground">{label}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumField({ label, value, onChange, step }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ListSection({
  title, addLabel, rows, aPlaceholder, bPlaceholder, onChange,
}: {
  title: string;
  addLabel: string;
  rows: { key: number; a: string; b: string }[];
  aPlaceholder: string;
  bPlaceholder: string;
  onChange: (rows: { a: string; b: string }[]) => void;
}) {
  const set = (i: number, patch: Partial<{ a: string; b: string }>) =>
    onChange(rows.map((r, idx) => (idx === i ? { a: patch.a ?? r.a, b: patch.b ?? r.b } : { a: r.a, b: r.b })));
  const add = () => onChange([...rows.map((r) => ({ a: r.a, b: r.b })), { a: "", b: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i).map((r) => ({ a: r.a, b: r.b })));

  return (
    <section className="space-y-2">
      {title ? <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p> : null}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2">
            <Input className="flex-1" value={r.a} placeholder={aPlaceholder} onChange={(e) => set(i, { a: e.target.value })} />
            <Input className="w-32" value={r.b} placeholder={bPlaceholder} onChange={(e) => set(i, { b: e.target.value })} />
            <button className="text-muted-foreground hover:text-red-600" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[11px] text-muted-foreground">Nog geen bronnen.</p>}
      </div>
      <Button variant="outline" size="sm" onClick={add}><Plus className="mr-1.5 h-4 w-4" /> {addLabel}</Button>
    </section>
  );
}
