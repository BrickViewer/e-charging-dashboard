import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold } from "lucide-react";
import { cn } from "@/lib/utils";
import { mdBoldToHtml, htmlToMdBold } from "@/lib/emailBody";

// Minimale WYSIWYG-editor voor het offerte-e-mailbericht: alléén vet (knop + Cmd/Ctrl+B). Toont vet
// live, maar serialiseert naar platte tekst met `**vet**` (zie lib/emailBody.ts) zodat de opslag platte
// tekst blijft en de e-mail-render veilig blijft.
export function EmailBodyEditor({ value, onChange, disabled }: {
  value: string;
  onChange: (md: string) => void;
  disabled?: boolean;
}) {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false, italic: false, strike: false, bulletList: false,
        orderedList: false, listItem: false, blockquote: false, codeBlock: false,
        code: false, horizontalRule: false,
      }),
    ],
    content: mdBoldToHtml(value),
    onUpdate: ({ editor }) => onChange(htmlToMdBold(editor.getHTML())),
    editorProps: {
      attributes: {
        class: "ec-scroll min-h-[9rem] max-h-[50vh] overflow-y-auto px-3 py-2 text-sm leading-relaxed focus:outline-none [&_strong]:font-bold [&_p+p]:mt-3",
      },
    },
  });

  // Externe waarde-wijziging (offerte laden) → editor bijwerken zonder cursorsprong tijdens typen.
  useEffect(() => {
    if (!editor) return;
    if (htmlToMdBold(editor.getHTML()) !== (value || "")) {
      editor.commands.setContent(mdBoldToHtml(value), false);
    }
  }, [value, editor]);

  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);

  if (!editor) return <div className="rounded-md border p-3 text-sm text-muted-foreground">Editor laden…</div>;

  return (
    <div className={cn("overflow-hidden rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring", disabled && "opacity-70")}>
      <div className="flex items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
        <button
          type="button"
          title="Vet (Ctrl/Cmd+B)"
          aria-label="Vet"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
            editor.isActive("bold") && "bg-primary/10 text-primary",
          )}
        >
          <Bold className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
