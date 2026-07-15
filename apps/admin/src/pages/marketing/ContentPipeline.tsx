import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Plus, Sparkles, ExternalLink, CalendarClock, Inbox, Mail, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAutopilotOverview, useContentSettings, useCreateTopic } from "@/hooks/useContentPipeline";
import { ScoreLine, ReviewStateBadge } from "@/components/marketing/ScoreBadge";
import { ContentSettingsSheet } from "@/components/marketing/ContentSettingsSheet";

// De contentmachine draait op volledige autopiloot: ma/wo/vr kiest hij zelf het
// beste onderwerp (met thema-spreiding), doet web-research, schrijft, keurt
// (audit + feitencontrole), herschrijft tot topkwaliteit en publiceert. Deze
// pagina is alleen nog het dashboard: status, vangnet en instellingen. De oude
// weekflow (verzamelen → bespreken → opname) is bewust verwijderd; de
// onderwerpen-pool vult zichzelf via de nieuws-/research-/zoekwoord-crons.

// Eerstvolgende automatische-blog-moment (dagen 0=zo..6=za, uur lokaal).
function nextAutoblogDate(days: number[], hour: number): Date | null {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(hour, 0, 0, 0);
    if (days.includes(d.getDay()) && d.getTime() > now.getTime()) return d;
  }
  return null;
}
const fmtLang = (d: Date) => d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nog niet";

function StatusRegel({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function ContentPipeline() {
  const navigate = useNavigate();
  const settingsQ = useContentSettings();
  const overview = useAutopilotOverview();
  const create = useCreateTopic();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");

  const s = settingsQ.data?.settings;
  const aan = s?.autoblog_enabled === true && s?.autoblog_autopublish === true;
  const sched = s?.autoblog_schedule ?? { days: [1, 3, 5], hour: 8 };
  const volgende = s?.autoblog_enabled ? nextAutoblogDate(sched.days ?? [1, 3, 5], sched.hour ?? 8) : null;
  const recent = overview.data?.recent ?? [];
  const concepts = overview.data?.concepts ?? [];
  const poolCount = overview.data?.poolCount ?? 0;
  const offBrand = overview.data?.offBrand ?? [];
  const archivedCount = overview.data?.archivedCount ?? 0;

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await create.mutateAsync({ raw_title: title, source_type: "manual" });
      setQuickTitle("");
      toast.success("Toegevoegd — de machine neemt het mee in de onderwerpkeuze");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Sparkles className="h-6 w-6 text-primary" /> Contentmachine</h1>
          <p className="text-sm text-muted-foreground">
            Volledig automatisch: 3× per week onderzoekt, schrijft, controleert en publiceert de machine zelf een blog.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="mr-1.5 h-4 w-4" /> Instellingen</Button>
      </div>

      {/* STATUS */}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          {aan
            ? <CircleCheck className="h-5 w-5 text-primary" />
            : <CircleAlert className="h-5 w-5 text-amber-500" />}
          <h2 className="text-base font-bold text-foreground">
            {aan ? "Automatische piloot staat aan" : "Automatische piloot staat (deels) uit"}
          </h2>
        </div>
        <div className="space-y-2">
          <StatusRegel icon={<CalendarClock className="h-4 w-4" />} label="Volgende blog" value={volgende ? fmtLang(volgende) : "—"} />
          <StatusRegel icon={<Sparkles className="h-4 w-4" />} label="Laatste run" value={fmtWhen(s?.last_autoblog_at)} />
          <StatusRegel icon={<Inbox className="h-4 w-4" />} label="Onderwerpen in voorraad" value={`${poolCount} (vult zichzelf automatisch aan)`} />
          <StatusRegel icon={<Mail className="h-4 w-4" />} label="Vangnet-mail" value={s?.notify_email || "niet ingesteld"} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Elke blog gaat langs de volledige kwaliteitsketen (onafhankelijke audit, herschrijven tot topkwaliteit,
          feitencontrole) vóór publicatie. Haalt een onderwerp de lat definitief niet, dan pakt de machine automatisch
          een volgend onderwerp voor dat slot en krijg je een mail.
        </p>
      </section>

      {/* RECENT GEPUBLICEERD */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-base font-bold text-foreground">Laatst gepubliceerd</h2>
        <ul className="divide-y">
          {recent.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                <p className="text-[11px] text-muted-foreground">{fmtWhen(p.published_at)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/marketing/blogs/${p.id}`)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
              </Button>
            </li>
          ))}
          {recent.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nog geen publicaties.</li>}
        </ul>
      </section>

      {/* VANGNET: concepten die nog in de keten zitten of op review wachten */}
      {concepts.length > 0 && (
        <section className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-4 dark:bg-amber-950/10">
          <h2 className="text-base font-bold text-foreground">Nog niet gepubliceerd ({concepts.length})</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Deze concepten zijn nog onderweg in de kwaliteitsketen of wachten op jouw review. Definitief afgekeurde
            blogs verschijnen hier niet meer: die worden gearchiveerd (mét rapport) en zijn terug te vinden onder
            Blogs → filter Gearchiveerd.
          </p>
          <ul className="divide-y">
            {concepts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <ScoreLine quality={c.quality_score} seo={c.seo_score} aeo={c.aeo_score} />
                    <ReviewStateBadge state={c.review_state} />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/marketing/blogs/${c.id}`)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* BRANCHE-POORT: wat de machine buiten de deur hield (controle + drempel-tuning) */}
      {(offBrand.length > 0 || archivedCount > 0) && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-bold text-foreground">Automatisch afgekeurd</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {archivedCount > 0 && (
              <>Definitief afgekeurde blogs (laatste 14 dagen): <span className="font-medium text-foreground">{archivedCount}</span> — zie Blogs → filter Gearchiveerd. </>
            )}
            {offBrand.length > 0 && <>Onderwerpen buiten de branche (laatste 7 dagen):</>}
          </p>
          {offBrand.length > 0 && (
            <ul className="divide-y">
              {offBrand.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="truncate text-sm font-medium text-foreground">{t.raw_title}</p>
                  {t.rejected_reason && <p className="text-[11px] text-muted-foreground">{t.rejected_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* EIGEN IDEE */}
      <section className="rounded-xl border bg-card p-4">
        <Label className="text-xs">Eigen onderwerp meegeven (optioneel)</Label>
        <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
          Gaat de onderwerpen-pool in; de machine weegt het mee en pakt het op zodra het het beste scoort.
        </p>
        <div className="flex gap-2">
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAdd(); } }}
            placeholder="Bijv. laadplein aanleggen op een bedrijventerrein"
          />
          <Button onClick={quickAdd} disabled={!quickTitle.trim() || create.isPending}><Plus className="mr-1.5 h-4 w-4" /> Toevoegen</Button>
        </div>
      </section>

      <ContentSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
