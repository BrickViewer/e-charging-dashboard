import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Play, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useContentSettings, useUpdateContentSettings, type ContentEngineSettings } from "@/hooks/useContentPipeline";

export function ContentSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const settingsQ = useContentSettings();
  const update = useUpdateContentSettings();
  const row = settingsQ.data;

  const [s, setS] = useState<ContentEngineSettings>({});
  const [running, setRunning] = useState(false);
  useEffect(() => { if (row?.settings) setS(row.settings); }, [row?.settings]);

  if (!open) return null;

  const setField = <K extends keyof ContentEngineSettings>(k: K, v: ContentEngineSettings[K]) => setS((c) => ({ ...c, [k]: v }));
  const feeds = s.feeds ?? [];
  const competitors = s.competitors ?? [];

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
      toast.success(`Discovery klaar — ${r?.created ?? 0} nieuw, ${r?.skipped ?? 0} dubbel/bekend, ${r?.errors ?? 0} fout`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery mislukt");
    } finally {
      setRunning(false);
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
              <p className="text-[11px] text-muted-foreground">Concepten gaan nooit automatisch live — jij keurt elke blog goed.</p>
            </section>

            {/* Drempels */}
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Drempels</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField label="Min. kwaliteit" value={s.min_quality} onChange={(v) => setField("min_quality", v)} />
                <NumField label="Min. SEO" value={s.min_seo} onChange={(v) => setField("min_seo", v)} />
                <NumField label="Min. AEO" value={s.min_aeo} onChange={(v) => setField("min_aeo", v)} />
                <NumField label="Noviteit (0-1)" step="0.05" value={s.novelty_threshold} onChange={(v) => setField("novelty_threshold", v)} />
              </div>
            </section>

            {/* Feeds */}
            <ListSection
              title="RSS / nieuws-feeds"
              addLabel="Feed toevoegen"
              rows={feeds.map((f, i) => ({ key: i, a: f.url, b: f.name ?? "" }))}
              aPlaceholder="https://…/feed.xml" bPlaceholder="naam (optioneel)"
              onChange={(rows) => setField("feeds", rows.map((r) => ({ url: r.a, name: r.b || undefined })))}
            />

            {/* Concurrenten */}
            <ListSection
              title="Concurrent-sitemaps"
              addLabel="Concurrent toevoegen"
              rows={competitors.map((c, i) => ({ key: i, a: c.sitemap ?? c.url ?? "", b: c.name ?? "" }))}
              aPlaceholder="https://concurrent.nl/sitemap.xml" bPlaceholder="naam (optioneel)"
              onChange={(rows) => setField("competitors", rows.map((r) => ({ sitemap: r.a, name: r.b || undefined })))}
            />

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="outline" onClick={runDiscovery} disabled={running}>
                <Play className="mr-1.5 h-4 w-4" /> {running ? "Bezig…" : "Nu ophalen"}
              </Button>
              <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Opslaan"}</Button>
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
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
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
