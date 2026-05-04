import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganization } from "@/hooks/useAdminData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Building2, Settings2, Users, KeyRound, UserPlus, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ConnectionTestResult {
  status: "ok" | "not_configured" | "road_error" | "error";
  message: string;
  credentials?: { id: string; type: string; providerId: string; accountId?: string; permissionsCount: number };
  statusCode?: number;
}

export default function AdminSettings() {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useOrganization();
  const queryClient = useQueryClient();

  // Company tab state
  const [company, setCompany] = useState({ name: "", kvk: "", address: "", phone: "", email: "", logo_url: "" });
  const [savingCompany, setSavingCompany] = useState(false);

  // Defaults tab state
  const [defaults, setDefaults] = useState({
    default_charge_rate_per_kwh: "", default_energy_cost_per_kwh: "",
    default_revenue_share_pct: "", default_ere_rate_per_kwh: "",
    default_eflux_cost_ac: "", default_eflux_cost_dc: "",
  });
  const [savingDefaults, setSavingDefaults] = useState(false);

  // API tab state
  const [apiKeys, setApiKeys] = useState({ eflux_api_key: "", eflux_provider_id: "", stripe_secret_key: "", stripe_publishable_key: "" });
  const [savingApi, setSavingApi] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // Users tab
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Load org data into form state
  useEffect(() => {
    if (!org) return;
    setCompany({
      name: org.name || "", kvk: org.kvk || "", address: org.address || "",
      phone: org.phone || "", email: org.email || "", logo_url: org.logo_url || "",
    });
    setDefaults({
      default_charge_rate_per_kwh: String(org.default_charge_rate_per_kwh ?? "0.45"),
      default_energy_cost_per_kwh: String(org.default_energy_cost_per_kwh ?? "0.25"),
      default_revenue_share_pct: String(org.default_revenue_share_pct ?? "50"),
      default_ere_rate_per_kwh: String(org.default_ere_rate_per_kwh ?? "0.10"),
      default_eflux_cost_ac: String(org.default_eflux_cost_ac ?? "5.50"),
      default_eflux_cost_dc: String(org.default_eflux_cost_dc ?? "10.40"),
    });
    setApiKeys({
      eflux_api_key: org.eflux_api_key ? "••••••••" : "",
      eflux_provider_id: org.eflux_provider_id || "",
      stripe_secret_key: org.stripe_secret_key ? "••••••••" : "",
      stripe_publishable_key: org.stripe_publishable_key ? "••••••••" : "",
    });
  }, [org]);

  const handleSaveCompany = async () => {
    if (!org) return;
    setSavingCompany(true);
    try {
      const { error } = await supabase.from("organizations").update({
        name: company.name, kvk: company.kvk || null, address: company.address || null,
        phone: company.phone || null, email: company.email || null, logo_url: company.logo_url || null,
      }).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("Bedrijfsgegevens opgeslagen");
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleSaveDefaults = async () => {
    if (!org) return;
    setSavingDefaults(true);
    try {
      const { error } = await supabase.from("organizations").update({
        default_charge_rate_per_kwh: parseFloat(defaults.default_charge_rate_per_kwh) || 0.45,
        default_energy_cost_per_kwh: parseFloat(defaults.default_energy_cost_per_kwh) || 0.25,
        default_revenue_share_pct: parseFloat(defaults.default_revenue_share_pct) || 50,
        default_ere_rate_per_kwh: parseFloat(defaults.default_ere_rate_per_kwh) || 0.10,
        default_eflux_cost_ac: parseFloat(defaults.default_eflux_cost_ac) || 5.50,
        default_eflux_cost_dc: parseFloat(defaults.default_eflux_cost_dc) || 10.40,
      }).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("Standaardwaarden opgeslagen");
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleSaveApi = async () => {
    if (!org) return;
    setSavingApi(true);
    try {
      const updateData: Partial<{ eflux_api_key: string | null; eflux_provider_id: string | null; stripe_secret_key: string | null; stripe_publishable_key: string | null }> = {};
      if (apiKeys.eflux_api_key && apiKeys.eflux_api_key !== "••••••••") updateData.eflux_api_key = apiKeys.eflux_api_key;
      if (apiKeys.eflux_provider_id !== (org.eflux_provider_id || "")) updateData.eflux_provider_id = apiKeys.eflux_provider_id || null;
      if (apiKeys.stripe_secret_key && apiKeys.stripe_secret_key !== "••••••••") updateData.stripe_secret_key = apiKeys.stripe_secret_key;
      if (apiKeys.stripe_publishable_key && apiKeys.stripe_publishable_key !== "••••••••") updateData.stripe_publishable_key = apiKeys.stripe_publishable_key;
      if (Object.keys(updateData).length === 0) { toast.info("Geen wijzigingen"); setSavingApi(false); return; }
      const { error } = await supabase.from("organizations").update(updateData).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("API-sleutels opgeslagen");
      setTestResult(null);
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSavingApi(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<ConnectionTestResult>("eflux-test-connection");
      if (error) {
        setTestResult({ status: "error", message: error.message ?? "Fout bij aanroep" });
      } else if (data) {
        setTestResult(data);
      }
    } catch (err: any) {
      setTestResult({ status: "error", message: err.message ?? "Onbekende fout" });
    } finally {
      setTestingConnection(false);
    }
  };

  const getRoleForUser = (userId: string) => {
    const role = userRoles?.find(r => r.user_id === userId);
    return role?.role || "—";
  };

  if (orgLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Instellingen</h1>

      <Tabs defaultValue="bedrijf">
        <TabsList>
          <TabsTrigger value="bedrijf"><Building2 className="w-4 h-4 mr-1" />Bedrijf</TabsTrigger>
          <TabsTrigger value="standaardwaarden"><Settings2 className="w-4 h-4 mr-1" />Standaardwaarden</TabsTrigger>
          <TabsTrigger value="gebruikers"><Users className="w-4 h-4 mr-1" />Gebruikers</TabsTrigger>
          <TabsTrigger value="api"><KeyRound className="w-4 h-4 mr-1" />API</TabsTrigger>
        </TabsList>

        {/* Tab: Bedrijf */}
        <TabsContent value="bedrijf">
          <Card>
            <CardHeader><CardTitle className="text-base">Bedrijfsgegevens</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Bedrijfsnaam</Label><Input value={company.name} onChange={e => setCompany(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label>KVK-nummer</Label><Input value={company.kvk} onChange={e => setCompany(p => ({ ...p, kvk: e.target.value }))} /></div>
                <div><Label>Adres</Label><Input value={company.address} onChange={e => setCompany(p => ({ ...p, address: e.target.value }))} /></div>
                <div><Label>Telefoon</Label><Input value={company.phone} onChange={e => setCompany(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><Label>E-mail</Label><Input type="email" value={company.email} onChange={e => setCompany(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>Logo URL</Label><Input value={company.logo_url} onChange={e => setCompany(p => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." /></div>
              </div>
              <Button onClick={handleSaveCompany} disabled={savingCompany}>
                <Save className="w-4 h-4 mr-2" />{savingCompany ? "Opslaan..." : "Opslaan"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Standaardwaarden */}
        <TabsContent value="standaardwaarden">
          <Card>
            <CardHeader><CardTitle className="text-base">Standaard tarieven & kosten</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Deze waarden worden als standaard gebruikt in de calculator en bij het aanmaken van nieuwe klanten.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Laadtarief per kWh (€)</Label><Input type="number" step="0.01" value={defaults.default_charge_rate_per_kwh} onChange={e => setDefaults(p => ({ ...p, default_charge_rate_per_kwh: e.target.value }))} /></div>
                <div><Label>Stroominkoop per kWh (€)</Label><Input type="number" step="0.01" value={defaults.default_energy_cost_per_kwh} onChange={e => setDefaults(p => ({ ...p, default_energy_cost_per_kwh: e.target.value }))} /></div>
                <div><Label>Opbrengstdeling klant (%)</Label><Input type="number" step="1" value={defaults.default_revenue_share_pct} onChange={e => setDefaults(p => ({ ...p, default_revenue_share_pct: e.target.value }))} /></div>
                <div><Label>ERE-tarief per kWh (€)</Label><Input type="number" step="0.01" value={defaults.default_ere_rate_per_kwh} onChange={e => setDefaults(p => ({ ...p, default_ere_rate_per_kwh: e.target.value }))} /></div>
                <div><Label>e-Flux kosten AC (€/socket/maand)</Label><Input type="number" step="0.01" value={defaults.default_eflux_cost_ac} onChange={e => setDefaults(p => ({ ...p, default_eflux_cost_ac: e.target.value }))} /></div>
                <div><Label>e-Flux kosten DC (€/socket/maand)</Label><Input type="number" step="0.01" value={defaults.default_eflux_cost_dc} onChange={e => setDefaults(p => ({ ...p, default_eflux_cost_dc: e.target.value }))} /></div>
              </div>
              <Button onClick={handleSaveDefaults} disabled={savingDefaults}>
                <Save className="w-4 h-4 mr-2" />{savingDefaults ? "Opslaan..." : "Opslaan"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Gebruikers */}
        <TabsContent value="gebruikers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Gebruikers</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled>
                    <UserPlus className="w-4 h-4 mr-2" />Gebruiker uitnodigen
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Binnenkort beschikbaar</TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Naam</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">User ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {profilesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-48" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                      </tr>
                    ))
                  ) : (profiles || []).length === 0 ? (
                    <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Geen gebruikers gevonden</td></tr>
                  ) : (
                    (profiles || []).map((p: any) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium">{p.full_name || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs font-mono">{p.user_id?.slice(0, 8)}...</td>
                        <td className="p-3">
                          <Badge variant={getRoleForUser(p.user_id) === "admin" ? "default" : "secondary"} className="capitalize">
                            {getRoleForUser(p.user_id)}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: API */}
        <TabsContent value="api">
          <Card>
            <CardHeader><CardTitle className="text-base">API-koppelingen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Voer hier de API-sleutels in voor externe koppelingen. Sleutels worden versleuteld opgeslagen.</p>
              <div className="space-y-4 max-w-lg">
                <div>
                  <Label>Road.io (e-Flux) API Key</Label>
                  <Input type="password" value={apiKeys.eflux_api_key} onChange={e => setApiKeys(p => ({ ...p, eflux_api_key: e.target.value }))} placeholder="Vul in na Enterprise activatie" />
                </div>
                <div>
                  <Label>Road Provider ID / slug</Label>
                  <Input value={apiKeys.eflux_provider_id} onChange={e => setApiKeys(p => ({ ...p, eflux_provider_id: e.target.value }))} placeholder="bijv. NLEFL" />
                  <p className="text-xs text-muted-foreground mt-1">Provider-header voor elke API-call (slug of ObjectId).</p>
                </div>
                <div>
                  <Label>Stripe Secret Key</Label>
                  <Input type="password" value={apiKeys.stripe_secret_key} onChange={e => setApiKeys(p => ({ ...p, stripe_secret_key: e.target.value }))} placeholder="sk_live_..." />
                </div>
                <div>
                  <Label>Stripe Publishable Key</Label>
                  <Input type="password" value={apiKeys.stripe_publishable_key} onChange={e => setApiKeys(p => ({ ...p, stripe_publishable_key: e.target.value }))} placeholder="pk_live_..." />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveApi} disabled={savingApi}>
                  <Save className="w-4 h-4 mr-2" />{savingApi ? "Opslaan..." : "Opslaan"}
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                  {testingConnection
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testen...</>
                    : <>Test e-Flux verbinding</>}
                </Button>
              </div>
              {testResult && (
                <div className={`mt-4 p-3 rounded-md border text-sm flex items-start gap-2 ${
                  testResult.status === "ok" ? "border-primary/30 bg-primary/5 text-foreground" :
                  testResult.status === "not_configured" ? "border-warning/30 bg-warning/5 text-foreground" :
                  "border-destructive/30 bg-destructive/5 text-foreground"
                }`}>
                  {testResult.status === "ok"
                    ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    : <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${testResult.status === "not_configured" ? "text-warning" : "text-destructive"}`} />}
                  <div className="space-y-1">
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.credentials && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Credential type: <code className="font-mono">{testResult.credentials.type}</code></p>
                        <p>Provider: <code className="font-mono">{testResult.credentials.providerId}</code></p>
                        {testResult.credentials.accountId && <p>Account: <code className="font-mono">{testResult.credentials.accountId}</code></p>}
                        <p>Permissions: {testResult.credentials.permissionsCount}</p>
                      </div>
                    )}
                    {testResult.statusCode && (
                      <p className="text-xs text-muted-foreground">HTTP {testResult.statusCode}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
