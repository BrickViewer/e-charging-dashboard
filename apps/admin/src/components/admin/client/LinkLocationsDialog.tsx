import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, Plug, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkLocationToClient, useUnlinkedLocations } from "@/hooks/useOnboarding";

// Zoekbaar koppel-scherm: toont álle nog niet-gekoppelde e-Flux-locaties en laat je er
// direct meerdere achter elkaar aan deze klant koppelen — zonder de klantpagina te verlaten.
export function LinkLocationsDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: {
  clientId: string;
  clientName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: locations, isLoading } = useUnlinkedLocations(open);
  const link = useLinkLocationToClient();
  const [search, setSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Zoekterm resetten zodra het scherm sluit.
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = locations ?? [];
    if (!q) return list;
    return list.filter((l) =>
      [l.name, l.address, l.city].filter(Boolean).some((s) => s!.toLowerCase().includes(q)),
    );
  }, [locations, search]);

  const handleLink = async (locationId: string) => {
    setLinkingId(locationId);
    try {
      await link.mutateAsync({ locationId, clientId });
      // De klantdetail-cache verversen zodat de onboarding-strip + Locaties-tab meteen bijwerken.
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success("Locatie gekoppeld aan de klant");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Koppelen mislukt");
    } finally {
      setLinkingId(null);
    }
  };

  const total = locations?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Locaties koppelen</DialogTitle>
          <DialogDescription>
            Koppel ongekoppelde e-Flux-locaties aan {clientName || "deze klant"}. Zoek en koppel er zoveel als je wilt —
            de laadsessies tellen daarna mee voor deze klant.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam, adres of plaats…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {total === 0
                ? "Geen ongekoppelde locaties. Nieuwe laadpunten komen binnen via de e-Flux-sync."
                : "Geen locaties gevonden voor deze zoekopdracht."}
            </p>
          ) : (
            filtered.map((loc) => {
              const cpCount = loc.charge_points?.length ?? 0;
              const addr = [loc.address, loc.city].filter(Boolean).join(", ");
              return (
                <div
                  key={loc.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{loc.name || loc.address || "Locatie"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {addr || "Geen adres"} · {cpCount} laadpunt{cpCount === 1 ? "" : "en"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                    disabled={linkingId === loc.id}
                    onClick={() => handleLink(loc.id)}
                  >
                    {linkingId === loc.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plug className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Koppelen
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {total > 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} van {total} ongekoppelde locatie{total === 1 ? "" : "s"} getoond.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
