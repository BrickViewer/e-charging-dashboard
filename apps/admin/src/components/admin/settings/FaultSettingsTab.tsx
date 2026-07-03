import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useOrganization, useUpdateOrganization } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function FaultSettingsTab() {
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [storingen, setStoringen] = useState({
    fault_notification_email: "info@e-charging.nl",
    fault_detection_enabled: true,
    fault_heartbeat_grace_minutes: "60",
  });
  const [savingStoringen, setSavingStoringen] = useState(false);

  useEffect(() => {
    if (!org) return;
    setStoringen({
      fault_notification_email: org.fault_notification_email || "info@e-charging.nl",
      fault_detection_enabled: org.fault_detection_enabled ?? true,
      fault_heartbeat_grace_minutes: String(org.fault_heartbeat_grace_minutes ?? 60),
    });
  }, [org]);

  const handleSaveStoringen = async () => {
    if (!org) return;
    setSavingStoringen(true);
    try {
      const grace = parseInt(storingen.fault_heartbeat_grace_minutes, 10);
      await updateOrg.mutateAsync({
        id: org.id,
        patch: {
          fault_notification_email: storingen.fault_notification_email.trim() || "info@e-charging.nl",
          fault_detection_enabled: storingen.fault_detection_enabled,
          fault_heartbeat_grace_minutes: Number.isFinite(grace) && grace > 0 ? grace : 60,
        },
      });
      toast.success("Storingsinstellingen opgeslagen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout bij opslaan");
    } finally {
      setSavingStoringen(false);
    }
  };

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Storingsdetectie & notificaties</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            We detecteren laadpaal-storingen automatisch bij elke e-Flux-sync en sturen een melding voordat de klant het merkt.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <Label htmlFor="fault-detection-switch">Automatische storingsdetectie</Label>
            <p className="text-[11px] text-muted-foreground mt-1">Open automatisch een storing wanneer een paal van online naar offline gaat.</p>
          </div>
          <Switch id="fault-detection-switch" checked={storingen.fault_detection_enabled} onCheckedChange={(v) => setStoringen(p => ({ ...p, fault_detection_enabled: v }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fault-email">Notificatie e-mail</Label>
            <Input id="fault-email" type="email" value={storingen.fault_notification_email} onChange={e => setStoringen(p => ({ ...p, fault_notification_email: e.target.value }))} placeholder="info@e-charging.nl" />
            <p className="text-[11px] text-muted-foreground mt-1.5">Naar dit adres gaat bij een storing een branded mail met directe link naar de storing.</p>
          </div>
          <div>
            <Label htmlFor="fault-grace">Drempel "verdacht" (minuten zonder hartslag)</Label>
            <Input id="fault-grace" type="number" min="5" value={storingen.fault_heartbeat_grace_minutes} onChange={e => setStoringen(p => ({ ...p, fault_heartbeat_grace_minutes: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground mt-1.5">Palen die langer dan dit geen hartslag stuurden worden als "verdacht" gemarkeerd (geen mail).</p>
          </div>
        </div>
        <Button onClick={handleSaveStoringen} disabled={savingStoringen}>
          <Save className="w-4 h-4 mr-2" />{savingStoringen ? "Opslaan…" : "Opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
