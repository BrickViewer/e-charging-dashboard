import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization, useUpdateOrganization } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Microsoft365Card } from "@/components/admin/Microsoft365Card";

export interface ConnectionTestResult {
  status: "ok" | "not_configured" | "road_error" | "error";
  message: string;
  credential?: { name: string | null; type: string | null; disabled: boolean };
  provider?: { id: string | null; name: string | null; slug: string | null; customDomain: string | null };
  grantedPermissions?: string[];
  grantedCount?: number;
  counts?: Record<string, { count: number | null; error?: string }>;
  statusCode?: number;
}

// testResult blijft op paginaniveau (de hero-strip leest 'm ook). Deze tab ontvangt de
// huidige waarde + een setter, zodat het test-signaal niet verloren gaat aan de hero.
export function ApiSettingsTab({
  testResult,
  onTestResult,
}: {
  testResult: ConnectionTestResult | null;
  onTestResult: (result: ConnectionTestResult | null) => void;
}) {
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const { isSuperadmin } = useAuth();

  const [apiKeys, setApiKeys] = useState({
    eflux_provider_id: "", eflux_master_account_id: "",
  });
  const [savingApi, setSavingApi] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    if (!org) return;
    setApiKeys({
      eflux_provider_id: org.eflux_provider_id || "",
      eflux_master_account_id: org.eflux_master_account_id || "",
    });
  }, [org]);

  const handleSaveApi = async () => {
    if (!org) return;
    setSavingApi(true);
    try {
      const updateData: Partial<{
        eflux_provider_id: string | null;
        eflux_master_account_id: string | null;
      }> = {};
      if (apiKeys.eflux_provider_id !== (org.eflux_provider_id || ""))
        updateData.eflux_provider_id = apiKeys.eflux_provider_id || null;
      if (apiKeys.eflux_master_account_id !== (org.eflux_master_account_id || ""))
        updateData.eflux_master_account_id = apiKeys.eflux_master_account_id || null;
      if (Object.keys(updateData).length === 0) {
        toast.info("Geen wijzigingen");
        setSavingApi(false);
        return;
      }
      await updateOrg.mutateAsync({ id: org.id, patch: updateData });
      toast.success("API-sleutels opgeslagen");
      onTestResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout bij opslaan");
    } finally {
      setSavingApi(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    onTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<ConnectionTestResult>("eflux-test-connection");
      if (error) {
        onTestResult({ status: "error", message: error.message ?? "Fout bij aanroep" });
      } else if (data) {
        onTestResult(data);
      }
    } catch (err) {
      onTestResult({ status: "error", message: err instanceof Error ? err.message : "Onbekende fout" });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <>
      <Card className="portal-card">
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">API-koppelingen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provider en account ID staan in deze tabel, secrets in Supabase Edge Function secrets
            </p>
          </div>
          <div className="space-y-4 max-w-lg">
            <div className="p-3 rounded-md border border-border bg-muted/40 space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Road.io (e-Flux) API Key</Label>
              <p className="text-sm">Beheerd via Supabase Edge Function secret <code className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">EFLUX_API_KEY</code></p>
              <p className="text-xs text-muted-foreground">Wijzig via Supabase Dashboard → Project Settings → Edge Functions → Secrets. Klik op "Test verbinding" hieronder om te verifiëren dat de secret werkt.</p>
            </div>
            <div>
              <Label htmlFor="eflux-provider-id">Road Provider ID / slug</Label>
              <Input id="eflux-provider-id" value={apiKeys.eflux_provider_id} onChange={e => setApiKeys(p => ({ ...p, eflux_provider_id: e.target.value }))} placeholder="bijv. NLEFL" />
              <p className="text-xs text-muted-foreground mt-1">Provider-header voor elke API-call (slug of ObjectId).</p>
            </div>
            <div>
              <Label htmlFor="eflux-master-account">Master Account ID (optioneel)</Label>
              <Input id="eflux-master-account" value={apiKeys.eflux_master_account_id} onChange={e => setApiKeys(p => ({ ...p, eflux_master_account_id: e.target.value }))} placeholder="Account ObjectId van e-Charging zelf" />
              <p className="text-xs text-muted-foreground mt-1">Beperkt sync tot één account; leeg = alle accounts onder de Provider.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveApi} disabled={savingApi}>
              <Save className="w-4 h-4 mr-2" />{savingApi ? "Opslaan…" : "Opslaan"}
            </Button>
            <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
              {testingConnection
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testen…</>
                : <>Test e-Flux verbinding</>}
            </Button>
          </div>
          {testResult && (
            <div className={`mt-4 p-3 rounded-md border text-sm flex items-start gap-2 ${
              testResult.status === "ok" ? "border-primary/30 bg-primary/5 text-foreground" :
              testResult.status === "not_configured" ? "border-[hsl(var(--status-amber)/0.30)] bg-[hsl(var(--status-amber)/0.05)] text-foreground" :
              "border-destructive/30 bg-destructive/5 text-foreground"
            }`}>
              {testResult.status === "ok"
                ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                : <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${testResult.status === "not_configured" ? "text-[hsl(var(--status-amber))]" : "text-destructive"}`} />}
              <div className="space-y-1">
                <p className="font-medium">{testResult.message}</p>
                {testResult.provider && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Provider: <code className="font-mono">{testResult.provider.name}</code> (slug: <code className="font-mono">{testResult.provider.slug}</code>)</p>
                    {testResult.provider.customDomain && <p>Custom domain: <code className="font-mono">{testResult.provider.customDomain}</code></p>}
                  </div>
                )}
                {testResult.credential && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>API-key naam: <code className="font-mono">{testResult.credential.name}</code> (type: {testResult.credential.type}{testResult.credential.disabled ? ", DISABLED" : ""})</p>
                  </div>
                )}
                {testResult.grantedPermissions && testResult.grantedPermissions.length > 0 && (
                  <details className="text-xs text-muted-foreground mt-1">
                    <summary className="cursor-pointer">Permissies ({testResult.grantedCount})</summary>
                    <ul className="mt-1 ml-4 list-disc font-mono text-[11px]">
                      {testResult.grantedPermissions.map(p => <li key={p}>{p}</li>)}
                    </ul>
                  </details>
                )}
                {testResult.counts && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    <p className="font-medium">Aantallen in jouw Road Provider:</p>
                    {Object.entries(testResult.counts).map(([k, v]) => (
                      <div key={k} className="font-mono text-[11px]">
                        <span>{k}: </span>
                        {v.error ? <span className="text-destructive">ERROR {v.error}</span> : <span>{v.count ?? "?"}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {testResult.statusCode && (
                  <p className="text-xs text-muted-foreground">HTTP {testResult.statusCode}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* SharePoint-instelling is org-breed en alleen voor de superadmin; admins werken automatisch mee. */}
      {isSuperadmin && <Microsoft365Card />}
    </>
  );
}
