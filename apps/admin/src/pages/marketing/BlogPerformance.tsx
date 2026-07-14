import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MousePointerClick, Eye, Target, Euro, RefreshCw, ArrowUpDown, Newspaper, Info, Search, Send, RadioTower } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/admin/KpiTile";
import {
  useBlogPerformance, useRefreshGsc, useGscLastRun, type BlogPerformanceRow, type GscLastRun,
  useBlogIndexStatus, useRefreshIndexStatus, useIndexNowPing, type BlogIndexRow,
} from "@/hooks/useBlogPerformance";

const eur = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const int = (n: number) => n.toLocaleString("nl-NL");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type SortKey = "clicks_all" | "impressions_all" | "avg_position" | "leads_count" | "revenue";
const revenueOf = (r: BlogPerformanceRow) => r.won_oneoff_value + r.realized_recurring;

export default function BlogPerformance() {
  const q = useBlogPerformance();
  const refresh = useRefreshGsc();
  const lastRun = useGscLastRun();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("clicks_all");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          clicks: a.clicks + r.clicks_all,
          impr: a.impr + r.impressions_all,
          leads: a.leads + r.leads_count,
          revenue: a.revenue + revenueOf(r),
        }),
        { clicks: 0, impr: 0, leads: 0, revenue: 0 },
      ),
    [rows],
  );
  const noGsc = rows.length > 0 && totals.clicks === 0 && totals.impr === 0;

  const sorted = useMemo(() => {
    const val = (r: BlogPerformanceRow): number => {
      switch (sortKey) {
        case "revenue": return revenueOf(r);
        case "avg_position": return r.avg_position ?? 9999;
        default: return r[sortKey];
      }
    };
    return [...rows].sort((a, b) => (dir === "asc" ? val(a) - val(b) : val(b) - val(a)));
  }, [rows, sortKey, dir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(k === "avg_position" ? "asc" : "desc"); // lagere positie = beter
    }
  };

  const onRefresh = () =>
    refresh.mutate(30, {
      onSuccess: (d) =>
        toast.success(
          d?.status === "ok"
            ? `Search Console opgehaald (${d.kennisbank_pages ?? 0} blogpagina's met data)`
            : d?.message || "Opgehaald",
        ),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Ophalen mislukt"),
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Blogprestaties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wat levert elke blog op: kijkers uit Google (Search Console) en de leads + omzet die eruit voortkomen.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={refresh.isPending}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} /> Search Console ophalen
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Clicks (Google)" value={int(totals.clicks)} subtitle="organisch, alle blogs" icon={<MousePointerClick className="h-5 w-5" />} accent="primary" />
        <KpiTile label="Impressies" value={int(totals.impr)} subtitle="in Google-zoekresultaten" icon={<Eye className="h-5 w-5" />} accent="blue" />
        <KpiTile label="Toegeschreven leads" value={int(totals.leads)} subtitle="via een blog binnengekomen" icon={<Target className="h-5 w-5" />} accent="amber" />
        <KpiTile label="Toegeschreven omzet" value={eur(totals.revenue)} subtitle="getekend + terugkerend" icon={<Euro className="h-5 w-5" />} accent="green" />
      </div>

      {!lastRun.isLoading && <RunStatusBox run={lastRun.data ?? null} noGsc={noGsc} noLeads={totals.leads === 0} />}

      {q.isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen gepubliceerde blogs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Blog</th>
                <Th onClick={() => setSort("clicks_all")} active={sortKey === "clicks_all"} dir={dir}>Clicks</Th>
                <Th onClick={() => setSort("impressions_all")} active={sortKey === "impressions_all"} dir={dir}>Impressies</Th>
                <Th onClick={() => setSort("avg_position")} active={sortKey === "avg_position"} dir={dir}>Positie</Th>
                <Th onClick={() => setSort("leads_count")} active={sortKey === "leads_count"} dir={dir}>Leads</Th>
                <Th onClick={() => setSort("revenue")} active={sortKey === "revenue"} dir={dir}>Omzet</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.blog_post_id}
                  onClick={() => navigate(`/marketing/blogs/${r.blog_post_id}`)}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="line-clamp-1 font-medium text-foreground">{r.title || "(zonder titel)"}</div>
                    <div className="text-xs text-muted-foreground">{[r.category, fmtDate(r.published_at)].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {int(r.clicks_all)}
                    {r.clicks_28d > 0 && <span className="ml-1 text-xs text-muted-foreground">(+{int(r.clicks_28d)} 28d)</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{int(r.impressions_all)}</td>
                  <td className="px-4 py-3 tabular-nums">{r.avg_position != null ? r.avg_position.toFixed(1) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {int(r.leads_count)}
                    {r.won_count > 0 && <span className="ml-1 text-xs font-medium text-primary">{int(r.won_count)} gewonnen</span>}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums">{revenueOf(r) > 0 ? eur(revenueOf(r)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IndexStatusSection />
    </div>
  );
}

// Wat leverde de laatste (dagelijkse of handmatige) Search Console-ophaal op? De edge logt elke run;
// zo is altijd zichtbaar dát de pipeline draait en waaróm de blogcijfers eventueel nog 0 zijn.
function RunStatusBox({ run, noGsc, noLeads }: { run: GscLastRun | null; noGsc: boolean; noLeads: boolean }) {
  if (!run) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-3.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Nog geen Search Console-ophaal geregistreerd. De automatische ophaal draait elke ochtend; je kunt hem ook direct
          starten met <b>Search Console ophalen</b> hierboven.
        </div>
      </div>
    );
  }

  if (!run.ok) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <span className="font-medium text-destructive">Laatste Search Console-ophaal ({fmtDateTime(run.at)}) is mislukt.</span>
          <div className="mt-0.5 text-muted-foreground">{run.detail.message ?? "Onbekende fout"} — probeer <b>Search Console ophalen</b> of check de GSC-koppeling.</div>
        </div>
      </div>
    );
  }

  const d = run.detail;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-3.5 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <div>
          Laatste ophaal <span className="font-medium text-foreground">{fmtDateTime(run.at)}</span>
          {d.start && d.end && <> · periode {fmtDate(d.start)} – {fmtDate(d.end)}</>}
          {" · "}<span className="font-medium text-foreground">{int(d.metric_rows ?? 0)}</span> blog-datapunten
          {" · "}site-breed <span className="font-medium text-foreground">{int(d.site_impressions ?? 0)}</span> impressies
          {" en "}<span className="font-medium text-foreground">{int(d.site_clicks ?? 0)}</span> clicks
        </div>
        {noGsc && (
          <div>
            De koppeling werkt — site-breed komt er al zoekdata binnen — maar de blogartikelen zelf hebben nog geen
            vertoningen: Google moet ze nog indexeren en laten ranken. De cijfers vullen automatisch zodra dat gebeurt.
          </div>
        )}
        {noLeads && (
          <div>
            De kolommen Leads/Omzet vullen pas wanneer het offerteformulier op de website de eerst bezochte pagina
            meestuurt — de instructie hiervoor ligt klaar voor de websitebouwer.
          </div>
        )}
      </div>
    </div>
  );
}

