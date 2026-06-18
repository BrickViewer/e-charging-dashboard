import { FolderOpen, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useProjectLocationsByClient, useProjectLocationsByCompany, useSharepointFiles, type ProjectLocation } from "@/hooks/useProjectLocations";

function DossierCard({ loc }: { loc: ProjectLocation }) {
  const filesQ = useSharepointFiles(loc.folder_item_id);
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{loc.display_name}</span>
        </div>
        {loc.folder_web_url ? (
          <a href={loc.folder_web_url} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            Open in SharePoint <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <div className="mt-3 space-y-0.5">
        {!loc.folder_item_id ? (
          <p className="text-xs text-muted-foreground">Map nog niet aangemaakt.</p>
        ) : filesQ.isLoading ? (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Bestanden laden…</p>
        ) : filesQ.error ? (
          <p className="text-xs text-amber-600">Kon bestanden niet laden.</p>
        ) : (filesQ.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">Geen bestanden.</p>
        ) : (
          filesQ.data!.map((f) => (
            <a key={f.id} href={f.webUrl} target="_blank" rel="noopener" className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
              {f.isFolder ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{f.name}</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// Toont de SharePoint-dossiers (project_locations) van een klant of bedrijf met een
// live bestandslijst + deeplinks. Geef clientId óf companyId mee.
export function DossierDocuments({ clientId, companyId }: { clientId?: string; companyId?: string }) {
  const byClient = useProjectLocationsByClient(clientId);
  const byCompany = useProjectLocationsByCompany(companyId);
  const q = clientId ? byClient : byCompany;
  const locs = q.data ?? [];

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (locs.length === 0) return <p className="text-sm text-muted-foreground">Nog geen dossiers/locaties gekoppeld. Een SharePoint-map wordt aangemaakt zodra de eerste offerte voor deze {clientId ? "klant" : "organisatie"} wordt verstuurd.</p>;
  return <div className="space-y-3">{locs.map((l) => <DossierCard key={l.id} loc={l} />)}</div>;
}
