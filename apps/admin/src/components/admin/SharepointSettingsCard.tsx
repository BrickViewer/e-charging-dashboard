import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ConnectResult = { status: string; message?: string; siteId?: string; driveId?: string; rootItemId?: string; statusCode?: number };

export function SharepointSettingsCard() {
  const [siteUrl, setSiteUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("organizations").select("sharepoint_site_url").limit(1).maybeSingle();
      if (data?.sharepoint_site_url) setSiteUrl(data.sharepoint_site_url);
      setLoaded(true);
    })();
  }, []);

  const connect = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<ConnectResult>("sharepoint-connect", { body: { site_url: siteUrl.trim() } });
      if (error) setResult({ status: "error", message: "Verbinden mislukt (functie gaf een fout)" });
      else setResult(data ?? { status: "error", message: "Geen antwoord" });
    } catch (e) {
      setResult({ status: "error", message: e instanceof Error ? e.message : "Verbinden mislukt" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="portal-card mt-4">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">SharePoint (offerte-dossiers)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            De secrets <code className="font-mono text-xs">SHAREPOINT_TENANT_ID</code> / <code className="font-mono text-xs">CLIENT_ID</code> / <code className="font-mono text-xs">CLIENT_SECRET</code> staan in de Supabase Edge Function secrets.
            Vul de SharePoint-site-URL in en klik "Verbind &amp; test" — de dossiermappen komen in de documentbibliotheek van deze site.
          </p>
        </div>
        <div className="max-w-lg space-y-1">
          <Label>SharePoint-site-URL</Label>
          <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://e-charging.sharepoint.com/sites/Dossiers" disabled={!loaded} />
        </div>
        <Button onClick={connect} disabled={testing || !siteUrl.trim()}>
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Verbind &amp; test
        </Button>
        {result && (
          <div className={`p-3 rounded-md border text-sm flex items-start gap-2 ${result.status === "ok" ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
            {result.status === "ok"
              ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />}
            <div className="space-y-1">
              <p className="font-medium">{result.status === "ok" ? "Verbonden met SharePoint" : (result.message || "Verbinden mislukt")}</p>
              {result.status === "ok" && <p className="text-xs text-muted-foreground font-mono break-all">drive-id: {result.driveId}</p>}
              {result.statusCode ? <p className="text-xs text-muted-foreground">HTTP {result.statusCode}</p> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