// Geïndexeerd of niet bepalen we op het taal-onafhankelijke verdict (PASS = staat in Google); de
// coverage_state komt gelokaliseerd (nl-NL) terug en dient alleen als leesbaar label.
function coverageBadge(r: BlogIndexRow) {
  const indexed = r.verdict === "PASS";
  const unknown = /onbekend|unknown/i.test(r.coverage_state ?? "");
  const cls = indexed
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : unknown
    ? "bg-muted text-muted-foreground"
    : "bg-amber-500/15 text-amber-600 dark:text-amber-500";
  const label = r.coverage_state ?? r.verdict ?? "—";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function IndexStatusSection() {
  const q = useBlogIndexStatus();
  const refresh = useRefreshIndexStatus();
  const indexnow = useIndexNowPing();
  const rows = q.data ?? [];
  const busy = refresh.isPending;

  const onRefresh = (submitSitemap = false) =>
    refresh.mutate(
      { submitSitemap },
      {
        onSuccess: (d) => {
          if (d?.status === "needs_owner") {
            toast.error("Serviceaccount is nog geen eigenaar in Search Console — zie melding hieronder.", { duration: 8000 });
          } else if (d?.status === "ok") {
            const sm = d.sitemap_submit?.ok ? " · sitemap ingediend" : "";
            toast.success(`Indexstatus opgehaald: ${d.indexed ?? 0}/${d.checked ?? 0} geïndexeerd${sm}`);
          } else {
            toast.message(d?.message || "Opgehaald");
          }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Ophalen mislukt"),
      },
    );

  const onIndexNow = () =>
    indexnow.mutate(undefined, {
      onSuccess: (d) => toast.success(d?.status === "ok" ? `Bij Bing/AI aangemeld (${d.count ?? 0} URLs, HTTP ${d.indexnow_http ?? "?"})` : d?.message || "Aangemeld"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "IndexNow mislukt"),
    });

  const lastChecked = rows[0]?.checked_at ? fmtDate(rows[0].checked_at) : null;
  const indexedCount = rows.filter((r) => r.verdict === "PASS").length;

  return (
    <section className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Indexeringsstatus</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Staat elke pagina in Google? {rows.length > 0 && <span className="text-foreground">{indexedCount}/{rows.length} geïndexeerd</span>}
            {lastChecked && <span> · laatst gecheckt {lastChecked}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onRefresh(false)} disabled={busy}>
            <Search className={`mr-1.5 h-4 w-4 ${busy ? "animate-pulse" : ""}`} /> Indexstatus verversen
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRefresh(true)} disabled={busy}>
            <Send className="mr-1.5 h-4 w-4" /> Sitemap indienen
          </Button>
          <Button variant="outline" size="sm" onClick={onIndexNow} disabled={indexnow.isPending}>
            <RadioTower className={`mr-1.5 h-4 w-4 ${indexnow.isPending ? "animate-pulse" : ""}`} /> Bij Bing/AI aanmelden
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-3.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Google heeft <b>geen API</b> om per pagina "Verzoek om indexering" te doen — dat blijft een handmatige knop in
          Search Console. Wat wél automatisch kan, loopt inmiddels vanzelf: <b>elke maandagochtend</b> wordt de indexstatus
          ververst, de sitemap opnieuw bij Google ingediend en alles bij Bing/AI aangemeld via IndexNow; bij publicatie van
          een nieuwe blog gaat er direct een IndexNow-ping uit. De knoppen hierboven doen hetzelfde tussendoor. Voor een
          nieuw domein is "nog niet geïndexeerd" normaal; het vult zich in de komende weken.
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nog geen indexstatus opgehaald. Klik op <b>Indexstatus verversen</b>.
          <div className="mt-1 text-xs">Lukt dat niet (403)? Dan moet het GSC-serviceaccount als <b>eigenaar</b> in Search Console staan.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pagina</th>
                <th className="px-4 py-3 font-medium">Status in Google</th>
                <th className="px-4 py-3 font-medium">Laatst gecrawld</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: BlogIndexRow) => (
                <tr key={r.url} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-foreground hover:underline">
                      {r.url.replace("https://www.e-charging.nl", "") || "/"}
                    </a>
                  </td>
                  <td className="px-4 py-2.5">{coverageBadge(r)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{r.last_crawl_time ? fmtDate(r.last_crawl_time) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children, onClick, active, dir }: { children: ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc" }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {children}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-90" : "opacity-40"}`} />
        {active && <span className="sr-only">{dir === "asc" ? "oplopend" : "aflopend"}</span>}
      </button>
    </th>
  );
}
