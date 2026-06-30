import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";
import {
  useFeedbackList, useUpdateFeedback, feedbackScreenshotUrl,
  FEEDBACK_TYPE_META, FEEDBACK_STATUS_META, type Feedback, type FeedbackStatus,
} from "@/hooks/useFeedback";

const STATUSES: FeedbackStatus[] = ["open", "in_behandeling", "opgelost"];

function FeedbackRow({ fb }: { fb: Feedback }) {
  const update = useUpdateFeedback();
  const [notes, setNotes] = useState(fb.admin_notes ?? "");
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [loadingShot, setLoadingShot] = useState(false);
  const meta = FEEDBACK_TYPE_META[fb.feedback_type];

  const viewShot = async () => {
    if (!fb.screenshot_path) return;
    setLoadingShot(true);
    const url = await feedbackScreenshotUrl(fb.screenshot_path);
    setLoadingShot(false);
    if (url) setShotUrl(url); else toast.error("Screenshot kon niet geladen worden");
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{meta.emoji} {meta.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${FEEDBACK_STATUS_META[fb.status].cls}`}>{FEEDBACK_STATUS_META[fb.status].label}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{fb.description}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fb.created_by_email ?? "onbekend"} · {new Date(fb.created_at).toLocaleString("nl-NL")}{fb.page_url ? ` · ${fb.page_url}` : ""}
            </p>
          </div>
          <Select value={fb.status} onValueChange={(v) => update.mutate({ id: fb.id, status: v as FeedbackStatus })}>
            <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{FEEDBACK_STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {fb.screenshot_path && (
          shotUrl ? (
            <a href={shotUrl} target="_blank" rel="noopener noreferrer">
              <img src={shotUrl} alt="Screenshot" className="max-h-72 w-full rounded border object-contain" />
            </a>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={viewShot} disabled={loadingShot}>
              <ImageIcon className="h-4 w-4" />{loadingShot ? "Laden…" : "Screenshot bekijken"}
            </Button>
          )
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] text-muted-foreground">Interne notitie</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" disabled={update.isPending || notes === (fb.admin_notes ?? "")} onClick={() => update.mutate({ id: fb.id, adminNotes: notes.trim() || null })}>
            Notitie opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Admin-overzicht van ingediende feedback (onder Instellingen). Screenshots via korte signed URLs.
export function FeedbackInbox() {
  const { data: items = [], isLoading } = useFeedbackList();
  const [filter, setFilter] = useState<FeedbackStatus | "alle">("open");
  const filtered = filter === "alle" ? items : items.filter((f) => f.status === filter);
  const openCount = items.filter((f) => f.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{openCount} open · {items.length} totaal</p>
        <Select value={filter} onValueChange={(v) => setFilter(v as FeedbackStatus | "alle")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_behandeling">In behandeling</SelectItem>
            <SelectItem value="opgelost">Opgelost</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Geen feedback in deze weergave.</p>
      ) : (
        <div className="space-y-3">{filtered.map((fb) => <FeedbackRow key={fb.id} fb={fb} />)}</div>
      )}
    </div>
  );
}
