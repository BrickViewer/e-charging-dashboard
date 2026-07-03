import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization, useLatestEfluxSync, useCronStatus, useRecentInvitations } from "@/hooks/useAdminData";
import {
  Building2, Settings2, Users, KeyRound,
  Plug, Landmark, Mail, Clock, Activity,
  AlertTriangle, PenLine, MessageSquare, SunMoon,
} from "lucide-react";
import { MySignatureCard } from "@/components/admin/MySignatureCard";
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import type { CronJobStatus, EfluxSyncLog } from "@/types/db";
import { IntegrationCard } from "@/components/admin/settings/IntegrationCard";
import { CompanySettingsTab } from "@/components/admin/settings/CompanySettingsTab";
import { DefaultsSettingsTab } from "@/components/admin/settings/DefaultsSettingsTab";
import { FaultSettingsTab } from "@/components/admin/settings/FaultSettingsTab";
import { UsersSettingsTab } from "@/components/admin/settings/UsersSettingsTab";
import { ApiSettingsTab, type ConnectionTestResult } from "@/components/admin/settings/ApiSettingsTab";
import { AutomationTab } from "@/components/admin/settings/AutomationTab";
import { PreferencesTab } from "@/components/admin/settings/PreferencesTab";

export default function AdminSettings() {
  const { data: org, isLoading: orgLoading } = useOrganization();
  const { data: syncLogs } = useLatestEfluxSync();
  const { data: cronJobs } = useCronStatus();
  const { data: recentInvites } = useRecentInvitations(1);
  const { isSuperadmin, role } = useAuth();

  // testResult wordt gezet in de API-tab (handleTestConnection) maar óók gelezen door de
  // hero-strip (efluxConfigured). Daarom leeft de state op paginaniveau: de tab krijgt een
  // setter, de hero blijft de waarde lezen.
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // Integrations status — de API-key staat server-side (Supabase secret). De echte
  // signalen dat e-Flux werkt: provider_id gezet ÉN een recente succesvolle sync.
  // Een handmatige "Test verbinding" is optioneel, geen voorwaarde.
  const lastEfluxSync = syncLogs?.find((l: EfluxSyncLog) => l.status === "success" && l.entity_type === "cpo_sessions");
  const efluxConfigured = !!org?.eflux_provider_id && (!!lastEfluxSync || testResult?.status === "ok");
  const lastInvite = recentInvites?.[0];

  // Alleen de nieuwste sessie-sync bepaalt of de e-Flux-koppeling faalde; een fout in
  // een andere entiteit (bv. locatie-reconcile) mag de hero niet op "faalde" zetten.
  const efluxLastFailed = (syncLogs ?? []).find((l: EfluxSyncLog) => l.entity_type === "cpo_sessions")?.status === "error";

  // Bankgegevens-kaart weerspiegelt of onze eigen self-billing-gegevens (IBAN + BTW) gezet zijn.
  const bankConfigured = !!org?.iban && !!org?.btw_number;

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
          status={bankConfigured ? "ok" : "warning"}
          summary={bankConfigured ? "Ingesteld" : "Onvolledig"}
          detail={bankConfigured
            ? "IBAN en BTW-nummer voor self-billing ingesteld"
            : "Vul IBAN en BTW-nummer in onder Bedrijf → Factuurgegevens"}
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
          <TabsTrigger value="handtekening"><PenLine className="w-4 h-4 mr-1" />Mijn handtekening</TabsTrigger>
          <TabsTrigger value="voorkeuren"><SunMoon className="w-4 h-4 mr-1" />Voorkeuren</TabsTrigger>
          {(role === "admin" || isSuperadmin) && <TabsTrigger value="feedback"><MessageSquare className="w-4 h-4 mr-1" />Feedback</TabsTrigger>}
        </TabsList>

        <TabsContent value="bedrijf">
          <CompanySettingsTab />
        </TabsContent>

        <TabsContent value="standaardwaarden">
          <DefaultsSettingsTab />
        </TabsContent>

        <TabsContent value="storingen">
          <FaultSettingsTab />
        </TabsContent>

        <TabsContent value="gebruikers">
          <UsersSettingsTab />
        </TabsContent>

        <TabsContent value="api">
          <ApiSettingsTab testResult={testResult} onTestResult={setTestResult} />
        </TabsContent>

        <TabsContent value="automatisering">
          <AutomationTab />
        </TabsContent>

        <TabsContent value="handtekening">
          <MySignatureCard />
        </TabsContent>

        {/* Tab: Feedback (admin) — interne feedback inzien en oplossen; screenshots via signed URLs */}
        {(role === "admin" || isSuperadmin) && (
          <TabsContent value="feedback">
            <FeedbackInbox />
          </TabsContent>
        )}

        <TabsContent value="voorkeuren">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
