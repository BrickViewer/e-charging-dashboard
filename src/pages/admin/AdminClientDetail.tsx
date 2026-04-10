import { useParams, useNavigate } from "react-router-dom";
import { useClientById, useClientSettlements, useClientActivity, useClientSessions } from "@/hooks/useAdminData";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { formatEuro, formatNumber } from "@/services/calculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ChevronDown, MapPin, Zap, FileText, Activity, Building2, Upload } from "lucide-react";

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClientById(id);
  const { data: settlements } = useClientSettlements(id);
  const { data: activity } = useClientActivity(id);
  const { data: sessions } = useClientSessions(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Klant niet gevonden</p>
        <Button variant="link" onClick={() => navigate("/admin/klanten")}>Terug naar overzicht</Button>
      </div>
    );
  }

  const allCPs = (client.locations || []).flatMap((l: any) => l.charge_points || []);
  const totalKwh = sessions?.reduce((s, sess) => s + Number(sess.kwh_delivered || 0), 0) || 0;
  const totalRevenue = settlements?.reduce((s, set) => s + Number(set.gross_revenue || 0), 0) || 0;
  const totalPayout = settlements?.reduce((s, set) => s + Number(set.client_payout || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/klanten")}>
          <ArrowLeft className="w-4 h-4 mr-1" />Klanten
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{client.company_name}</h1>
        <StatusBadge status={client.status || "prospect"} />
      </div>

      <Tabs defaultValue="overzicht">
        <TabsList>
          <TabsTrigger value="overzicht"><Building2 className="w-4 h-4 mr-1" />Overzicht</TabsTrigger>
          <TabsTrigger value="locaties"><MapPin className="w-4 h-4 mr-1" />Locaties</TabsTrigger>
          <TabsTrigger value="financieel"><Zap className="w-4 h-4 mr-1" />Financieel</TabsTrigger>
          <TabsTrigger value="documenten"><FileText className="w-4 h-4 mr-1" />Documenten</TabsTrigger>
          <TabsTrigger value="activiteit"><Activity className="w-4 h-4 mr-1" />Activiteit</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overzicht */}
        <TabsContent value="overzicht" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Locaties</p><p className="text-2xl font-semibold">{(client.locations || []).length}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Laadpunten</p><p className="text-2xl font-semibold">{allCPs.length}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Totaal kWh</p><p className="text-2xl font-semibold">{formatNumber(totalKwh)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Totaal sessies</p><p className="text-2xl font-semibold">{sessions?.length || 0}</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Klantgegevens</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Contact:</span> {client.contact_name}</p>
                <p><span className="text-muted-foreground">E-mail:</span> {client.contact_email}</p>
                <p><span className="text-muted-foreground">Telefoon:</span> {client.contact_phone || "—"}</p>
                <p><span className="text-muted-foreground">KVK:</span> {client.kvk || "—"}</p>
                <p><span className="text-muted-foreground">Adres:</span> {[client.billing_address_street, client.billing_address_postal, client.billing_address_city].filter(Boolean).join(", ") || "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Startdatum:</span> {client.contract_start_date || "—"}</p>
                <p><span className="text-muted-foreground">Looptijd:</span> {client.contract_duration_months} maanden</p>
                <p><span className="text-muted-foreground">Revenue share:</span> {client.revenue_share_percentage}%</p>
                <p><span className="text-muted-foreground">Laadtarief:</span> €{Number(client.charge_rate_per_kwh).toFixed(2)}/kWh</p>
                <p><span className="text-muted-foreground">Stripe:</span> {client.stripe_onboarding_status || "pending"}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Locaties & Laadpunten */}
        <TabsContent value="locaties" className="space-y-4">
          {(client.locations || []).length === 0 && (
            <p className="text-muted-foreground text-center py-8">Geen locaties</p>
          )}
          {(client.locations || []).map((loc: any) => (
            <Collapsible key={loc.id} defaultOpen>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-base">{loc.name || "Locatie"}</CardTitle>
                      <span className="text-sm text-muted-foreground">— {loc.address}{loc.city ? `, ${loc.city}` : ""}</span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span>Pandtype: {loc.property_type}</span>
                      {loc.parking_spots && <span>Parkeerplaatsen: {loc.parking_spots}</span>}
                      {loc.has_solar && <span>Solar: {loc.solar_capacity_kwp} kWp</span>}
                      {loc.ean_code && <span>EAN: {loc.ean_code}</span>}
                    </div>
                    {(loc.charge_points || []).length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left p-2 font-medium text-muted-foreground">Naam</th>
                            <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                            <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                            <th className="text-left p-2 font-medium text-muted-foreground">Laatste heartbeat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(loc.charge_points || []).map((cp: any) => (
                            <tr key={cp.id} className="border-b border-border last:border-0">
                              <td className="p-2 font-medium">{cp.name}</td>
                              <td className="p-2">{cp.type}</td>
                              <td className="p-2"><ConnectivityIndicator state={cp.connectivity_state || "unknown"} /></td>
                              <td className="p-2 text-muted-foreground">
                                {cp.last_heartbeat_at ? new Date(cp.last_heartbeat_at).toLocaleString("nl-NL") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </TabsContent>

        {/* Tab 3: Financieel */}
        <TabsContent value="financieel" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Totaal uitbetaald</p><p className="text-2xl font-semibold">{formatEuro(totalPayout)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Totaal omzet</p><p className="text-2xl font-semibold">{formatEuro(totalRevenue)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Afrekeningen</p><p className="text-2xl font-semibold">{settlements?.length || 0}</p></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Maand</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">kWh</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Omzet</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Uitbetaling</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(settlements || []).map((s: any) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="p-3">{new Date(s.month).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}</td>
                      <td className="p-3 text-right">{formatNumber(Number(s.total_kwh || 0))}</td>
                      <td className="p-3 text-right">{formatEuro(Number(s.gross_revenue || 0))}</td>
                      <td className="p-3 text-right">{formatEuro(Number(s.client_payout || 0))}</td>
                      <td className="p-3"><StatusBadge status={s.status || "calculated"} /></td>
                    </tr>
                  ))}
                  {(!settlements || settlements.length === 0) && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Geen afrekeningen</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Documenten */}
        <TabsContent value="documenten">
          <Card>
            <CardContent className="py-12 text-center">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Documentbeheer wordt binnenkort beschikbaar</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Activiteit */}
        <TabsContent value="activiteit">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Actie</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Beschrijving</th>
                  </tr>
                </thead>
                <tbody>
                  {(activity || []).map((a: any) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 font-medium">{a.action}</td>
                      <td className="p-3 text-muted-foreground">{a.description}</td>
                    </tr>
                  ))}
                  {(!activity || activity.length === 0) && (
                    <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Geen activiteit</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
