import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { Switch } from "@/components/ui/switch";
import { useOrganization, useLatestEfluxSync, useCronStatus, useRecentInvitations } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Save, Building2, Settings2, Users, KeyRound, UserPlus,
  CheckCircle2, AlertCircle, Loader2, Plug, Landmark, Mail,
  Clock, RefreshCw, Activity, ChevronRight, Hourglass, Trash2, ShieldCheck,
  Sun, Moon, SunMoon, AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import type { CronJobStatus, EfluxSyncLog, Profile } from "@/types/db";

interface ConnectionTestResult {
  status: "ok" | "not_configured" | "road_error" | "error";
  message: string;
  credential?: { name: string | null; type: string | null; disabled: boolean };
  provider?: { id: string | null; name: string | null; slug: string | null; customDomain: string | null };
  grantedPermissions?: string[];
  grantedCount?: number;
  counts?: Record<string, { count: number | null; error?: string }>;
  statusCode?: number;
}

export default function AdminSettings() {
  const { data: org, isLoading: orgLoading } = useOrganization();
  const { data: syncLogs } = useLatestEfluxSync();
  const { data: cronJobs, isLoading: cronLoading } = useCronStatus();
  const { data: recentInvites } = useRecentInvitations(1);
  const queryClient = useQueryClient();
  const { user, isSuperadmin } = useAuth();
  const { isLight, setTheme } = useAdminTheme();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  const [company, setCompany] = useState({
    name: "", kvk: "", address: "", phone: "", email: "", logo_url: "", dashboard_url: "",
    btw_number: "", iban: "", bic: "",
    address_street: "", address_postal: "", address_city: "", country: "Nederland",
  });
  const [savingCompany, setSavingCompany] = useState(false);

  const [defaults, setDefaults] = useState({
    default_echarging_fee_per_kwh: "",
  });
  const [savingDefaults, setSavingDefaults] = useState(false);

  const [storingen, setStoringen] = useState({
    fault_notification_email: "info@e-charging.nl",
    fault_detection_enabled: true,
    fault_heartbeat_grace_minutes: "60",
  });
  const [savingStoringen, setSavingStoringen] = useState(false);

  const [apiKeys, setApiKeys] = useState({
    eflux_provider_id: "", eflux_master_account_id: "",
  });
  const [savingApi, setSavingApi] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

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

  // Alleen échte interne gebruikers tonen: profielen mét een interne rol.
  // De profielentabel bevat ook portal-klanten en ex-admins zonder rol — die horen
  // hier niet thuis (en mogen niet als 'teamlid' verschijnen).
  const internalProfiles = ((profiles ?? []) as Profile[]).filter(
    (p) => (userRoles ?? []).some((r) => r.user_id === p.user_id),
  );

  useEffect(() => {
    if (!org) return;
    setCompany({
      name: org.name || "", kvk: org.kvk || "", address: org.address || "",
      phone: org.phone || "", email: org.email || "", logo_url: org.logo_url || "",
      dashboard_url: org.dashboard_url || "http://localhost:8080",
      btw_number: org.btw_number || "", iban: org.iban || "", bic: org.bic || "",
      address_street: org.address_street || "", address_postal: org.address_postal || "",
      address_city: org.address_city || "", country: org.country || "Nederland",
    });
    setDefaults({
      default_echarging_fee_per_kwh: String(org.default_echarging_fee_per_kwh ?? "0.10"),
    });
    setStoringen({
      fault_notification_email: org.fault_notification_email || "info@e-charging.nl",
      fault_detection_enabled: org.fault_detection_enabled ?? true,
      fault_heartbeat_grace_minutes: String(org.fault_heartbeat_grace_minutes ?? 60),
    });
    setApiKeys({
      eflux_provider_id: org.eflux_provider_id || "",
      eflux_master_account_id: org.eflux_master_account_id || "",
    });
  }, [org]);

  const handleSaveCompany = async () => {
    if (!org) return;
    setSavingCompany(true);
    try {
      // Legacy enkelvoudig adres meeschrijven (samengesteld) zolang oudere
      // consumenten dat veld nog lezen; de factuur gebruikt de gesplitste velden.
      const composedAddress = [
        company.address_street,
        [company.address_postal, company.address_city].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      const { error } = await supabase.from("organizations").update({
        name: company.name, kvk: company.kvk || null,
        address: composedAddress || company.address || null,
        address_street: company.address_street || null,
        address_postal: company.address_postal || null,
        address_city: company.address_city || null,
        country: company.country || "Nederland",
        phone: company.phone || null, email: company.email || null, logo_url: company.logo_url || null,
        dashboard_url: company.dashboard_url || null,
        btw_number: company.btw_number || null, iban: company.iban || null, bic: company.bic || null,
      }).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("Bedrijfsgegevens opgeslagen");
    } catch (err) {
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
        default_echarging_fee_per_kwh: parseFloat(defaults.default_echarging_fee_per_kwh) || 0.10,
      }).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("Standaardwaarden opgeslagen");
    } catch (err) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleSaveStoringen = async () => {
    if (!org) return;
    setSavingStoringen(true);
    try {
      const grace = parseInt(storingen.fault_heartbeat_grace_minutes, 10);
      const { error } = await supabase.from("organizations").update({
        fault_notification_email: storingen.fault_notification_email.trim() || "info@e-charging.nl",
        fault_detection_enabled: storingen.fault_detection_enabled,
        fault_heartbeat_grace_minutes: Number.isFinite(grace) && grace > 0 ? grace : 60,
      }).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("Storingsinstellingen opgeslagen");
    } catch (err) {
      toast.error((err as Error).message || "Fout bij opslaan");
    } finally {
      setSavingStoringen(false);
    }
  };

  const handleSaveApi = async () => {
    if (!org) return;
    setSavingApi(true);
    try {
      const updateData: Partial<{
        eflux_provider_id: string | null;
        eflux_master_account_id: string | null;
      }> = {};
      if (apiKeys.eflux_provider_id !== (org.eflux_provider_id || ""))
        updateData.eflux_provider_id = apiKeys.eflux_provider_id || null;
      if (apiKeys.eflux_master_account_id !== (org.eflux_master_account_id || ""))
        updateData.eflux_master_account_id = apiKeys.eflux_master_account_id || null;
      if (Object.keys(updateData).length === 0) {
        toast.info("Geen wijzigingen");
        setSavingApi(false);
        return;
      }
      const { error } = await supabase.from("organizations").update(updateData).eq("id", org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-organization"] });
      toast.success("API-sleutels opgeslagen");
      setTestResult(null);
    } catch (err) {
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
    } catch (err) {
      setTestResult({ status: "error", message: err.message ?? "Onbekende fout" });
    } finally {
      setTestingConnection(false);
    }
  };

  const getRoleForUser = (userId: string) => {
    const roles = (userRoles ?? []).filter(r => r.user_id === userId).map(r => r.role);
    if (roles.includes("superadmin")) return "superadmin"; // superadmin wint van admin
    return roles[0] || "—";
  };
  const isSuperadminUser = (userId: string) =>
    (userRoles ?? []).some(r => r.user_id === userId && r.role === "superadmin");
  // Alleen de superadmin mag verwijderen; nooit zichzelf en nooit een (andere) superadmin.
  const canDeleteUser = (userId: string) =>
    isSuperadmin && userId !== user?.id && !isSuperadminUser(userId);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: { email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole },
      });
      if (error) throw error;
      const res = data as { status?: string; message?: string; to?: string };
      if (res?.status === "error") throw new Error(res.message || "Uitnodigen mislukt");
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-recent-invitations"] });
      setInviteOpen(false);
      setInviteEmail(""); setInviteName(""); setInviteRole("admin");
      if (res?.status === "sent_no_email") toast.warning(res.message || "Teamlid aangemaakt; deel de activatielink handmatig.");
      else toast.success(`Uitnodiging verstuurd naar ${res?.to ?? inviteEmail}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Uitnodigen mislukt"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-team-member", {
        body: { user_id: userId },
      });
      if (error) {
        // Bij een non-2xx geeft supabase-js een generieke fout; lees de echte
        // boodschap uit de response-body van de edge function.
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.message) msg = body.message;
        } catch { /* body niet leesbaar — val terug op generieke melding */ }
        throw new Error(msg);
      }
      const res = data as { status?: string; message?: string };
      if (res?.status !== "deleted") throw new Error(res?.message || "Verwijderen mislukt");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setDeleteTarget(null);
      toast.success("Teamlid verwijderd");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Verwijderen mislukt"),
  });

  // Integrations status — de API-key staat server-side (Supabase secret). De echte
  // signalen dat e-Flux werkt: provider_id gezet ÉN een recente succesvolle sync.
  // Een handmatige "Test verbinding" is optioneel, geen voorwaarde.
  const lastEfluxSync = syncLogs?.find((l: EfluxSyncLog) => l.status === "success" && l.entity_type === "cpo_sessions");
  const efluxConfigured = !!org?.eflux_provider_id && (!!lastEfluxSync || testResult?.status === "ok");
  const lastInvite = recentInvites?.[0];

  const efluxLastFailed = syncLogs?.[0]?.status === "error";

  if (orgLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Instellingen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bedrijfsgegevens, standaardtarieven, API-koppelingen en cron-status
        </p>
      </div>

      {/* Integraties hero strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IntegrationCard
          label="e-Flux / Road"
          icon={<Plug className="w-4 h-4" />}
          status={
            !efluxConfigured ? "not_configured"
            : efluxLastFailed ? "error"
            : "ok"
          }
          summary={
            !efluxConfigured ? "API-key niet ingesteld"
            : efluxLastFailed ? "Laatste sync faalde"
            : "Verbonden"
          }
          detail={
            lastEfluxSync
              ? `Laatste sync ${formatDistanceToNow(new Date(lastEfluxSync.last_synced_at), { addSuffix: true, locale: nl })}`
              : "Nog geen succesvolle sync"
          }
        />
        <IntegrationCard
          label="Bankgegevens"
          icon={<Landmark className="w-4 h-4" />}
          status="ok"
          summary="Via klantportaal"
          detail="Klanten vullen factuur- en IBAN-gegevens zelf in"
        />
        <IntegrationCard
          label="Resend e-mail"
          icon={<Mail className="w-4 h-4" />}
          status={lastInvite ? "ok" : "warning"}
          summary={lastInvite ? "Operationeel" : "Geen recente activiteit"}
          detail={
            lastInvite
              ? `Laatste invite ${formatDistanceToNow(new Date(lastInvite.created_at), { addSuffix: true, locale: nl })}`
              : "Stuur een invite om te testen"
          }
        />
        <IntegrationCard
          label="Cron-jobs"
          icon={<Clock className="w-4 h-4" />}
          status={
            !cronJobs?.length ? "not_configured"
            : cronJobs.some((j: CronJobStatus) => j.last_status === "failed") ? "error"
            : "ok"
          }
          summary={
            cronJobs?.length
              ? `${cronJobs.filter((j: CronJobStatus) => j.active).length}/${cronJobs.length} actief`
              : "Geen jobs"
          }
          detail={
            cronJobs?.[0]?.last_run
              ? `Laatste run ${formatDistanceToNow(new Date(cronJobs[0].last_run), { addSuffix: true, locale: nl })}`
              : "Nog geen runs"
          }
        />
      </div>

      <Tabs defaultValue="bedrijf">
        <TabsList>
          <TabsTrigger value="bedrijf"><Building2 className="w-4 h-4 mr-1" />Bedrijf</TabsTrigger>
          <TabsTrigger value="standaardwaarden"><Settings2 className="w-4 h-4 mr-1" />Standaardwaarden</TabsTrigger>
          <TabsTrigger value="storingen"><AlertTriangle className="w-4 h-4 mr-1" />Storingen</TabsTrigger>
          <TabsTrigger value="gebruikers"><Users className="w-4 h-4 mr-1" />Gebruikers</TabsTrigger>
          <TabsTrigger value="api"><KeyRound className="w-4 h-4 mr-1" />API</TabsTrigger>
          <TabsTrigger value="automatisering"><Activity className="w-4 h-4 mr-1" />Automatisering</TabsTrigger>
          <TabsTrigger value="voorkeuren"><SunMoon className="w-4 h-4 mr-1" />Voorkeuren</TabsTrigger>
        </TabsList>

        {/* Tab: Bedrijf */}
        <TabsContent value="bedrijf">
          <Card className="portal-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Bedrijfsgegevens</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  E-Group BV — gegevens die verschijnen in offertes, mails en het klantportaal
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Bedrijfsnaam</Label><Input value={company.name} onChange={e => setCompany(p => ({ ...p, name: e.target.value }))} /></div>
                <div>
                  <Label>KVK-nummer</Label>
                  <Input value={company.kvk} onChange={e => setCompany(p => ({ ...p, kvk: e.target.value }))} />
                  {(company.kvk === "12345678" || !company.kvk.trim()) && (
                    <p className="text-[11px] text-[hsl(var(--status-amber))] mt-1.5">
                      Placeholder/ontbrekend KVK-nummer — vul het echte nummer in; goedkeuren van afrekeningen is anders geblokkeerd.
                    </p>
                  )}
                </div>
                <div><Label>Straat + huisnummer</Label><Input value={company.address_street} onChange={e => setCompany(p => ({ ...p, address_street: e.target.value }))} placeholder="Stationsplein 1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Postcode</Label><Input value={company.address_postal} onChange={e => setCompany(p => ({ ...p, address_postal: e.target.value }))} placeholder="5611 AB" /></div>
                  <div><Label>Plaats</Label><Input value={company.address_city} onChange={e => setCompany(p => ({ ...p, address_city: e.target.value }))} placeholder="Eindhoven" /></div>
                </div>
                <div><Label>Land</Label><Input value={company.country} onChange={e => setCompany(p => ({ ...p, country: e.target.value }))} /></div>
                <div><Label>Telefoon</Label><Input value={company.phone} onChange={e => setCompany(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><Label>E-mail</Label><Input type="email" value={company.email} onChange={e => setCompany(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>Logo URL</Label><Input value={company.logo_url} onChange={e => setCompany(p => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." /></div>
              </div>
              <div className="pt-4 border-t border-border space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Factuurgegevens (self-billing)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verschijnen in het "Naar"-blok van de vergoedingsfacturen die jij namens de klant uitreikt
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><Label>BTW-nummer</Label><Input value={company.btw_number} onChange={e => setCompany(p => ({ ...p, btw_number: e.target.value }))} placeholder="NL857756618B01" /></div>
                  <div><Label>IBAN</Label><Input value={company.iban} onChange={e => setCompany(p => ({ ...p, iban: e.target.value }))} placeholder="NL00BANK0123456789" /></div>
                  <div><Label>BIC</Label><Input value={company.bic} onChange={e => setCompany(p => ({ ...p, bic: e.target.value }))} placeholder="INGBNL2A" /></div>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <Label>
                  Dashboard-URL <span className="text-xs text-muted-foreground font-normal">(voor invitatie-links in mails)</span>
                </Label>
                <Input
                  value={company.dashboard_url}
                  onChange={e => setCompany(p => ({ ...p, dashboard_url: e.target.value }))}
                  placeholder="https://app.e-charging.nl"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Bepaalt waar invitatie-links naartoe wijzen. In dev:{" "}
                  <code className="text-xs px-1 py-0.5 rounded bg-muted">http://localhost:8080</code>. In productie: jouw publieke domein.
                </p>
              </div>
              <Button onClick={handleSaveCompany} disabled={savingCompany}>
                <Save className="w-4 h-4 mr-2" />{savingCompany ? "Opslaan…" : "Opslaan"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Standaardwaarden */}
        <TabsContent value="standaardwaarden">
          <Card className="portal-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Service-fee</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  De standaard E-Charging-fee per kWh, gebruikt bij het berekenen van de maandafrekeningen
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>E-Charging fee per kWh (€)</Label>
                  <Input type="number" step="0.01" value={defaults.default_echarging_fee_per_kwh} onChange={e => setDefaults(p => ({ ...p, default_echarging_fee_per_kwh: e.target.value }))} />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Standaard 0,10. Per klant te overschrijven op de klantpagina.</p>
                </div>
                <div className="text-xs text-muted-foreground self-center leading-relaxed rounded-md border border-border bg-muted/30 p-3">
                  <strong className="text-foreground">BTW</strong> is 21% en wordt per klant ingesteld (BTW-plichtig ja/nee) op de klantpagina. De ERE-laadbeloning is een indicatieve schatting in het klantportaal.
                </div>
              </div>
              <Button onClick={handleSaveDefaults} disabled={savingDefaults}>
                <Save className="w-4 h-4 mr-2" />{savingDefaults ? "Opslaan…" : "Opslaan"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Storingen */}
        <TabsContent value="storingen">
          <Card className="portal-card">
            <CardContent className="p-5 space-y-5">
              <div>
                <h2 className="text-base font-semibold">Storingsdetectie & notificaties</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We detecteren laadpaal-storingen automatisch bij elke e-Flux-sync en sturen een melding voordat de klant het merkt.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                <div>
                  <Label>Automatische storingsdetectie</Label>
                  <p className="text-[11px] text-muted-foreground mt-1">Open automatisch een storing wanneer een paal van online naar offline gaat.</p>
                </div>
                <Switch checked={storingen.fault_detection_enabled} onCheckedChange={(v) => setStoringen(p => ({ ...p, fault_detection_enabled: v }))} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Notificatie e-mail</Label>
                  <Input type="email" value={storingen.fault_notification_email} onChange={e => setStoringen(p => ({ ...p, fault_notification_email: e.target.value }))} placeholder="info@e-charging.nl" />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Naar dit adres gaat bij een storing een branded mail met directe link naar de storing.</p>
                </div>
                <div>
                  <Label>Drempel "verdacht" (minuten zonder hartslag)</Label>
                  <Input type="number" min="5" value={storingen.fault_heartbeat_grace_minutes} onChange={e => setStoringen(p => ({ ...p, fault_heartbeat_grace_minutes: e.target.value }))} />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Palen die langer dan dit geen hartslag stuurden worden als "verdacht" gemarkeerd (geen mail).</p>
                </div>
              </div>
              <Button onClick={handleSaveStoringen} disabled={savingStoringen}>
                <Save className="w-4 h-4 mr-2" />{savingStoringen ? "Opslaan…" : "Opslaan"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Gebruikers */}
        <TabsContent value="gebruikers">
          <Card className="portal-card">
            <CardContent className="p-0">
              <div className="flex flex-row items-center justify-between p-5 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold">Interne gebruikers</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isSuperadmin
                      ? "Jij (superadmin) beheert het team. Nieuwe leden zijn admin; alleen jij kunt teamleden verwijderen."
                      : "Admins en medewerkers met toegang tot dit beheer-portaal"}
                  </p>
                </div>
                {isSuperadmin && (
                  <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />Gebruiker uitnodigen
                  </Button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 cockpit-section-label">Naam</th>
                    <th className="text-left p-3 cockpit-section-label">User ID</th>
                    <th className="text-left p-3 cockpit-section-label">Rol</th>
                    {isSuperadmin && <th className="text-right p-3 cockpit-section-label">Actie</th>}
                  </tr>
                </thead>
                <tbody>
                  {profilesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-48" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                        {isSuperadmin && <td className="p-3"><Skeleton className="h-4 w-8 ml-auto" /></td>}
                      </tr>
                    ))
                  ) : internalProfiles.length === 0 ? (
                    <tr><td colSpan={isSuperadmin ? 4 : 3} className="p-8 text-center text-muted-foreground">Geen gebruikers gevonden</td></tr>
                  ) : (
                    internalProfiles.map((p) => {
                      const userIsSuperadmin = isSuperadminUser(p.user_id);
                      return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                        <td className="p-3 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {p.full_name || "—"}
                            {userIsSuperadmin && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs font-mono">{p.user_id?.slice(0, 8)}…</td>
                        <td className="p-3">
                          <Badge
                            variant={userIsSuperadmin || getRoleForUser(p.user_id) === "admin" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {getRoleForUser(p.user_id)}
                          </Badge>
                        </td>
                        {isSuperadmin && (
                          <td className="p-3 text-right">
                            {canDeleteUser(p.user_id) ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(p)}
                                aria-label="Teamlid verwijderen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {p.user_id === user?.id ? "jij" : userIsSuperadmin ? "beschermd" : ""}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Teamlid uitnodigen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="invite-email">E-mailadres</Label>
                  <Input id="invite-email" type="email" placeholder="naam@bedrijf.nl" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="invite-name">Naam (optioneel)</Label>
                  <Input id="invite-name" value={inviteName} onChange={e => setInviteName(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label>Rol</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — volledige toegang</SelectItem>
                      <SelectItem value="manager">Manager — beheer &amp; financieel</SelectItem>
                      <SelectItem value="sales">Sales — alleen het Sales-werkblad</SelectItem>
                      <SelectItem value="marketing">Marketing — alleen het Marketing-werkblad</SelectItem>
                      <SelectItem value="viewer">Viewer — alleen lezen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Het teamlid krijgt een e-mail om een wachtwoord in te stellen en kan daarna inloggen op het beheer-portaal.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteMutation.isPending}>Annuleren</Button>
                <Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending || !inviteEmail.includes("@")}>
                  {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Uitnodiging versturen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Teamlid verwijderen</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <p>
                  Weet je zeker dat je{" "}
                  <strong>{deleteTarget?.full_name || "deze gebruiker"}</strong> wilt verwijderen?
                </p>
                <p className="text-muted-foreground text-xs">
                  Het account en alle toegang tot het beheer-portaal worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Annuleren</Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.user_id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verwijderen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab: API */}
        <TabsContent value="api">
          <Card className="portal-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">API-koppelingen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Provider en account ID staan in deze tabel, secrets in Supabase Edge Function secrets
                </p>
              </div>
              <div className="space-y-4 max-w-lg">
                <div className="p-3 rounded-md border border-border bg-muted/40 space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Road.io (e-Flux) API Key</Label>
                  <p className="text-sm">Beheerd via Supabase Edge Function secret <code className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">EFLUX_API_KEY</code></p>
                  <p className="text-xs text-muted-foreground">Wijzig via Supabase Dashboard → Project Settings → Edge Functions → Secrets. Klik op "Test verbinding" hieronder om te verifiëren dat de secret werkt.</p>
                </div>
                <div>
                  <Label>Road Provider ID / slug</Label>
                  <Input value={apiKeys.eflux_provider_id} onChange={e => setApiKeys(p => ({ ...p, eflux_provider_id: e.target.value }))} placeholder="bijv. NLEFL" />
                  <p className="text-xs text-muted-foreground mt-1">Provider-header voor elke API-call (slug of ObjectId).</p>
                </div>
                <div>
                  <Label>Master Account ID (optioneel)</Label>
                  <Input value={apiKeys.eflux_master_account_id} onChange={e => setApiKeys(p => ({ ...p, eflux_master_account_id: e.target.value }))} placeholder="Account ObjectId van e-Charging zelf" />
                  <p className="text-xs text-muted-foreground mt-1">Beperkt sync tot één account; leeg = alle accounts onder de Provider.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveApi} disabled={savingApi}>
                  <Save className="w-4 h-4 mr-2" />{savingApi ? "Opslaan…" : "Opslaan"}
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                  {testingConnection
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testen…</>
                    : <>Test e-Flux verbinding</>}
                </Button>
              </div>
              {testResult && (
                <div className={`mt-4 p-3 rounded-md border text-sm flex items-start gap-2 ${
                  testResult.status === "ok" ? "border-primary/30 bg-primary/5 text-foreground" :
                  testResult.status === "not_configured" ? "border-[hsl(var(--status-amber)/0.30)] bg-[hsl(var(--status-amber)/0.05)] text-foreground" :
                  "border-destructive/30 bg-destructive/5 text-foreground"
                }`}>
                  {testResult.status === "ok"
                    ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    : <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${testResult.status === "not_configured" ? "text-[hsl(var(--status-amber))]" : "text-destructive"}`} />}
                  <div className="space-y-1">
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.provider && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Provider: <code className="font-mono">{testResult.provider.name}</code> (slug: <code className="font-mono">{testResult.provider.slug}</code>)</p>
                        {testResult.provider.customDomain && <p>Custom domain: <code className="font-mono">{testResult.provider.customDomain}</code></p>}
                      </div>
                    )}
                    {testResult.credential && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>API-key naam: <code className="font-mono">{testResult.credential.name}</code> (type: {testResult.credential.type}{testResult.credential.disabled ? ", DISABLED" : ""})</p>
                      </div>
                    )}
                    {testResult.grantedPermissions && testResult.grantedPermissions.length > 0 && (
                      <details className="text-xs text-muted-foreground mt-1">
                        <summary className="cursor-pointer">Permissies ({testResult.grantedCount})</summary>
                        <ul className="mt-1 ml-4 list-disc font-mono text-[11px]">
                          {testResult.grantedPermissions.map(p => <li key={p}>{p}</li>)}
                        </ul>
                      </details>
                    )}
                    {testResult.counts && (
                      <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                        <p className="font-medium">Aantallen in jouw Road Provider:</p>
                        {Object.entries(testResult.counts).map(([k, v]) => (
                          <div key={k} className="font-mono text-[11px]">
                            <span>{k}: </span>
                            {v.error ? <span className="text-destructive">ERROR {v.error}</span> : <span>{v.count ?? "?"}</span>}
                          </div>
                        ))}
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

        {/* Tab: Automatisering / Cron */}
        <TabsContent value="automatisering">
          <Card className="portal-card">
            <CardContent className="p-0">
              <div className="p-5 border-b border-border">
                <h2 className="text-base font-semibold">Geplande taken</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  pg_cron jobs die periodiek edge functions aanroepen voor sync en aggregatie
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 cockpit-section-label">Taak</th>
                      <th className="text-left p-3 cockpit-section-label">Schedule</th>
                      <th className="text-left p-3 cockpit-section-label">Laatste run</th>
                      <th className="text-left p-3 cockpit-section-label">Status</th>
                      <th className="text-right p-3 cockpit-section-label">Duur</th>
                      <th className="text-left p-3 cockpit-section-label">Actief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronLoading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : !cronJobs?.length ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-muted-foreground">
                          <Hourglass className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                          <p className="font-medium text-foreground mb-1">Geen geplande taken</p>
                          <p className="text-sm">pg_cron jobs verschijnen hier zodra ze zijn ingericht</p>
                        </td>
                      </tr>
                    ) : (
                      cronJobs.map((job: CronJobStatus & { jobid?: number | string; last_duration_ms?: number | null }) => (
                        <tr key={job.jobid} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                          <td className="p-3">
                            <div className="font-medium">{job.jobname}</div>
                            <div className="text-[11px] text-muted-foreground">jobid {job.jobid}</div>
                          </td>
                          <td className="p-3">
                            <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{job.schedule}</code>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{describeSchedule(job.schedule)}</div>
                          </td>
                          <td className="p-3 text-xs">
                            {job.last_run ? (
                              <>
                                <div>{formatDistanceToNow(new Date(job.last_run), { addSuffix: true, locale: nl })}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {new Date(job.last_run).toLocaleString("nl-NL")}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <CronStatusBadge status={job.last_status} />
                          </td>
                          <td className="p-3 text-right tabular-nums text-xs">
                            {job.last_duration_ms != null
                              ? `${job.last_duration_ms} ms`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3">
                            {job.active ? (
                              <span className="badge-actief">Actief</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
                                Gepauzeerd
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
                <span>Cron draait in Supabase project — wijzig schedules via migrations</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-cron-status"] })}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Vernieuwen
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recente sync-activiteit */}
          <Card className="portal-card mt-4">
            <CardContent className="p-0">
              <div className="p-5 border-b border-border">
                <h2 className="text-base font-semibold">Recente sync-activiteit</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Laatste 10 e-Flux sync-runs (locaties, laadpunten, sessies)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 cockpit-section-label">Tijdstip</th>
                      <th className="text-left p-3 cockpit-section-label">Entiteit</th>
                      <th className="text-left p-3 cockpit-section-label">Status</th>
                      <th className="text-right p-3 cockpit-section-label">Records</th>
                      <th className="text-left p-3 cockpit-section-label">Bericht</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!syncLogs?.length ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                          Geen sync-runs gelogd
                        </td>
                      </tr>
                    ) : (
                      syncLogs.slice(0, 10).map((log: EfluxSyncLog) => (
                        <tr key={log.id} className="border-b border-border last:border-0">
                          <td className="p-3 text-xs">
                            {log.last_synced_at
                              ? formatDistanceToNow(new Date(log.last_synced_at), { addSuffix: true, locale: nl })
                              : "—"}
                          </td>
                          <td className="p-3 text-xs font-mono">{log.entity_type}</td>
                          <td className="p-3">
                            <CronStatusBadge status={log.status === "success" ? "succeeded" : log.status === "error" ? "failed" : log.status} />
                          </td>
                          <td className="p-3 text-right tabular-nums text-xs">
                            {log.records_synced ?? "—"}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground truncate max-w-md">
                            {log.error_message || "OK"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Voorkeuren */}
        <TabsContent value="voorkeuren">
          <Card className="portal-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Weergave</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Persoonlijke voorkeur — gekoppeld aan jouw account, dus op elk apparaat hetzelfde
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-4 max-w-lg">
                <div className="flex items-center gap-3">
                  {isLight
                    ? <Sun className="w-4 h-4 text-muted-foreground" />
                    : <Moon className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <Label htmlFor="admin-theme-switch">{isLight ? "Dagmodus" : "Nachtmodus"}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Wordt direct toegepast en bij je account opgeslagen
                    </p>
                  </div>
                </div>
                <Switch
                  id="admin-theme-switch"
                  checked={isLight}
                  onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
                  aria-label="Dagmodus aan/uit"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ──────────────────────────────────────────── helpers ─── */

function IntegrationCard({
  label,
  icon,
  status,
  summary,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  status: "ok" | "warning" | "error" | "not_configured";
  summary: string;
  detail?: string;
}) {
  const cfg = {
    ok: {
      bg: "bg-primary/10 border-primary/20 text-primary",
      dot: "bg-primary",
      label: "Operationeel",
      labelClass: "text-primary",
    },
    warning: {
      bg: "bg-[hsl(var(--status-amber)/var(--status-tile-alpha))] border-[hsl(var(--status-amber)/var(--status-tile-border-alpha))] text-[hsl(var(--status-amber))]",
      dot: "bg-[hsl(var(--status-amber))]",
      label: "Aandacht",
      labelClass: "text-[hsl(var(--status-amber))]",
    },
    error: {
      bg: "bg-[hsl(var(--status-red)/var(--status-tile-alpha))] border-[hsl(var(--status-red)/var(--status-tile-border-alpha))] text-[hsl(var(--status-red))]",
      dot: "bg-[hsl(var(--status-red))]",
      label: "Fout",
      labelClass: "text-[hsl(var(--status-red))]",
    },
    not_configured: {
      bg: "bg-muted/30 border-border text-muted-foreground",
      dot: "bg-muted-foreground/50",
      label: "Niet ingesteld",
      labelClass: "text-muted-foreground",
    },
  }[status];

  return (
    <Card className="portal-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="cockpit-section-label">{label}</p>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            </div>
            <p className={`text-sm font-semibold mt-1.5 leading-none ${cfg.labelClass}`}>
              {summary}
            </p>
            {detail && (
              <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{detail}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CronStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
        Geen run
      </span>
    );
  }
  if (status === "succeeded" || status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
        <CheckCircle2 className="w-3 h-3" />
        Geslaagd
      </span>
    );
  }
  if (status === "failed" || status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-red)/0.15)] text-[hsl(var(--status-red))] border border-[hsl(var(--status-red)/0.25)]">
        <AlertCircle className="w-3 h-3" />
        Gefaald
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-amber)/0.15)] text-[hsl(var(--status-amber))] border border-[hsl(var(--status-amber)/0.25)]">
      {status}
    </span>
  );
}

// Vertaal cron-expressie naar mensentaal — alleen veelgebruikte patronen
function describeSchedule(schedule: string): string {
  const map: Record<string, string> = {
    "*/30 * * * *": "Elke 30 min",
    "*/15 * * * *": "Elke 15 min",
    "*/5 * * * *": "Elke 5 min",
    "0 * * * *": "Ieder uur",
    "0 0 * * *": "Dagelijks middernacht",
    "0 2 * * *": "Dagelijks 02:00",
    "0 3 * * *": "Dagelijks 03:00",
    "0 0 * * 0": "Wekelijks (zo)",
    "0 0 1 * *": "Maandelijks (1e)",
  };
  return map[schedule] || "Custom";
}
