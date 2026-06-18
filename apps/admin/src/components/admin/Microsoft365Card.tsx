import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSharepointConfig } from "@/lib/sharepoint";

// SharePoint-doelmap (org-breed). Wordt SERVER-SIDE ingesteld via de app-only Microsoft-app
// (geen aparte Microsoft-login of mapkiezer in de browser nodig). Alleen de superadmin ziet dit.
export function Microsoft365Card() {
  const queryClient = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["sharepoint-config"], queryFn: getSharepointConfig });
  const [site, setSite] = useState("E-Charging");
  const [library, setLibrary] = useState("Documenten");
  const [folder, setFolder] = useState("02 Locaties");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-setup", {
        body: { site_query: site.trim(), drive_name: library.trim(), folder_name: folder.trim() },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as { context?: Response }).context?.json(); if (b?.message) msg = b.message; } catch { /* body niet leesbaar */ }
        throw new Error(msg);
      }
      const res = data as { status?: string; message?: string; site?: string; drive?: string; folder?: string; folders_found?: string[]; drives_found?: string[] };
      if (res?.status !== "ok") {
        const extra = res?.folders_found ? ` (gevonden mappen: ${res.folders_found.join(", ")})` : res?.drives_found ? ` (gevonden bibliotheken: ${res.drives_found.join(", ")})` : "";
        throw new Error((res?.message || "Instellen mislukt") + extra);
      }
      queryClient.invalidateQueries({ queryKey: ["sharepoint-config"] });
      toast.success(`Gekoppeld: ${res.site} › ${res.drive} › ${res.folder}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Instellen mislukt"); }
    finally { setSaving(false); }
  };

  return (
    <Card className="portal-card mt-4">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">SharePoint — offerte-dossiers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Org-breed: alle offerte-dossiers komen in deze map. Wordt server-side via de Microsoft-app
            ingesteld — geen aparte Microsoft-login of mapkiezer nodig. Geldt voor álle medewerkers.
          </p>
        </div>

        {cfg?.driveId ? (
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm max-w-lg">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>Ingesteld: <span className="font-medium">{cfg.siteName}</span> › {library} › {folder}</span>
          </div>
        ) : (
          <p className="text-sm text-amber-600">Nog niet ingesteld — controleer de waarden en klik "Instellen".</p>
        )}

        <div className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">Site</Label><Input value={site} onChange={(e) => setSite(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Bibliotheek</Label><Input value={library} onChange={(e) => setLibrary(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Doelmap</Label><Input value={folder} onChange={(e) => setFolder(e.target.value)} className="h-9" /></div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {cfg?.driveId ? "Opnieuw instellen" : "Instellen"}
        </Button>
        <p className="text-[11px] text-muted-foreground">De doelmap moet bestaan in de bibliotheek. Standaard: E-Charging › Documenten › 02 Locaties.</p>
      </CardContent>
    </Card>
  );
}
