import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
export type FeedbackType = Database["public"]["Enums"]["feedback_type"];
export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];

export const FEEDBACK_TYPE_META: Record<FeedbackType, { label: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐛" },
  idee: { label: "Idee", emoji: "💡" },
  vraag: { label: "Vraag", emoji: "❓" },
};

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-100 text-amber-800" },
  in_behandeling: { label: "In behandeling", cls: "bg-blue-100 text-blue-800" },
  opgelost: { label: "Opgelost", cls: "bg-emerald-100 text-emerald-800" },
};

// Admin-lijst van alle feedback (RLS: admin ziet alles; anders alleen eigen).
export function useFeedbackList() {
  return useQuery({
    queryKey: ["feedback"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Feedback[];
    },
  });
}

// Indienen: screenshot (optioneel) uploaden naar de privé bucket + feedback-rij opslaan.
export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ feedbackType, description, pageUrl, screenshot }: {
      feedbackType: FeedbackType; description: string; pageUrl: string; screenshot: Blob | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Niet ingelogd");
      let screenshotPath: string | null = null;
      if (screenshot) {
        const path = `${userId}/${crypto.randomUUID()}.png`;
        const { error: upErr } = await supabase.storage.from("feedback-screenshots").upload(path, screenshot, { contentType: "image/png", upsert: false });
        if (upErr) throw upErr;
        screenshotPath = path;
      }
      const { error } = await supabase.from("feedback").insert({
        feedback_type: feedbackType,
        description: description.trim(),
        page_url: pageUrl || null,
        screenshot_path: screenshotPath,
        created_by: userId,
        created_by_email: auth.user?.email ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });
}

// Status/notitie bijwerken (admin); 'opgelost' zet resolved_by/at.
export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status?: FeedbackStatus; adminNotes?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const patch: Database["public"]["Tables"]["feedback"]["Update"] = { updated_at: new Date().toISOString() };
      if (status !== undefined) {
        patch.status = status;
        if (status === "opgelost") { patch.resolved_at = new Date().toISOString(); patch.resolved_by = auth.user?.id ?? null; }
        else { patch.resolved_at = null; patch.resolved_by = null; }
      }
      if (adminNotes !== undefined) patch.admin_notes = adminNotes;
      const { error } = await supabase.from("feedback").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });
}

// Korte, tijdelijke signed URL voor een screenshot uit de privé bucket (nooit publiek).
export async function feedbackScreenshotUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("feedback-screenshots").createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}
