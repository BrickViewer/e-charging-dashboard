// Compacte AI-beoordelingsbadges voor de content-engine: score-cijfers (kwaliteit/SEO/AEO) met
// kleur t.o.v. instelbare drempels, en het review-stadium van een concept. Gedeeld door de
// blogs-lijst, de concept-review (TopicSheet) en de blog-editor.

export function Score({ label, v, good = 80, ok = 65 }: { label: string; v: number; good?: number; ok?: number }) {
  const cls = v >= good ? "text-green-600" : v >= ok ? "text-amber-600" : "text-red-600";
  return <span className={`font-semibold ${cls}`}>{label} {v}</span>;
}

const REVIEW_STATE: Record<string, { label: string; cls: string }> = {
  needs_review: { label: "Wacht op review", cls: "bg-amber-100 text-amber-700" },
  changes_requested: { label: "Wijziging gevraagd", cls: "bg-red-100 text-red-700" },
  approved: { label: "Goedgekeurd", cls: "bg-green-100 text-green-700" },
};

export function ReviewStateBadge({ state }: { state: string | null | undefined }) {
  const s = state ? REVIEW_STATE[state] : undefined;
  if (!s) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

// Eén regel "Kwaliteit x · SEO y · AEO z" — alleen aanwezige scores, met de kwaliteitsdrempels
// van de publicatiepoort (doel/vloer) en de vaste SEO/AEO-kleuring.
export function ScoreLine({ quality, seo, aeo, qualityGood = 82, qualityOk = 75 }: {
  quality?: number | null; seo?: number | null; aeo?: number | null;
  qualityGood?: number; qualityOk?: number;
}) {
  const parts: React.ReactNode[] = [];
  if (typeof quality === "number") parts.push(<Score key="q" label="Kwaliteit" v={quality} good={qualityGood} ok={qualityOk} />);
  if (typeof seo === "number") parts.push(<Score key="s" label="SEO" v={seo} />);
  if (typeof aeo === "number") parts.push(<Score key="a" label="AEO" v={aeo} />);
  if (!parts.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground">·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}
