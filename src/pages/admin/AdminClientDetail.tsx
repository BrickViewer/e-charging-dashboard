import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientById, useClientSettlements, useClientActivity, useClientSessions } from "@/hooks/useAdminData";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { formatEuro, formatNumber } from "@/services/calculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ChevronDown, MapPin, Zap, FileText, Activity, Building2, Upload, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: client, isLoading } = useClientById(id);
  const { data: settlements } = useClientSettlements(id);
  const { data: activity } = useClientActivity(id);
  const { data: sessions } = useClientSessions(id);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});

  const startEditing = () => {
    if (!client) return;
    setEditData({
      company_name: client.company_name || "",
      kvk: client.kvk || "",
      contact_name: client.contact_name || "",
      contact_email: client.contact_email || "",
      contact_phone: client.contact_phone || "",
      billing_address_street: client.billing_address_street || "",
      billing_address_postal: client.billing_address_postal || "",
      billing_address_city: client.billing_address_city || "",
      contract_start_date: client.contract_start_date || "",
      contract_duration_months: client.contract_duration_months ?? 36,
      revenue_share_percentage: client.revenue_share_percentage ?? 50,
      charge_rate_per_kwh: client.charge_rate_per_kwh ?? 0.45,
      energy_cost_per_kwh: client.energy_cost_per_kwh ?? 0.25,
      ere_rate_per_kwh: client.ere_rate_per_kwh ?? 0.10,
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!id || !client) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("clients").update({
        company_name: editData.company_name,
        kvk: editData.kvk || null,
        contact_name: editData.contact_name,
        contact_email: editData.contact_email,
        contact_phone: editData.contact_phone || null,
        billing_address_street: editData.billing_address_street || null,
        billing_address_postal: editData.billing_address_postal || null,
        billing_address_city: editData.billing_address_city || null,
        contract_start_date: editData.contract_start_date || null,
        contract_duration_months: Number(editData.contract_duration_months) || 36,
        revenue_share_percentage: Number(editData.revenue_share_percentage) || 50,
        charge_rate_per_kwh: Number(editData.charge_rate_per_kwh) || 0.45,
        energy_cost_per_kwh: Number(editData.energy_cost_per_kwh) || 0.25,
        ere_rate_per_kwh: Number(editData.ere_rate_per_kwh) || 0.10,
      }).eq("id", id);
      if (error) throw error;

      // Log activity
      await supabase.from("activity_log").insert({
        client_id: id,
        organization_id: (client as any).organization_id,
        user_id: user?.id,
        action: "client_updated",
        description: "Klantgegevens gewijzigd",
      });

      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success("Klantgegevens opgeslagen");
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

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

  const ed = editData;
  const setEd = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }));

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
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="w-4 h-4 mr-1" />Bewerken
          </Button>
        )}
        {isEditing && (
          <>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />{saving ? "Opslaan..." : "Opslaan"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4 mr-1" />Annuleren
            </Button>
          </>
        )}
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
              <CardContent className="text-sm space-y-2">
                {isEditing ? (
                  <div className="space-y-3">
                    <div><Label>Bedrijfsnaam</Label><Input value={ed.company_name} onChange={e => setEd("company_name", e.target.value)} /></div>
                    <div><Label>KVK</Label><Input value={ed.kvk} onChange={e => setEd("kvk", e.target.value)} /></div>
                    <div><Label>Contactpersoon</Label><Input value={ed.contact_name} onChange={e => setEd("contact_name", e.target.value)} /></div>
                    <div><Label>E-mail</Label><Input value={ed.contact_email} onChange={e => setEd("contact_email", e.target.value)} /></div>
                    <div><Label>Telefoon</Label><Input value={ed.contact_phone} onChange={e => setEd("contact_phone", e.target.value)} /></div>
                    <div><Label>Straat + nr</Label><Input value={ed.billing_address_street} onChange={e => setEd("billing_address_street", e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Postcode</Label><Input value={ed.billing_address_postal} onChange={e => setEd("billing_address_postal", e.target.value)} /></div>
                      <div><Label>Stad</Label><Input value={ed.billing_address_city} onChange={e => setEd("billing_address_city", e.target.value)} /></div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p><span className="text-muted-foreground">Contact:</span> {client.contact_name}</p>
                    <p><span className="text-muted-foreground">E-mail:</span> {client.contact_email}</p>
                    <p><span className="text-muted-foreground">Telefoon:</span> {client.contact_phone || "—"}</p>
                    <p><span className="text-muted-foreground">KVK:</span> {client.kvk || "—"}</p>
                    <p><span className="text-muted-foreground">Adres:</span> {[client.billing_address_street, client.billing_address_postal, client.billing_address_city].filter(Boolean).join(", ") || "—"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {isEditing ? (
                  <div className="space-y-3">
                    <div><Label>Startdatum</Label><Input type="date" value={ed.contract_start_date} onChange={e => setEd("contract_start_date", e.target.value)} /></div>
                    <div><Label>Looptijd (maanden)</Label><Input type="number" value={ed.contract_duration_months} onChange={e => setEd("contract_duration_months", e.target.value)} /></div>
                    <div><Label>Revenue share (%)</Label><Input type="number" value={ed.revenue_share_percentage} onChange={e => setEd("revenue_share_percentage", e.target.value)} /></div>
                    <div><Label>Laadtarief (€/kWh)</Label><Input type="number" step="0.01" value={ed.charge_rate_per_kwh} onChange={e => setEd("charge_rate_per_kwh", e.target.value)} /></div>
                    <div><Label>Energiekost (€/kWh)</Label><Input type="number" step="0.01" value={ed.energy_cost_per_kwh} onChange={e => setEd("energy_cost_per_kwh", e.target.value)} /></div>
                    <div><Label>ERE-tarief (€/kWh)</Label><Input type="number" step="0.01" value={ed.ere_rate_per_kwh} onChange={e => setEd("ere_rate_per_kwh", e.target.value)} /></div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p><span className="text-muted-foreground">Startdatum:</span> {client.contract_start_date || "—"}</p>
                    <p><span className="text-muted-foreground">Looptijd:</span> {client.contract_duration_months} maanden</p>
                    <p><span className="text-muted-foreground">Revenue share:</span> {client.revenue_share_percentage}%</p>
                    <p><span className="text-muted-foreground">Laadtarief:</span> €{Number(client.charge_rate_per_kwh).toFixed(2)}/kWh</p>
                    <p><span className="text-muted-foreground">Energiekost:</span> €{Number(client.energy_cost_per_kwh).toFixed(2)}/kWh</p>
                    <p><span className="text-muted-foreground">ERE-tarief:</span> €{Number(client.ere_rate_per_kwh).toFixed(2)}/kWh</p>
                    <p><span className="text-muted-foreground">Stripe:</span> {client.stripe_onboarding_status || "pending"}</p>
                  </div>
                )}
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
