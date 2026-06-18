import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, LogOut, Save, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMicrosoftAuth } from "@/hooks/useMicrosoftAuth";
import { useGraphApi } from "@/hooks/useGraphApi";
import { getSharepointConfig, saveSharepointConfig } from "@/lib/sharepoint";

type Site = { id: string; displayName: string; webUrl: string };
type Drive = { id: string; name: string; driveType?: string };

export function Microsoft365Card() {
  const { user } = useAuth();
  const { login, logout, isConnected, microsoftUser, configured } = useMicrosoftAuth();
  const { graphFetch } = useGraphApi();

  const [sites, setSites] = useState<Site[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [siteId, setSiteId] = useState("");
  const [driveId, setDriveId] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: cfg } = useQuery({ queryKey: ["sharepoint-config"], queryFn: getSharepointConfig });
  useEffect(() => { if (cfg) { setSiteId(cfg.siteId ?? ""); setDriveId(cfg.driveId ?? ""); } }, [cfg]);

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    try {
      const res = await graphFetch("/sites?search=*");
      const list = (res?.value ?? []) as Array<{ id: string; displayName?: string; name?: string; webUrl: string }>;
      setSites(list.map((s) => ({ id: s.id, displayName: s.displayName ?? s.name ?? s.id, webUrl: s.webUrl })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sites laden mislukt"); }
    finally { setLoadingSites(false); }
  }, [graphFetch]);

  useEffect(() => { if (isConnected) void loadSites(); }, [isConnected, loadSites]);

  const onSelectSite = async (id: string) => {
    setSiteId(id); setDriveId(""); setDrives([]); setLoadingDrives(true);
    try {
      const res = await graphFetch(`/sites/${id}/drives`);
      const list = (res?.value ?? []) as Array<{ id: string; name: string; driveType?: string }>;
      setDrives(list.map((d) => ({ id: d.id, name: d.name, driveType: d.driveType })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Documentbibliotheken laden mislukt"); }
    finally { setLoadingDrives(false); }
  };

  const doLogin = async () => { setBusy(true); try { await login(); } catch (e) { toast.error(e instanceof Error ? e.message : "Inloggen mislukt"); } finally { setBusy(false); } };
  const doLogout = async () => { try { await logout(); } catch { /* ignore */ } };

  const save = async () => {
    if (!user?.id) return;
    const site = sites.find((s) => s.id === siteId);
    const drive = drives.find((d) => d.id === driveId);
    if (!site || !drive) { toast.error("Kies eerst een site en documentbibliotheek"); return; }
    setSaving(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!prof?.organization_id) throw new Error("Geen organisatie gevonden");
      await saveSharepointConfig(prof.organization_id, { site_id: site.id, drive_id: drive.id, site_url: site.webUrl, site_name: site.displayName });
      toast.success("SharePoint-koppeling opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
    finally { setSaving(false); }
  };

  return (
    <Card className="portal-card mt-4">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Microsoft 365 / SharePoint (offerte-dossiers)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log in met je Microsoft-account en kies de SharePoint-site + documentbibliotheek waar de offerte-dossiers komen.
            Bij het versturen van een offerte maakt de app automatisch de map + ongetekende offerte aan.
          </p>
        </div>

        {!configured ? (
          <p className="text-sm text-amber-600">Microsoft-koppeling is nog niet geconfigureerd (VITE_MS_CLIENT_ID ontbreekt in de build-env).</p>
        ) : !isConnected ? (
          <Button onClick={doLogin} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />} Koppelen met Microsoft 365
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3 max-w-lg">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Verbonden als <span className="font-medium">{microsoftUser?.email}</span></span>
              </div>
              <Button variant="ghost" size="sm" onClick={doLogout}><LogOut className="w-4 h-4 mr-1" /> Loskoppelen</Button>
            </div>

            <div className="grid max-w-lg grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label>SharePoint-site</Label>
                <Select value={siteId} onValueChange={onSelectSite}>
                  <SelectTrigger>{loadingSites ? <span className="text-muted-foreground">Sites laden…</span> : <SelectValue placeholder="Kies een site…" />}</SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Documentbibliotheek</Label>
                <Select value={driveId} onValueChange={setDriveId} disabled={!siteId || loadingDrives}>
                  <SelectTrigger>{loadingDrives ? <span className="text-muted-foreground">Bibliotheken laden…</span> : <SelectValue placeholder="Kies een bibliotheek…" />}</SelectTrigger>
                  <SelectContent>
                    {drives.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button onClick={save} disabled={saving || !siteId || !driveId}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Opslaan
                </Button>
              </div>
              {cfg?.driveId ? <p className="text-xs text-muted-foreground">Huidige map: <span className="font-medium">{cfg.siteName}</span></p> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
