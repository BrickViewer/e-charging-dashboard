import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function ClientMessages() {
  const { user } = useAuth();
  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Berichten</h1>

      {notifications?.map((n: any) => (
        <Card key={n.id} className={`${!n.read ? "border-primary/30" : ""}`} onClick={() => !n.read && markRead(n.id)}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${!n.read ? "bg-primary/10" : "bg-accent"}`}>
              {n.read ? <CheckCircle className="w-4 h-4 text-muted-foreground" /> : <Bell className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{n.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {n.created_at ? format(new Date(n.created_at), "d MMM yyyy HH:mm", { locale: nl }) : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {(!notifications || notifications.length === 0) && (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Geen berichten.</CardContent></Card>
      )}
    </div>
  );
}
