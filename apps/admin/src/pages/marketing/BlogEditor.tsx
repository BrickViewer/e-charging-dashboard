import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, Send, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
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
import { BLOG_CATEGORIES, categorySlug } from "@/lib/blogTaxonomy";

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
  const createMut = useCreateBlogPost();
  const updateMut = useUpdateBlogPost();
  const deleteMut = useDeleteBlogPost();
  const coverRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(!id);
  const [slugEdited, setSlugEdited] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [form, setForm] = useState({
    title: "", slug: "", excerpt: "", content: "", cover_image_url: "",
    cover_image_alt: "", cover_image_width: null as number | null, cover_image_height: null as number | null,
    category: "", tags: "", featured: false, seo_title: "", seo_description: "",
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
        category: p.category ?? "", tags: (p.tags ?? []).join(", "), featured: p.featured ?? false,
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
      category: form.category.trim() || null,
      category_slug: categorySlug(form.category),
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

          {/* Meta */}
          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Categorie</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Kies categorie…" /></SelectTrigger>
                <SelectContent>{BLOG_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.label}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (komma-gescheiden)</Label>
              <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="laadpalen, techniek" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auteur</Label>
              <Input value={form.author_name} onChange={(e) => set("author_name", e.target.value)} placeholder="Naam auteur" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
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
