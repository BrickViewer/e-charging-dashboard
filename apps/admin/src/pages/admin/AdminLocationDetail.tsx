import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useLocationById,
  useLocationSessions,
  useAllClients,
} from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
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
  ArrowLeftRight,
  MapPin,
  Plug,
  Zap,
  Activity,
  Link as LinkIcon,
  Unlink,
  Building2,
  AlertCircle,
  CheckCircle,
  Search,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { linkLocationToClient, unlinkLocation } from "@/services/locations";
import type { AdminLocationDetail, AdminSession, ClientWithRelations } from "@/types/db";
import { cn } from "@/lib/utils";

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
  const [linkMode, setLinkMode] = useState<"couple" | "transfer">("couple");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
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

  const locationDetail = location as AdminLocationDetail;
  const locationSessions = (sessions ?? []) as AdminSession[];
  const isLinked = !!locationDetail.client_id;
  const cps = locationDetail.charge_points || [];
  const onlineCount = cps.filter(
    (cp) => cp.status === "online" || cp.status === "in_use",
  ).length;
  const clientList = (clients ?? []) as ClientWithRelations[];
  const assignableClientList = clientList.filter(
    (client) => client.status !== "verwijderd" && !client.erased_at,
  );
  // Bij overdragen: de huidige eigenaar uit de keuzelijst halen.
  const pickerClientList = assignableClientList.filter(
    (client) => linkMode !== "transfer" || client.id !== locationDetail.client_id,
  );
  const transferTargetClient = clientList.find((client) => client.id === transferTargetId);
  const normalizedClientSearch = clientSearch.trim().toLowerCase();
  const filteredClientList = pickerClientList.filter((client) => {
    if (!normalizedClientSearch) return true;

    return [
      client.company_name,
      client.contact_name,
      client.contact_email,
      client.kvk,
      client.client_number ? `#${client.client_number}` : "",
      client.client_number ? String(client.client_number) : "",
    ].some((value) => value?.toLowerCase().includes(normalizedClientSearch));
  });

  // Koppelen én overdragen lopen via dezelfde RPC (set_location_client): niet-afgerekende
  // sessies volgen de nieuwe eigenaar, afgerekende blijven bij de vorige.
  const applyLink = async (targetId: string, onDone?: () => void) => {
    if (!targetId || !id) return;
    setSubmitting(true);
    try {
      const result = await linkLocationToClient(id, targetId);
      const assigned = result?.reassigned_sessions ?? 0;
      const retained = result?.retained_final_sessions ?? 0;
      const wasTransfer = !!result?.previous_client_id;
      toast.success(
        `${wasTransfer ? "Locatie overgedragen" : "Locatie gekoppeld"}: ${assigned} sessie(s) ${wasTransfer ? "meegegaan" : "toegewezen"}` +
          (retained > 0 ? `, ${retained} afgerekende sessie(s) behouden bij vorige eigenaar` : ""),
      );
      queryClient.invalidateQueries({ queryKey: ["admin-location", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-location-sessions", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", targetId] });
      if (result?.previous_client_id) {
        queryClient.invalidateQueries({ queryKey: ["admin-client", result.previous_client_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-client-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements"] });
      onDone?.();
    } catch (err) {
      toast.error(err.message || "Mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLink = () => {
    if (!selectedClientId) return;
    // Overdragen krijgt een extra bevestiging (typ de doel-klantnaam) vanwege de geld-impact.
    if (linkMode === "transfer") {
      setTransferTargetId(selectedClientId);
      setLinkDialogOpen(false);
      setTransferConfirmOpen(true);
      return;
    }
    void applyLink(selectedClientId, () => {
      setLinkDialogOpen(false);
      setSelectedClientId("");
      setClientSearch("");
    });
  };

  const handleConfirmTransfer = () =>
    applyLink(transferTargetId, () => {
      setTransferConfirmOpen(false);
      setTransferTargetId("");
      setSelectedClientId("");
      setClientSearch("");
    });

  const handleUnlink = async () => {
    if (!id) return;
    const previousClientId = locationDetail.client_id || undefined;
    setSubmitting(true);
    try {
      const result = await unlinkLocation(id, previousClientId);
      const detached = result?.reassigned_sessions ?? 0;
      const retained = result?.retained_final_sessions ?? 0;
      toast.success(
        `Locatie ontkoppeld: ${detached} sessies losgekoppeld, ${retained} afgerekende sessies behouden`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-location", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      if (previousClientId) {
        queryClient.invalidateQueries({ queryKey: ["admin-client", previousClientId] });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-client-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements"] });
      setUnlinkDialogOpen(false);
    } catch (err) {
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
              {locationDetail.eflux_location_id ?? "Geen e-Flux ID"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold">
            {locationDetail.name || locationDetail.address || "Onbekende locatie"}
          </h1>
          {locationDetail.address && (
            <p className="text-sm text-muted-foreground mt-1">
              {locationDetail.address}
              {locationDetail.postal_code && `, ${locationDetail.postal_code}`}
              {locationDetail.city && ` ${locationDetail.city}`}
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
                    to={`/admin/klanten/${locationDetail.client_id}`}
                    className="font-semibold hover:text-primary inline-flex items-center gap-1"
                  >
                    {locationDetail.clients?.client_number && (
                      <span className="text-xs font-semibold tabular-nums text-primary">
                        #{locationDetail.clients.client_number}
                      </span>
                    )}
                    {locationDetail.clients?.company_name || "Onbekende klant"}
                    <Building2 className="w-3.5 h-3.5" />
                  </Link>
                  {locationDetail.clients?.contact_email && (
                    <p className="text-xs text-muted-foreground">
                      {locationDetail.clients.contact_email}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLinkMode("transfer");
                    setSelectedClientId("");
                    setClientSearch("");
                    setLinkDialogOpen(true);
                  }}
                >
                  <ArrowLeftRight className="w-4 h-4 mr-2" />
                  Overdragen naar ander account
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlinkDialogOpen(true)}
                >
                  <Unlink className="w-4 h-4 mr-2" />
                  Ontkoppelen
                </Button>
              </div>
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
                    Niet-afgerekende sessies van deze locatie gaan mee zodra je
                    de locatie aan een klant koppelt.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  setLinkMode("couple");
                  setLinkDialogOpen(true);
                }}
              >
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
              {locationSessions.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Type
            </p>
            <p className="text-base font-medium mt-2 capitalize">
              {locationDetail.property_type || "—"}
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
              {cps.map((cp) => (
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
                        Prijs (excl BTW)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationSessions.map((s) => (
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
                          {s.kwh_delivered ?? "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          €{Number(s.reimbursement_amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {(!sessions || sessions.length === 0) && (
                      <tr>
                        <td
                          colSpan={4}
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
                ["Naam", locationDetail.name],
                ["Adres", locationDetail.address],
                ["Postcode", locationDetail.postal_code],
                ["Stad", locationDetail.city],
                ["Type pand", locationDetail.property_type],
                ["Aantal parkeerplekken", locationDetail.parking_spots],
                ["EAN-code", locationDetail.ean_code],
                ["Net-aansluiting", locationDetail.grid_connection_amps ? `${locationDetail.grid_connection_amps} A` : null],
                ["Zonnepanelen", locationDetail.has_solar ? `Ja${locationDetail.solar_capacity_kwp ? ` (${locationDetail.solar_capacity_kwp} kWp)` : ""}` : "Nee"],
                ["e-Flux Location ID", locationDetail.eflux_location_id],
                ["Coördinaten", locationDetail.latitude && locationDetail.longitude ? `${locationDetail.latitude}, ${locationDetail.longitude}` : null],
                ["Aangemaakt", locationDetail.created_at ? format(new Date(locationDetail.created_at), "d MMM yyyy HH:mm", { locale: nl }) : null],
                ["Klant gekoppeld op", locationDetail.client_assigned_at ? format(new Date(locationDetail.client_assigned_at), "d MMM yyyy HH:mm", { locale: nl }) : null],
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
      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) {
            setClientSearch("");
            setSelectedClientId("");
          }
        }}
      >
        <DialogContent className="bg-card text-card-foreground shadow-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {linkMode === "transfer" ? "Overdragen naar ander account" : "Koppel locatie aan klant"}
            </DialogTitle>
            <DialogDescription className="text-foreground/75">
              {linkMode === "transfer"
                ? "Selecteer het account waarnaar je deze locatie overdraagt. Alle niet-afgerekende sessies gaan mee naar het nieuwe account; al afgerekende sessies blijven bij de huidige eigenaar."
                : "Selecteer bij welke klant deze locatie hoort. Alle niet-afgerekende sessies van deze locatie worden aan de gekozen klant gekoppeld. Sessies die al definitief zijn afgerekend blijven historisch staan."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium text-foreground">Klant</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Zoek op klantnaam, klantnummer of KvK..."
                className="bg-background/60 pl-9 focus-visible:ring-primary"
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background/50 p-1">
              {filteredClientList.map((client) => {
                const isSelected = selectedClientId === client.id;

                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition-colors",
                      isSelected
                        ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                        : "text-foreground hover:bg-foreground/[0.07]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {client.client_number && (
                          <span className="text-xs font-semibold tabular-nums text-primary">
                            #{client.client_number}
                          </span>
                        )}
                        <span className="truncate font-medium">{client.company_name}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {client.kvk && <span className="font-mono">KvK {client.kvk}</span>}
                        {client.contact_email && <span>{client.contact_email}</span>}
                      </span>
                    </span>
                    {isSelected && (
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />
                    )}
                  </button>
                );
              })}

              {filteredClientList.length === 0 && (
                <div className="rounded-md px-3 py-6 text-center text-sm text-muted-foreground">
                  {assignableClientList.length === 0
                    ? "Geen klanten beschikbaar om te koppelen."
                    : "Geen klanten gevonden."}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-foreground/15 bg-foreground/5 text-foreground hover:bg-foreground/10 hover:text-foreground"
              onClick={() => {
                setLinkDialogOpen(false);
                setClientSearch("");
                setSelectedClientId("");
              }}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selectedClientId || submitting}
            >
              {submitting ? "Bezig…" : linkMode === "transfer" ? "Overdragen…" : "Koppel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink-dialoog — typ de klantnaam ter bevestiging */}
      <DeleteConfirmDialog
        open={unlinkDialogOpen}
        onOpenChange={setUnlinkDialogOpen}
        title="Locatie ontkoppelen?"
        description={
          <>
            Deze locatie wordt losgekoppeld van{" "}
            <strong>
              {locationDetail.clients?.client_number
                ? `#${locationDetail.clients.client_number} `
                : ""}
              {locationDetail.clients?.company_name || "deze klant"}
            </strong>
            . Sessies zonder definitieve afrekening worden losgekoppeld en gaan mee
            bij een nieuwe klantkoppeling. Sessies die al afgerekend zijn blijven
            historisch bij de oude klant.
          </>
        }
        confirmationValue={locationDetail.clients?.company_name ?? ""}
        confirmationLabel={
          <>
            Typ <span className="font-medium text-foreground">{locationDetail.clients?.company_name}</span> om te ontkoppelen *
          </>
        }
        confirmLabel="Ontkoppelen"
        isSubmitting={submitting}
        onConfirm={() => handleUnlink()}
      />

      {/* Overdracht-bevestiging — typ de doel-klantnaam ter bevestiging (geld-impact) */}
      <DeleteConfirmDialog
        open={transferConfirmOpen}
        onOpenChange={(open) => {
          setTransferConfirmOpen(open);
          if (!open) setTransferTargetId("");
        }}
        title="Locatie overdragen?"
        description={
          <>
            Deze locatie wordt overgedragen aan{" "}
            <strong>{transferTargetClient?.company_name || "het gekozen account"}</strong>. Alle
            niet-afgerekende sessies van deze locatie gaan mee naar dit account; al afgerekende
            sessies blijven bij de huidige eigenaar.
          </>
        }
        confirmationValue={transferTargetClient?.company_name ?? ""}
        confirmationLabel={
          <>
            Typ <span className="font-medium text-foreground">{transferTargetClient?.company_name}</span> om over te dragen *
          </>
        }
        confirmLabel="Overdragen"
        isSubmitting={submitting}
        onConfirm={() => handleConfirmTransfer()}
      />
    </div>
  );
}
