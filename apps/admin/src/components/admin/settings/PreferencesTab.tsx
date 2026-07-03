import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { Sun, Moon } from "lucide-react";

export function PreferencesTab() {
  const { isLight, setTheme } = useAdminTheme();

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Weergave</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Persoonlijke voorkeur — gekoppeld aan jouw account, dus op elk apparaat hetzelfde
          </p>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-4 max-w-lg">
          <div className="flex items-center gap-3">
            {isLight
              ? <Sun className="w-4 h-4 text-muted-foreground" />
              : <Moon className="w-4 h-4 text-muted-foreground" />}
            <div>
              <Label htmlFor="admin-theme-switch">{isLight ? "Dagmodus" : "Nachtmodus"}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Wordt direct toegepast en bij je account opgeslagen
              </p>
            </div>
          </div>
          <Switch
            id="admin-theme-switch"
            checked={isLight}
            onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
            aria-label="Dagmodus aan/uit"
          />
        </div>
      </CardContent>
    </Card>
  );
}
