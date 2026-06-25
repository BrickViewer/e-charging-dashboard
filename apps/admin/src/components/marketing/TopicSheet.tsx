import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Pencil, Rocket, Trash2, XCircle } from "lucide-react";
import { BLOG_CATEGORIES, categorySlug } from "@/lib/blogTaxonomy";
import {
  useContentTopic, useUpdateTopic, useDeleteTopic, TOPIC_STATUS_LABEL, SOURCE_LABEL,
} from "@/hooks/useContentPipeline";
import { useBlogPost, useUpdateBlogPost } from "@/hooks/useBlogPosts";
import DOMPurify from "dompurify";

export function TopicSheet({ topicId, open, onOpenChange }: { topicId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const topicQ = useContentTopic(open ? topicId ?? undefined : undefined);
  const update = useUpdateTopic();
  const del = useDeleteTopic();
  const topic = topicQ.data;

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (topic) {
      setForm({
        raw_title: topic.raw_title ?? "",
        raw_summary: topic.raw_summary ?? "",
        target_keyword: topic.target_keyword ?? "",
        assigned_category: topic.assigned_category ?? "",
      });
    }
  }, [topic]);

  if (!open) return null;
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const t = (k: string) => form[k] ?? "";

  const saveFields = async () => {
    if (!topic) return;
    try {
      await update.mutateAsync({
        id: topic.id,
        patch: {
          raw_title: t("raw_title").trim() || topic.raw_title,
          raw_summary: t("raw_summary").trim() || null,
          target_keyword: t("target_keyword").trim() || null,
          assigned_category: t("assigned_category") || null,
          assigned_category_slug: t("assigned_category") ? categorySlug(t("assigned_category")) : null,
        },
      });
      toast.success("Onderwerp opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    if (!topic) return;
    try {
      await update.mutateAsync({ id: topic.id, patch: { status, ...extra } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Bijwerken mislukt"); }
  };

  const reject = async () => {
    const reason = window.prompt("Reden van afwijzen (voor onze data):") ?? "";
    await setStatus("rejected", { rejected_reason: reason.trim() || null });
    toast.success("Onderwerp afgewezen");
  };

  const remove = async () => {
    if (!topic) return;
    if (!window.confirm(`Onderwerp "${topic.raw_title}" verwijderen?`)) return;
    await del.mutateAsync(topic.id);
    toast.success("Onderwerp verwijderd");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg">{topic?.raw_title ?? "Onderwerp"}</SheetTitle>
        </SheetHeader>

        {!topic ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{TOPIC_STATUS_LABEL[topic.status] ?? topic.status}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{SOURCE_LABEL[topic.source_type] ?? topic.source_type}</span>
              {typeof topic.novelty_score === "number" && (
                <span className="text-muted-foreground">novelty {Math.round(topic.novelty_score * 100)}%</span>
              )}
              {topic.source_url && (
                <a href={topic.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  bron <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Onderwerp-velden */}
            <div className="space-y-3">
              <Field label="Titel"><Input value={t("raw_title")} onChange={(e) => set("raw_title")(e.target.value)} /></Field>
              <Field label="Omschrijving / invalshoek"><Textarea rows={3} value={t("raw_summary")} onChange={(e) => set("raw_summary")(e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Doel-zoekwoord"><Input value={t("target_keyword")} onChange={(e) => set("target_keyword")(e.target.value)} /></Field>
                <Field label="Categorie">
                  <Select value={t("assigned_category")} onValueChange={set("assigned_category")}>
                    <SelectTrigger><SelectValue placeholder="Kies…" /></SelectTrigger>
                    <SelectContent>{BLOG_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.label}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={saveFields} disabled={update.isPending}>Opslaan</Button>
              </div>
            </div>

            {/* Status-acties */}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {topic.status === "idea" && (
                <Button size="sm" onClick={() => setStatus("approved_for_draft").then(() => toast.success("Goedgekeurd voor concept"))}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Goedkeuren voor concept
                </Button>
              )}
              {topic.status !== "rejected" && topic.status !== "published" && (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={reject}><XCircle className="mr-1.5 h-4 w-4" /> Afwijzen</Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={remove}><Trash2 className="mr-1.5 h-4 w-4" /> Verwijderen</Button>
            </div>

            {/* Concept-review (als er een gekoppeld concept is) */}
            {topic.blog_post_id ? (
              <DraftReviewPanel blogPostId={topic.blog_post_id} onPublished={() => setStatus("published")} />
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                Nog geen concept. Na goedkeuring genereert de AI-routine een publicatieklaar concept (met SEO/AEO-score) dat hier verschijnt ter review.
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DraftReviewPanel({ blogPostId, onPublished }: { blogPostId: string; onPublished: () => void }) {
  const postQ = useBlogPost(blogPostId);
  const update = useUpdateBlogPost();
  const navigate = useNavigate();
  const post = postQ.data;

  if (!post) return <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-24 w-full" /></div>;

  const meta = (post.meta_variants ?? {}) as { titles?: string[]; descriptions?: string[] };
  const links = (post.internal_link_suggestions ?? []) as Array<{ anchor?: string; target_slug?: string; reason?: string }>;
  const isPublished = post.status === "gepubliceerd";

  const publish = async () => {
    try {
      await update.mutateAsync({
        id: post.id,
        patch: {
          status: "gepubliceerd",
          published_at: post.published_at ?? new Date().toISOString(),
          review_state: "approved",
        },
      });
      onPublished();
      toast.success("Gepubliceerd — de publieke site wordt herbouwd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Publiceren mislukt"); }
  };

  const requestChanges = async () => {
    try {
      await update.mutateAsync({ id: post.id, patch: { review_state: "changes_requested" } });
      toast.success("Gemarkeerd: wijziging gevraagd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Concept ter review</p>
        <div className="flex items-center gap-2 text-[11px]">
          {typeof post.seo_score === "number" && <Score label="SEO" v={post.seo_score} />}
          {typeof post.aeo_score === "number" && <Score label="AEO" v={post.aeo_score} />}
        </div>
      </div>

      {meta.titles?.length ? (
        <div className="text-xs">
          <p className="font-medium text-muted-foreground">Meta-titel-varianten</p>
          <ul className="list-disc pl-4">{meta.titles.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      {meta.descriptions?.length ? (
        <div className="text-xs">
          <p className="font-medium text-muted-foreground">Meta-omschrijving-varianten</p>
          <ul className="list-disc pl-4">{meta.descriptions.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      {links.length ? (
        <div className="text-xs">
          <p className="font-medium text-muted-foreground">Interne-link-suggesties</p>
          <ul className="list-disc pl-4">{links.slice(0, 6).map((l, i) => <li key={i}>{l.anchor} → /{l.target_slug}</li>)}</ul>
        </div>
      ) : null}

      <div className="max-h-64 overflow-y-auto rounded border bg-muted/20 p-2 text-xs prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content ?? "<p class='text-muted-foreground'>Geen inhoud.</p>") }} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {!isPublished && (
          <Button size="sm" onClick={publish} disabled={update.isPending}><Rocket className="mr-1.5 h-4 w-4" /> Goedkeuren → publiceren</Button>
        )}
        {isPublished && <span className="text-xs font-medium text-green-700">Gepubliceerd</span>}
        <Button size="sm" variant="outline" onClick={() => navigate(`/marketing/blogs/${post.id}`)}><Pencil className="mr-1.5 h-4 w-4" /> Openen in editor</Button>
        {!isPublished && <Button size="sm" variant="ghost" onClick={requestChanges}>Wijziging vragen</Button>}
      </div>
    </div>
  );
}

function Score({ label, v }: { label: string; v: number }) {
  const cls = v >= 80 ? "text-green-600" : v >= 65 ? "text-amber-600" : "text-red-600";
  return <span className={`font-semibold ${cls}`}>{label} {v}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
