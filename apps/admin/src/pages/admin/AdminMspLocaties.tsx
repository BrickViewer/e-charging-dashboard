import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Search, Zap, AlertCircle, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { type Bbox, type MspLocation, useMspLocations, useMspLocationTariff } from "@/hooks/useMspLocations";

const NL_CENTER: [number, number] = [52.15, 5.3];
const eur = (v: number) => `€ ${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dotIcon(available: number | null) {
  const color = available == null ? "#9ca3af" : available > 0 ? "#16a34a" : "#dc2626";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Geeft de huidige kaartgrenzen door (bij start + na elke beweging/zoom).
function BoundsWatcher({ onChange }: { onChange: (b: Bbox) => void }) {
  const emit = (map: L.Map) => {
    const b = map.getBounds();
    onChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  };
  const map = useMapEvents({ moveend: () => emit(map), zoomend: () => emit(map) });
  useEffect(() => { emit(map); /* initiële grenzen */ }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function availabilityLabel(loc: MspLocation): string {
  if (loc.available == null && loc.total == null) return "—";
  return `${loc.available ?? "?"} / ${loc.total ?? "?"} beschikbaar`;
}

function TariffLine({ locationId }: { locationId: string }) {
  const { data: tariff, isLoading } = useMspLocationTariff(locationId);
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Tarief laden…</p>;
  if (!tariff || (tariff.perKwh == null && tariff.perHour == null)) {
    return <p className="text-[11px] text-muted-foreground">Geen tarief beschikbaar</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tariff.perKwh != null && <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium">{eur(tariff.perKwh)} / kWh</span>}
      {tariff.perHour != null && <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium">{eur(tariff.perHour)} / uur</span>}
    </div>
  );
}

export default function AdminMspLocaties() {
  const [rawBbox, setRawBbox] = useState<Bbox | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const mapRef = useRef<L.Map | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce de bbox die naar de edge-functie gaat (kaart beweegt vaak).
  useEffect(() => {
    if (!rawBbox) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBbox(rawBbox), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawBbox]);

  const { data, isFetching, isError, error } = useMspLocations(bbox);
  const locations = useMemo(() => data?.locations ?? [], [data]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) =>
      [l.name, l.address, l.city, l.postalCode, l.operator].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [locations, debouncedSearch]);

  const selectRow = (loc: MspLocation) => {
    setSelectedId(loc.id);
    if (loc.lat != null && loc.lng != null && mapRef.current) {
      mapRef.current.flyTo([loc.lat, loc.lng], Math.max(mapRef.current.getZoom(), 15));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">MSP Locaties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Laadlocaties waar onze laadpassen kunnen laden (roaming, live uit e-Flux) — met beschikbaarheid en tarief.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{filtered.length} locatie{filtered.length === 1 ? "" : "s"} in beeld{data?.capped ? " (max bereikt — zoom in)" : ""}</span>
        </div>
      </div>

      {isError && (
        <Card className="portal-card border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {(error as Error)?.message ?? "Locaties ophalen mislukt"}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Kaart */}
        <Card className="portal-card overflow-hidden lg:col-span-2">
          <CardContent className="p-0">
            <div className="h-[72vh] w-full">
              <MapContainer ref={mapRef} center={NL_CENTER} zoom={8} scrollWheelZoom className="h-full w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <BoundsWatcher onChange={setRawBbox} />
                {filtered.map((loc, i) =>
                  loc.lat != null && loc.lng != null ? (
                    <Marker
                      key={loc.id ?? `${loc.lat},${loc.lng},${i}`}
                      position={[loc.lat, loc.lng]}
                      icon={dotIcon(loc.available)}
                      eventHandlers={{ click: () => setSelectedId(loc.id) }}
                    >
                      <Popup>
                        <div className="space-y-1">
                          <p className="font-semibold">{loc.name ?? loc.address ?? "Locatie"}</p>
                          {loc.address && <p className="text-xs text-muted-foreground">{loc.address}</p>}
                          <p className="text-xs">{availabilityLabel(loc)}</p>
                          {loc.operator && <p className="text-xs text-muted-foreground">Operator: {loc.operator}</p>}
                          {loc.id && <TariffLine locationId={loc.id} />}
                        </div>
                      </Popup>
                    </Marker>
                  ) : null,
                )}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* Lijst */}
        <Card className="portal-card">
          <CardContent className="p-0">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoek op naam, adres, plaats…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="max-h-[64vh] overflow-y-auto">
              {isFetching && locations.length === 0 ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Geen locaties in dit kaartgebied.</p>
              ) : (
                filtered.map((loc, i) => {
                  const isSel = loc.id != null && loc.id === selectedId;
                  return (
                    <div
                      key={loc.id ?? `${loc.lat},${loc.lng},${i}`}
                      className={`cursor-pointer border-b border-border p-3 transition-colors last:border-0 hover:bg-accent/40 ${isSel ? "bg-accent/50" : ""}`}
                      onClick={() => selectRow(loc)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{loc.name ?? loc.address ?? "Locatie"}</p>
                          <p className="truncate text-xs text-muted-foreground">{[loc.address, loc.city].filter(Boolean).join(", ") || "—"}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-medium ${loc.available && loc.available > 0 ? "text-gauge-green" : "text-muted-foreground"}`}>
                          {availabilityLabel(loc)}
                        </span>
                      </div>
                      {isSel && (
                        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                          {loc.operator && <p className="text-[11px] text-muted-foreground">Operator: {loc.operator}</p>}
                          {loc.evses.length > 0 && (
                            <ul className="space-y-0.5">
                              {loc.evses.map((e, j) => (
                                <li key={e.evseId ?? j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Zap className="h-3 w-3" />
                                  <span className="font-mono">{e.evseId ?? "EVSE"}</span>
                                  {e.connectorType && <span>· {e.connectorType}</span>}
                                  {e.maxPower != null && <span>· {e.maxPower} kW</span>}
                                  {e.status && <span>· {e.status}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {loc.id && <TariffLine locationId={loc.id} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <MapPin className="h-3 w-3" /> Versleep/zoom de kaart om locaties in dat gebied te laden. Beschikbaarheid en tarief komen live uit e-Flux (read-only).
      </p>
    </div>
  );
}
