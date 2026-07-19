import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Plug } from "lucide-react";
import type { ClientWithRelations } from "@/types/db";

export function ClientLocationsTab({
  client,
  onNavigate,
  onLinkLocation,
}: {
  client: ClientWithRelations;
  onNavigate: (path: string) => void;
  onLinkLocation?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-medium">Locaties ({(client.locations || []).length})</h3>
        <div className="flex gap-2">
          {onLinkLocation && (
            <Button onClick={onLinkLocation}>
              <Plug className="w-4 h-4 mr-1" />
              Locatie koppelen
            </Button>
          )}
          <Button variant="outline" onClick={() => onNavigate("/beheer/locaties?filter=unlinked")}>
            <MapPin className="w-4 h-4 mr-1" />
            Naar Locaties-overzicht
          </Button>
        </div>
      </div>

      {(client.locations || []).length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Geen locaties gekoppeld aan deze klant.{" "}
            {onLinkLocation ? (
              <button onClick={onLinkLocation} className="text-primary hover:underline">
                Koppel een locatie
              </button>
            ) : (
              <button onClick={() => onNavigate("/beheer/locaties")} className="text-primary hover:underline">
                Locaties-overzicht
              </button>
            )}
            .
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(client.locations || []).map((loc) => {
          const cps = loc.charge_points || [];
          const onlineCount = cps.filter(
            (cp) => cp.status === "online" || cp.status === "in_use",
          ).length;
          return (
            <Card
              key={loc.id}
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => onNavigate(`/beheer/locaties/${loc.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <p className="font-medium text-sm truncate">
                      {loc.name || loc.address || "Locatie"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {onlineCount}/{cps.length} online
                  </span>
                </div>
                {loc.address && (
                  <p className="text-xs text-muted-foreground truncate">
                    {loc.address}
                    {loc.city ? `, ${loc.city}` : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                  {loc.property_type && <span>Type: {loc.property_type}</span>}
                  {loc.eflux_location_id && (
                    <span className="font-mono">
                      {loc.eflux_location_id.slice(0, 8)}…
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
