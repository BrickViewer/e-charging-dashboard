import { useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Image as ImageIcon, Undo2, Redo2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { uploadBlogImage } from "@/hooks/useBlogPosts";

// Afbeeldingen krijgen width/height (tegen CLS) bovenop de standaard src/alt.
const ImageWithDims = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
});

function imageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = document.createElement("img");
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = URL.createObjectURL(file);
  });
}

function Tb({ active, disabled, onClick, title, children }: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 ${active ? "bg-primary/10 text-primary" : ""}`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      ImageWithDims.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      Placeholder.configure({ placeholder: "Schrijf hier je blog…" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { class: "rich-content ec-scroll max-h-[60vh] min-h-[320px] overflow-y-auto px-4 py-3 focus:outline-none" } },
  });

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const [url, d] = await Promise.all([uploadBlogImage(file), imageDims(file)]);
      const alt = window.prompt("Alt-tekst voor de afbeelding (toegankelijkheid + SEO)", "")?.trim() || file.name;
      editor?.chain().focus().setImage({ src: url, alt, width: d.w || null, height: d.h || null } as { src: string; alt: string; width: number | null; height: number | null }).run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload mislukt");
    } finally {
      setUploading(false);
    }
  };
  const setLink = (ed: Editor) => {
    const prev = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link-URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") return ed.chain().focus().extendMarkRange("link").unsetLink().run();
    ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  if (!editor) return <div className="rounded-lg border p-4 text-sm text-muted-foreground">Editor laden…</div>;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
        <Tb title="Kop 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Tb>
        <Tb title="Kop 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Tb>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tb title="Vet" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Tb>
        <Tb title="Cursief" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Tb>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tb title="Opsomming" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Tb>
        <Tb title="Genummerd" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Tb>
        <Tb title="Citaat" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Tb>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tb title="Link" active={editor.isActive("link")} onClick={() => setLink(editor)}><Link2 className="h-4 w-4" /></Tb>
        <Tb title="Afbeelding" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</Tb>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tb title="Ongedaan maken" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Tb>
        <Tb title="Opnieuw" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Tb>
      </div>
      <EditorContent editor={editor} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ""; }} />
    </div>
  );
}
