import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useLocationById,
  useLocationSessions,
  useAllClients,
} from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  MapPin,
  Plug,
  Zap,
  Activity,
  Link as LinkIcon,
  Unlink,
  Building2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { linkLocationToClient, unlinkLocation } from "@/services/locations";

const statusLabels: Record<string, string> = {
  online: "Online",
  in_use: "In gebruik",
  offline: "Offline",
  error: "Storing",
  installation_pending: "Installatie",
};

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case "online":
    case "in_use":
      return "bg-primary/10 text-primary border-primary/20";
    case "offline":
    case "error":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function AdminLocationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: location, isLoading } = useLocationById(id);
  const { data: sessions } = useLocationSessions(id);
  const { data: clients } = useAllClients();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Locatie niet gevonden.
      </div>
    );
  }

  const isLinked = !!location.client_id;
  const cps = (location as any).charge_points || [];
  const onlineCount = cps.filter(
    (cp: any) => cp.status === "online" || cp.status === "in_use",
  ).length;
  const clientList = clients ?? [];

  const handleLink = async () => {
    if (!selectedClientId || !id) return;
    setSubmitting(true);
    try {
      await linkLocationToClient(id, selectedClientId);
      toast.success("Locatie gekoppeld aan klant");
      queryClient.invalidateQueries({ queryKey: ["admin-location", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      setLinkDialogOpen(false);
      setSelectedClientId("");
    } catch (err: any) {
      toast.error(err.message || "Koppelen mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await unlinkLocation(id, location.client_id || undefined);
      toast.success("Locatie ontkoppeld");
      queryClient.invalidateQueries({ queryKey: ["admin-location", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      setUnlinkDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Ontkoppelen mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/locaties")}
          className="rounded-full mt-1"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <MapPin className="w-3 h-3" />
            <span className="font-mono">
              {location.eflux_location_id ?? "Geen e-Flux ID"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold">
            {location.name || location.address || "Onbekende locatie"}
          </h1>
          {location.address && (
            <p className="text-sm text-muted-foreground mt-1">
              {location.address}
              {location.postal_code && `, ${location.postal_code}`}
              {location.city && ` ${location.city}`}
            </p>
          )}
        </div>
      </div>

      {/* Klant-koppeling-paneel */}
      <Card className={isLinked ? "" : "border-warning/40 bg-warning/5"}>
        <CardContent className="p-5">
          {isLinked ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Gekoppeld aan klant
                  </p>
                  <Link
                    to={`/admin/klanten/${location.client_id}`}
                    className="font-semibold hover:text-primary inline-flex items-center gap-1"
                  >
                    {(location as any).clients?.company_name || "Onbekende klant"}
                    <Building2 className="w-3.5 h-3.5" />
                  </Link>
                  {(location as any).clients?.contact_email && (
                    <p className="text-xs text-muted-foreground">
                      {(location as any).clients.contact_email}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnlinkDialogOpen(true)}
              >
                <Unlink className="w-4 h-4 mr-2" />
                Ontkoppelen
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Nog niet gekoppeld</p>
                  <p className="text-xs text-muted-foreground">
                    Sessies van deze locatie krijgen pas een klant zodra je
                    koppelt. Bestaande historische sessies worden eenmalig
                    bijgewerkt; daarna geldt cutoff.
                  </p>
                </div>
              </div>
              <Button onClick={() => setLinkDialogOpen(true)}>
                <LinkIcon className="w-4 h-4 mr-2" />
                Koppel aan klant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Laadpunten
            </p>
            <p className="text-2xl font-semibold mt-1 tabular-nums">
              {cps.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Online
            </p>
            <p className="text-2xl font-semibold mt-1 tabular-nums text-primary">
              {onlineCount}
              <span className="text-base text-muted-foreground"> / {cps.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Sessies (laatste 50)
            </p>
            <p className="text-2xl font-semibold mt-1 tabular-nums">
              {sessions?.length || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Type
            </p>
            <p className="text-base font-medium mt-2 capitalize">
              {location.property_type || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="laadpunten">
        <TabsList>
          <TabsTrigger value="laadpunten">
            <Plug className="w-4 h-4 mr-1.5" />
            Laadpunten
          </TabsTrigger>
          <TabsTrigger value="sessies">
            <Zap className="w-4 h-4 mr-1.5" />
            Sessies
          </TabsTrigger>
          <TabsTrigger value="info">
            <Activity className="w-4 h-4 mr-1.5" />
            Info
          </TabsTrigger>
        </TabsList>

        {/* Laadpunten */}
        <TabsContent value="laadpunten" className="space-y-3 mt-4">
          {cps.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Geen laadpunten op deze locatie. Sync eerst vanuit e-Flux.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cps.map((cp: any) => (
                <Card key={cp.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <Plug className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {cp.name || cp.serial_number || "Laadpunt"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[cp.brand, cp.model, cp.type?.toUpperCase()]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <Badge className={statusBadgeClass(cp.status)} variant="outline">
                        {statusLabels[cp.status] || cp.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Vermogen: </span>
                        <span className="font-medium">
                          {cp.max_power ? `${cp.max_power} kW` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Connectoren: </span>
                        <span className="font-medium">{cp.num_connectors || 1}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Verbinding: </span>
                        <ConnectivityIndicator
                          state={cp.connectivity_state || "unknown"}
                          showLabel
                        />
                      </div>
                      {cp.eflux_evse_controller_id && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">e-Flux ID: </span>
                          <span className="font-mono text-[10px]">
                            {cp.eflux_evse_controller_id}
                          </span>
                        </div>
                      )}
                      {cp.last_heartbeat_at && (
                        <div className="col-span-2 text-muted-foreground">
                          Laatste heartbeat:{" "}
                          {format(new Date(cp.last_heartbeat_at), "d MMM HH:mm", {
                            locale: nl,
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sessies */}
        <TabsContent value="sessies" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        Datum
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        Laadpunt
                      </th>
                      <th className="text-right p-3 font-medium text-muted-foreground">
                        kWh
                      </th>
                      <th className="text-right p-3 font-medium text-muted-foreground">
                        Bruto
                      </th>
                      <th className="text-right p-3 font-medium text-muted-foreground">
                        Klantdeel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions?.map((s: any) => (
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-0 hover:bg-accent/40"
                      >
                        <td className="p-3">
                          {s.started_at
                            ? format(new Date(s.started_at), "d MMM yyyy HH:mm", {
                                locale: nl,
                              })
                            : "—"}
                        </td>
                        <td className="p-3">{s.charge_points?.name || "—"}</td>
                        <td className="p-3 text-right tabular-nums">
                          {Number(s.kwh_delivered || 0).toFixed(1)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          €{Number(s.gross_revenue || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-primary font-medium">
                          €{Number(s.client_share || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {(!sessions || sessions.length === 0) && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-12 text-center text-muted-foreground"
                        >
                          Nog geen sessies geregistreerd op deze locatie.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Info — alle Road-velden read-only */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-3 text-sm">
              {[
                ["Naam", location.name],
                ["Adres", location.address],
                ["Postcode", location.postal_code],
                ["Stad", location.city],
                ["Type pand", location.property_type],
                ["Aantal parkeerplekken", location.parking_spots],
                ["EAN-code", location.ean_code],
                ["Net-aansluiting", location.grid_connection_amps ? `${location.grid_connection_amps} A` : null],
                ["Zonnepanelen", location.has_solar ? `Ja${location.solar_capacity_kwp ? ` (${location.solar_capacity_kwp} kWp)` : ""}` : "Nee"],
                ["e-Flux Location ID", location.eflux_location_id],
                ["Coördinaten", location.latitude && location.longitude ? `${location.latitude}, ${location.longitude}` : null],
                ["Aangemaakt", location.created_at ? format(new Date(location.created_at), "d MMM yyyy HH:mm", { locale: nl }) : null],
                ["Klant gekoppeld op", location.client_assigned_at ? format(new Date(location.client_assigned_at), "d MMM yyyy HH:mm", { locale: nl }) : null],
              ].map(([label, val]) => (
                <div
                  key={label as string}
                  className="flex justify-between gap-4 py-2 border-b border-border last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">
                    {val ?? <span className="text-muted-foreground">—</span>}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground italic pt-3">
                Alle velden hier zijn afkomstig uit e-Flux. Wijzigingen voer je
                door in de e-Flux dashboard; ze worden bij de eerstvolgende sync
                opgehaald.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Link-dialoog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koppel locatie aan klant</DialogTitle>
            <DialogDescription>
              Selecteer welke klant deze locatie eigenaart. Alle nog-niet-gestempelde
              sessies van deze locatie krijgen direct deze klant. Toekomstige
              sessies worden automatisch bij deze klant geboekt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Klant</label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een klant…" />
              </SelectTrigger>
              <SelectContent>
                {clientList.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span>{c.company_name}</span>
                      {c.kvk && (
                        <span className="text-xs text-muted-foreground font-mono">
                          KvK {c.kvk}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLinkDialogOpen(false)}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selectedClientId || submitting}
            >
              {submitting ? "Bezig…" : "Koppel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink-dialoog */}
      <Dialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Locatie ontkoppelen?</DialogTitle>
            <DialogDescription>
              Deze locatie wordt losgekoppeld van{" "}
              <strong>
                {(location as any).clients?.company_name || "deze klant"}
              </strong>
              . Bestaande sessies blijven bij deze klant geboekt; alleen
              toekomstige sessies worden ongekoppeld totdat je opnieuw koppelt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlinkDialogOpen(false)}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnlink}
              disabled={submitting}
            >
              {submitting ? "Bezig…" : "Ontkoppelen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
