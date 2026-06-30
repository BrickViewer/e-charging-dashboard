import { useState } from "react";
import html2canvas from "html2canvas";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useSubmitFeedback, FEEDBACK_TYPE_META, type FeedbackType } from "@/hooks/useFeedback";

const TYPES: FeedbackType[] = ["bug", "idee", "vraag"];

// Feedback-knop rechtsboven (staff-kant). Bij openen maakt 'ie een screenshot van de huidige pagina
// (vóór de dialog opengaat, zodat de dialog er niet op staat). Intern; screenshots gaan naar een privé bucket.
export function FeedbackButton() {
  const submit = useSubmitFeedback();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [includeShot, setIncludeShot] = useState(true);

  const reset = () => {
    setType("bug");
    setDescription("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScreenshot(null);
    setPreviewUrl(null);
    setIncludeShot(true);
  };

  const openWithCapture = async () => {
    setCapturing(true);
    try {
      const canvas = await html2canvas(document.body, { logging: false, useCORS: true, scale: 1, backgroundColor: "#ffffff" });
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
      if (blob) { setScreenshot(blob); setPreviewUrl(URL.createObjectURL(blob)); setIncludeShot(true); }
    } catch {
      // Screenshot is best-effort; feedback kan ook zonder.
      setScreenshot(null);
      setPreviewUrl(null);
      setIncludeShot(false);
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  };

  const onSubmit = async () => {
    if (!description.trim()) { toast.error("Vul een omschrijving in"); return; }
    try {
      await submit.mutateAsync({ feedbackType: type, description, pageUrl: window.location.pathname, screenshot: includeShot ? screenshot : null });
      toast.success("Bedankt voor je feedback!");
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={openWithCapture}
        disabled={capturing}
        className="fixed right-4 top-3 z-50 gap-1.5 rounded-full shadow-lg"
        title="Feedback geven"
      >
        {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Feedback geven</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors ${type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    {FEEDBACK_TYPE_META[t].emoji} {FEEDBACK_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="fb-desc">Omschrijving</Label>
              <Textarea id="fb-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Wat gaat er mis, of wat is je idee/vraag?" />
            </div>
            {previewUrl && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeShot} onCheckedChange={(v) => setIncludeShot(v === true)} />
                  Screenshot bijvoegen
                </label>
                {includeShot && <img src={previewUrl} alt="Screenshot" className="max-h-40 w-full rounded border object-contain" />}
                <p className="text-[11px] text-muted-foreground">De screenshot is alleen intern zichtbaar (privé, alleen voor admins).</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Annuleren</Button>
            <Button onClick={onSubmit} disabled={submit.isPending}>{submit.isPending ? "Versturen…" : "Versturen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
