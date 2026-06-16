import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Notification } from "@/types/db";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { useDemoDatasetOptional } from "@/contexts/demoDatasetContextValue";

export default function ClientMessages() {
  const { user } = useAuth();
  const demo = useDemoMode();
  const ds = useDemoDatasetOptional();
  const queryClient = useQueryClient();
  const notifKey = demo ? ["demo", ds?.id, "notifications"] : ["notifications", user?.id];
  const { data: notifications } = useQuery({
    queryKey: notifKey,
    queryFn: async () => {
      if (demo) return ds!.notifications;
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, message, read, created_at")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Notification, "id" | "type" | "title" | "message" | "read" | "created_at">[];
    },
    enabled: demo || !!user,
    // Demo: niet refetchen bij focus, anders verspringt de gelezen-status terug
    staleTime: demo ? Infinity : undefined,
  });

  const markRead = async (id: string) => {
    if (demo) {
      // Lokaal markeren: interactief in de demo, zonder Supabase
      queryClient.setQueryData(
        notifKey,
        (rows?: Pick<Notification, "id" | "type" | "title" | "message" | "read" | "created_at">[]) =>
          rows?.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return;
    }
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {notifications?.map((n) => (
        <Card
          key={n.id}
          className={`portal-card transition-all ${!n.read ? "border-primary/40 shadow-md shadow-primary/5" : ""} ${!n.read ? "cursor-pointer" : ""}`}
          onClick={() => !n.read && markRead(n.id)}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                !n.read
                  ? "bg-primary/10 border-primary/30"
                  : "bg-muted/40 border-border"
              }`}
            >
              {n.read ? (
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Bell className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`font-medium text-sm ${!n.read ? "text-foreground" : "text-foreground/80"}`}>
                  {n.title}
                </p>
                {!n.read && (
                  <span className="text-[10px] uppercase tracking-widest text-primary font-medium">
                    Nieuw
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
              <p className="text-xs text-muted-foreground/70 mt-2">
                {n.created_at ? format(new Date(n.created_at), "d MMM yyyy HH:mm", { locale: nl }) : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {(!notifications || notifications.length === 0) && (
        <Card className="portal-card">
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/40 border border-border flex items-center justify-center mx-auto mb-3">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Geen berichten.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
