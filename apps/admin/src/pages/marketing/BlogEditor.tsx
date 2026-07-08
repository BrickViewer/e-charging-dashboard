import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, Send, Sparkles, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/marketing/RichTextEditor";
import { useBlogPost, useCreateBlogPost, useUpdateBlogPost, useDeleteBlogPost, uploadBlogImage, BLOG_STATUSES } from "@/hooks/useBlogPosts";
import { slugify, readingMinutes } from "@/lib/slug";
import { useCategories } from "@/hooks/useCategories";
import { useContentSettings } from "@/hooks/useContentPipeline";
import { iconByName } from "@/lib/blogIcon";
import { Score, ReviewStateBadge } from "@/components/marketing/ScoreBadge";

type FaqItem = { question: string; answer: string };
function imageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = URL.createObjectURL(file);
  });
}

const STATUS_LABEL: Record<string, string> = { concept: "Concept", gepubliceerd: "Gepubliceerd", gearchiveerd: "Gearchiveerd" };

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const postQ = useBlogPost(id);
  const contentSettingsQ = useContentSettings();
  const createMut = useCreateBlogPost();
  const updateMut = useUpdateBlogPost();
  const deleteMut = useDeleteBlogPost();
  const coverRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(!id);
  const [slugEdited, setSlugEdited] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const catsQ = useCategories();
  const [form, setForm] = useState({
    title: "", slug: "", excerpt: "", content: "", cover_image_url: "",
    cover_image_alt: "", cover_image_width: null as number | null, cover_image_height: null as number | null,
    category_slugs: [] as string[], tags: "", featured: false, seo_title: "", seo_description: "",
    author_name: "", noindex: false, canonical_url: "", faq: [] as FaqItem[],
    status: "concept" as string, published_at: null as string | null,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const p = postQ.data;
    if (id && p && !ready) {
      setForm({
        title: p.title ?? "", slug: p.slug ?? "", excerpt: p.excerpt ?? "", content: p.content ?? "",
        cover_image_url: p.cover_image_url ?? "", cover_image_alt: p.cover_image_alt ?? "",
        cover_image_width: p.cover_image_width ?? null, cover_image_height: p.cover_image_height ?? null,
        category_slugs: Array.isArray((p as { category_slugs?: string[] }).category_slugs) && (p as { category_slugs?: string[] }).category_slugs!.length
          ? (p as { category_slugs?: string[] }).category_slugs!
          : (p.category_slug ? [p.category_slug] : []),
        tags: (p.tags ?? []).join(", "), featured: p.featured ?? false,
        seo_title: p.seo_title ?? "", seo_description: p.seo_description ?? "",
        author_name: p.author_name ?? "", noindex: p.noindex ?? false, canonical_url: p.canonical_url ?? "",
        faq: Array.isArray(p.faq) ? (p.faq as FaqItem[]) : [],
        status: p.status ?? "concept", published_at: p.published_at ?? null,
      });
      setSlugEdited(true);
      setReady(true);
    }
  }, [id, postQ.data, ready]);

  const onTitle = (v: string) => setForm((f) => ({ ...f, title: v, slug: slugEdited ? f.slug : slugify(v) }));

  const uploadCover = async (file: File) => {
    setCoverUploading(true);
    try {
      const [url, d] = await Promise.all([uploadBlogImage(file), imageDims(file)]);
      setForm((f) => ({ ...f, cover_image_url: url, cover_image_width: d.w || null, cover_image_height: d.h || null, cover_image_alt: f.cover_image_alt || f.title }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload mislukt"); }
    finally { setCoverUploading(false); }
  };

  // Genereert een merk-titelkaart (1200x630) via de edge blog-cover en zet 'm als omslag. Vereist een
  // opgeslagen blog (de edge werkt op een bestaand blog_post_id).
  const [coverGenerating, setCoverGenerating] = useState(false);
  const generateCover = async () => {
    if (!id) { toast.error("Sla de blog eerst op om een merk-omslag te genereren."); return; }
    setCoverGenerating(true);
    try {
      // force: bewust vervangen — de edge skipt anders wanneer er al een omslag staat (idempotentie-guard).
      const { data, error } = await supabase.functions.invoke("blog-cover", { body: { blog_post_id: id, force: true } });
      if (error) throw error;
      const r = data as { status: string; url?: string; width?: number; height?: number; message?: string };
      if (r.status !== "ok" || !r.url) throw new Error(r.message || "Genereren mislukt");
      setForm((f) => ({ ...f, cover_image_url: r.url!, cover_image_width: r.width ?? 1200, cover_image_height: r.height ?? 630, cover_image_alt: f.cover_image_alt || f.title }));
      toast.success("Merk-omslag gegenereerd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Genereren mislukt"); }
    finally { setCoverGenerating(false); }
  };

  const save = async (publish: boolean) => {
    if (!form.title.trim()) { toast.error("Titel is verplicht"); return; }
    const cleanContent = DOMPurify.sanitize(form.content || "");
    const status = publish ? "gepubliceerd" : form.status;
    const patch = {
      title: form.title.trim(),
      slug: (form.slug.trim() || slugify(form.title)),
      excerpt: form.excerpt.trim() || null,
      content: cleanContent,
      cover_image_url: form.cover_image_url || null,
      cover_image_alt: form.cover_image_alt.trim() || null,
      cover_image_width: form.cover_image_width,
      cover_image_height: form.cover_image_height,
      // Multi-categorie: de eerste is de primaire (vult category + category_slug voor backwards-compat + breadcrumb).
      category_slugs: form.category_slugs,
      category_slug: form.category_slugs[0] ?? null,
      category: form.category_slugs[0]
        ? ((catsQ.data ?? []).find((c) => c.slug === form.category_slugs[0])?.name ?? null)
        : null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      featured: form.featured,
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
      author_name: form.author_name.trim() || null,
      noindex: form.noindex,
      canonical_url: form.canonical_url.trim() || null,
      faq: form.faq.filter((q) => q.question.trim() && q.answer.trim()).map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })),
      reading_minutes: readingMinutes(cleanContent),
      status,
      published_at: status === "gepubliceerd" ? (form.published_at ?? new Date().toISOString()) : form.published_at,
    };
    try {
      if (id) {
        await updateMut.mutateAsync({ id, patch });
        set("status", status);
        if (patch.published_at) set("published_at", patch.published_at);
      } else {
        const newId = await createMut.mutateAsync(patch);
        navigate(`/marketing/blogs/${newId}`, { replace: true });
      }
      toast.success(publish ? "Blog gepubliceerd" : "Blog opgeslagen");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt";
      toast.error(/duplicate|unique/i.test(msg) ? "Deze slug bestaat al — kies een andere." : msg);
    }
  };

  const remove = async () => {
    if (!id) return;
    await deleteMut.mutateAsync(id);
    toast.success("Blog verwijderd");
    navigate("/marketing/blogs");
  };

  if (id && postQ.isFetched && !postQ.data) {
    return <div className="p-8 text-sm text-muted-foreground">Blog niet gevonden. <button className="text-primary hover:underline" onClick={() => navigate("/marketing/blogs")}>Terug</button></div>;
  }
  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in pb-10">
      {/* Sticky kop */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 border-b bg-background/95 px-1 py-3 backdrop-blur">
        <button onClick={() => navigate("/marketing/blogs")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Blogs
        </button>
        <div className="flex items-center gap-2">
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{BLOG_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Opslaan
          </Button>
          <Button onClick={() => save(true)} disabled={busy}>
            <Send className="mr-1.5 h-4 w-4" /> Publiceren
          </Button>
        </div>
      </div>

      {/* AI-beoordeling van de kwaliteitspoort (alleen bij AI-gegenereerde/beoordeelde posts). */}
      {id && postQ.data && (typeof postQ.data.quality_score === "number" || typeof postQ.data.seo_score === "number" || typeof postQ.data.aeo_score === "number") && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">AI-beoordeling</span>
          {typeof postQ.data.quality_score === "number" && (
            <Score label="Kwaliteit" v={postQ.data.quality_score}
              good={contentSettingsQ.data?.settings?.autoblog_target_quality ?? 82}
              ok={contentSettingsQ.data?.settings?.min_quality ?? 75} />
          )}
          {typeof postQ.data.seo_score === "number" && <Score label="SEO" v={postQ.data.seo_score} />}
          {typeof postQ.data.aeo_score === "number" && <Score label="AEO" v={postQ.data.aeo_score} />}
          {postQ.data.status === "concept" && <ReviewStateBadge state={postQ.data.review_state} />}
        </div>
      )}

      {id && !ready ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <>
          {/* Omslag */}
          <div>
            <Label className="mb-1.5 block text-xs">Omslagafbeelding</Label>
            {form.cover_image_url ? (
              <div className="relative overflow-hidden rounded-xl border">
                <img src={form.cover_image_url} alt="" className="max-h-64 w-full object-cover" />
                <button onClick={() => set("cover_image_url", "")} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={() => coverRef.current?.click()} disabled={coverUploading} className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/30">
                {coverUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                Klik om een omslag te uploaden
              </button>
            )}
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = ""; }} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={generateCover} disabled={coverGenerating || !id}>
                {coverGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                {form.cover_image_url ? "Vervang door merk-omslag" : "Genereer merk-omslag"}
              </Button>
              {!id && <span className="text-[11px] text-muted-foreground">Sla de blog eerst op om een merk-omslag te maken.</span>}
            </div>
            {form.cover_image_url && (
              <Input className="mt-2" value={form.cover_image_alt} onChange={(e) => set("cover_image_alt", e.target.value)} placeholder="Alt-tekst van de omslag (toegankelijkheid + image-SEO)" />
            )}
          </div>

          {/* Titel + slug */}
          <div className="space-y-3">
            <Input className="h-12 text-xl font-semibold" placeholder="Titel van de blog" value={form.title} onChange={(e) => onTitle(e.target.value)} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">/blog/</span>
              <Input className="h-8" value={form.slug} onChange={(e) => { setSlugEdited(true); set("slug", slugify(e.target.value)); }} placeholder="slug" />
            </div>
            <Textarea rows={2} placeholder="Korte samenvatting (verschijnt in overzichten en SEO)" value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
          </div>

          {/* Inhoud */}
          <div>
            <Label className="mb-1.5 block text-xs">Inhoud</Label>
            <RichTextEditor key={id ?? "new"} value={form.content} onChange={(html) => set("content", html)} />
            <p className="mt-1 text-[11px] text-muted-foreground">Leestijd ≈ {readingMinutes(form.content)} min</p>
          </div>

          {/* Categorieën (multi-select; de eerste is de primaire) */}
          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Categorieën</Label>
              <span className="text-[11px] text-muted-foreground">Kies er 1 of meer. De eerste is de primaire.</span>
            </div>
            <CategoryPicker
              all={catsQ.data ?? []}
              selected={form.category_slugs}
              onChange={(next) => set("category_slugs", next)}
            />
          </div>

          {/* Meta */}
          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (komma-gescheiden)</Label>
              <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="laadpalen, techniek" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auteur</Label>
              <Input value={form.author_name} onChange={(e) => set("author_name", e.target.value)} placeholder="Naam auteur" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
              <Switch checked={form.featured} onCheckedChange={(c) => set("featured", c)} />
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Uitgelicht</span>
            </label>
          </div>

          {/* SEO */}
          <div className="grid gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">SEO</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">SEO-titel</Label>
                <span className={`text-[10px] tabular-nums ${(form.seo_title || form.title).length > 60 ? "text-red-600" : "text-muted-foreground"}`}>{(form.seo_title || form.title).length}/60</span>
              </div>
              <Input value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder={form.title || "Titel voor Google"} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Meta-omschrijving</Label>
                <span className={`text-[10px] tabular-nums ${(form.seo_description || form.excerpt).length > 155 ? "text-red-600" : "text-muted-foreground"}`}>{(form.seo_description || form.excerpt).length}/155</span>
              </div>
              <Textarea rows={2} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} placeholder={form.excerpt || "Korte omschrijving voor zoekresultaten"} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Canonieke URL (optioneel)</Label>
                <Input value={form.canonical_url} onChange={(e) => set("canonical_url", e.target.value)} placeholder={`https://e-charging.nl/kennisbank/${form.slug || "slug"}`} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Switch checked={form.noindex} onCheckedChange={(c) => set("noindex", c)} />
                <span>Niet indexeren (noindex)</span>
              </label>
            </div>
          </div>

          {/* FAQ */}
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Veelgestelde vragen (FAQ)</p>
              <Button size="sm" variant="outline" onClick={() => set("faq", [...form.faq, { question: "", answer: "" }])}><Plus className="mr-1.5 h-4 w-4" /> Vraag</Button>
            </div>
            {form.faq.length === 0 && <p className="text-xs text-muted-foreground">Vraag/antwoord-paren worden op de site als accordeon + FAQPage-schema getoond.</p>}
            {form.faq.map((q, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input value={q.question} onChange={(e) => set("faq", form.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} placeholder="Vraag" />
                  <button className="shrink-0 text-muted-foreground hover:text-red-600" onClick={() => set("faq", form.faq.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
                <Textarea rows={2} value={q.answer} onChange={(e) => set("faq", form.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} placeholder="Antwoord" />
              </div>
            ))}
          </div>

          {/* Verwijderen */}
          {id && (
            <div className="flex justify-end border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-red-600"><Trash2 className="mr-1.5 h-4 w-4" /> Verwijderen</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Blog verwijderen?</AlertDialogTitle>
                    <AlertDialogDescription>Dit verwijdert de blog definitief.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Verwijderen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Categorie-multi-select als toggle-chips. De volgorde van selectie bepaalt de primaire (eerste) categorie.
// Toont actieve categorieën; een al-gekozen categorie die inmiddels verborgen is blijft zichtbaar zodat ze
// niet stilzwijgend verdwijnt bij opslaan.
function CategoryPicker({
  all, selected, onChange,
}: {
  all: { slug: string; name: string; icon: string | null; is_active: boolean }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const active = all.filter((c) => c.is_active);
  const extra = selected
    .filter((s) => !active.some((c) => c.slug === s))
    .map((s) => all.find((c) => c.slug === s) ?? { slug: s, name: s, icon: null, is_active: false });
  const list = [...active, ...extra];
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);

  if (list.length === 0) {
    return <p className="text-xs text-muted-foreground">Nog geen categorieën. Maak ze aan onder Marketing → Categorieën.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((c) => {
        const idx = selected.indexOf(c.slug);
        const isSel = idx >= 0;
        const Icon = iconByName(c.icon);
        return (
          <button
            key={c.slug}
            type="button"
            onClick={() => toggle(c.slug)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isSel ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {c.name}
            {idx === 0 && <span className="ml-0.5 rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">primair</span>}
          </button>
        );
      })}
    </div>
  );
}
