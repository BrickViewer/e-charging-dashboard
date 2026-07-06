import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, Plus, Search, Star, CalendarClock, PauseCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBlogPosts, BLOG_STATUSES } from "@/hooks/useBlogPosts";
import { useContentSettings } from "@/hooks/useContentPipeline";

const STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "bg-zinc-100 text-zinc-600" },
  gepubliceerd: { label: "Gepubliceerd", cls: "bg-green-100 text-green-700" },
  gearchiveerd: { label: "Gearchiveerd", cls: "bg-zinc-100 text-zinc-400" },
};

// Eerstvolgende automatische-blog-moment (dagen 0=zo..6=za, uur lokaal) binnen de komende 2 weken.
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
const fmtNext = (d: Date) => d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "nog niet");

export default function MarketingBlogs() {
  const posts = useBlogPosts();
  const settingsQ = useContentSettings();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const q = useDebouncedValue(search, 200).trim().toLowerCase();

  const s = settingsQ.data?.settings;
  const sched = s?.autoblog_schedule ?? { days: [1, 3, 5], hour: 8 };
  const nextBlog = s?.autoblog_enabled ? nextAutoblogDate(sched.days ?? [1, 3, 5], sched.hour ?? 8) : null;

  const all = useMemo(() => posts.data ?? [], [posts.data]);
  const filtered = useMemo(
    () => all.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return [p.title, p.excerpt, p.category, (p.tags ?? []).join(" ")].filter(Boolean).join(" ").toLowerCase().includes(q);
    }),
    [all, q, statusFilter],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Blogs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Schrijf, beheer en publiceer blogartikelen voor de website.</p>
        </div>
        <Button onClick={() => navigate("/marketing/blogs/nieuw")}><Plus className="mr-1.5 h-4 w-4" /> Nieuwe blog</Button>
      </div>

      {s && (s.autoblog_enabled && nextBlog ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
          <CalendarClock className="h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <span className="text-muted-foreground">Volgende automatische blog: </span>
            <span className="font-medium text-foreground">{fmtNext(nextBlog)}, rond {String(sched.hour ?? 8).padStart(2, "0")}:00</span>
            <span className="text-muted-foreground"> · daarna elke ma/wo/vr · laatste run {fmtShort(s.last_autoblog_at)}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-3.5">
          <PauseCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Automatische blogs staan uit. Zet ze aan onder Content, knop Instellingen, sectie Automatische blogs.
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op titel, categorie of tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {BLOG_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {posts.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen blogs. Maak je eerste artikel met "Nieuwe blog".</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const st = STATUS[p.status] ?? { label: p.status, cls: "bg-muted text-muted-foreground" };
            return (
              <button key={p.id} onClick={() => navigate(`/marketing/blogs/${p.id}`)} className="portal-card flex w-full items-center gap-4 p-3 text-left transition-colors hover:border-primary/30">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {p.cover_image_url ? <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Newspaper className="h-5 w-5 text-muted-foreground" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-foreground">{p.title || "(zonder titel)"}</span>
                    {p.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[p.category, ...(p.tags ?? [])].filter(Boolean).join(" · ") || "Geen categorie"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.published_at ? new Date(p.published_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "concept"}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Geen blogs gevonden.</p>}
        </div>
      )}
    </div>
  );
}
