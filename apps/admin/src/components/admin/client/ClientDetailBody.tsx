import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientById, useClientSettlements, useClientActivity, useClientInvitation, useOrganization } from "@/hooks/useAdminData";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DossierDocuments } from "@/components/documents/DossierDocuments";
import { normalizePhone } from "@/lib/phone";
import { KpiTile } from "@/components/admin/KpiTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import {
  ArrowLeft, MapPin, Zap, FileText, Activity, Building2, Pencil, Save, X,
  Plug, Wallet, Trash2, AlertTriangle, MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/services/activityLog";
import { deleteClientProfile, updateClient } from "@/services/clients";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCompany, useUpdatePerson } from "@/hooks/useContacts";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type {
  AdminActivity,
  ClientInvitationSummary,
  ClientWithRelations,
  Settlement,
} from "@/types/db";
import {
  splitContactName,
  settlementCustomerCashflow,
  settlementNetPaid,
} from "@/components/admin/client/clientDetailUtils";
import { useClientSettlementActions } from "@/components/admin/client/useClientSettlementActions";
import { OnboardingChecklistPanel } from "@/components/admin/client/OnboardingChecklistPanel";
import { PortalAccountPanel } from "@/components/admin/client/PortalAccountPanel";
import { PaymentDetailsPanel } from "@/components/admin/client/PaymentDetailsPanel";
import { InstallationOrdersCard } from "@/components/admin/client/InstallationOrdersCard";
import { ClientOverviewTab } from "@/components/admin/client/ClientOverviewTab";
import { ClientLocationsTab } from "@/components/admin/client/ClientLocationsTab";
import { ClientFinancialTab } from "@/components/admin/client/ClientFinancialTab";
import { ClientActivityTab } from "@/components/admin/client/ClientActivityTab";
import { LinkLocationsDialog } from "@/components/admin/client/LinkLocationsDialog";
import { SendClientMessageDialog } from "@/components/admin/client/SendClientMessageDialog";

// Klant-rij-updates lopen via één react-query-mutatie (i.p.v. losse supabase.from(...).update-calls
// verspreid door de component) zodat de caches consistent invalideren.
function useUpdateClient(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"clients">) => {
      if (!id) throw new Error("Geen klant-id");
      const { data, error } = await updateClient(id, patch);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-client", id] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
  });
}

// Volledige klantdetail-inhoud. Wordt zowel door de route-pagina (AdminClientDetail) als door
// de slide-over (ClientDetailSheet) gerenderd. `clientId` vervangt de vroegere useParams-id;
// `onClose` gaat terug naar het overzicht (route) of sluit de sheet.
export function ClientDetailBody({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateCompany = useUpdateCompany();
  const updatePerson = useUpdatePerson();
  const updateClientMutation = useUpdateClient(clientId);
  const { role } = useAuth();
  const { data: clientData, isLoading } = useClientById(clientId);
  const { data: settlements, isLoading: settlementsLoading, isError: settlementsError } = useClientSettlements(clientId);
  const { data: activity, isLoading: activityLoading, isError: activityError } = useClientActivity(clientId);
  const { data: invitation, isError: invitationError } = useClientInvitation(clientId);
  const { data: org } = useOrganization();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number | null>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [sendingInvite, setSendingInvite] = useState(false);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [linkLocationOpen, setLinkLocationOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [erasingClient, setErasingClient] = useState(false);
  const { approvingId, approveSettlement, unapproveSettlement, executeMoneyFlow, markEfluxReimbursed } =
    useClientSettlementActions(clientId);
  const canViewPaymentDetails = role === "admin" || role === "manager";
  const canSendMessage = role === "admin" || role === "manager";
  const { data: paymentDetails } = useQuery({
    queryKey: ["admin-client-payment-details", clientId],
    enabled: !!clientId && canViewPaymentDetails,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payment_details")
        .select("*")
        .eq("client_id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleSendInvitation = async (isResend = false) => {
    if (!clientId) return;
    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-invitation", {
        body: { client_id: clientId, resend: isResend },
      });
      if (error) throw error;
      if (data?.status === "sent") {
        toast.success(`Uitnodiging verstuurd naar ${data.to}`);
      } else if (data?.status === "not_configured") {
        toast.error("Resend nog niet geconfigureerd. Voeg RESEND_API_KEY toe in Supabase secrets.");
      } else if (data?.status === "already_linked") {
        toast.info("Klant heeft al een actief portal-account");
      } else {
        toast.error(data?.message || "Versturen mislukt");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-client-invitation", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleActivateManagement = async () => {
    if (!clientId) return;
    if (!window.confirm("Beheer activeren? De klant krijgt dashboard-toegang en de maandelijkse afrekening gaat lopen.")) return;
    try {
      await updateClientMutation.mutateAsync({ managed: true });
      await logActivity({
        client_id: clientId,
        action: "client_updated",
        description: "Beheer geactiveerd (dashboard + maandelijkse afrekening)",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-client-activity", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
      toast.success("Beheer geactiveerd");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Beheer activeren mislukt");
    }
  };

  const startEditing = () => {
    if (!clientData) return;
    const client = clientData as ClientWithRelations;
    const contactName = splitContactName(client.contact_name);
    setEditErrors({});
    setEditData({
      client_number: client.client_number,
      company_name: client.company_name || "",
      kvk: client.kvk || "",
      btw_number: client.btw_number || "",
      contact_first_name: contactName.firstName,
      contact_last_name: contactName.lastName,
      contact_email: client.contact_email || "",
      contact_phone: client.contact_phone || "",
      billing_address_street: client.billing_address_street || "",
      // clients heeft één billing-straat-kolom (straat + huisnummer); AddressFields splitst huisnummer los.
      // Het bestaande adres blijft in `billing_address_street`; een nieuw PDOK-huisnummer landt hier.
      billing_house: "",
      billing_address_postal: client.billing_address_postal || "",
      billing_address_city: client.billing_address_city || "",
      contract_start_date: client.contract_start_date || "",
      contract_duration_months: client.contract_duration_months ?? 12,
      echarging_fee_per_kwh: client.echarging_fee_per_kwh ?? "",
      charge_rate_per_kwh: client.charge_rate_per_kwh ?? 0.45,
      energy_cost_per_kwh: client.energy_cost_per_kwh ?? 0.25,
      ere_rate_per_kwh: client.ere_rate_per_kwh ?? 0.10,
      calculate_ere_enabled: client.calculate_ere_enabled ? "true" : "false",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!clientId || !clientData) return;
    const nextClientNumber = Number(editData.client_number);
    if (!Number.isInteger(nextClientNumber) || nextClientNumber < 101) {
      setEditErrors({ client_number: "Klantnummer moet 101 of hoger zijn" });
      toast.error("Controleer het klantnummer");
      return;
    }

    setSaving(true);
    setEditErrors({});
    // editData is een Record<string, string | number | null>; tekstkolommen
    // verwachten string(| null). Coerce expliciet (runtime-no-op voor strings).
    const asText = (v: string | number | null | undefined): string => (v == null ? "" : String(v));
    // Factuuradres: AddressFields levert straat + huisnummer los; combineer terug naar de ene billing-kolom.
    const billingStreet = [asText(editData.billing_address_street).trim(), asText(editData.billing_house).trim()]
      .filter(Boolean)
      .join(" ");
    try {
      await updateClientMutation.mutateAsync({
        client_number: nextClientNumber,
        company_name: asText(editData.company_name),
        kvk: asText(editData.kvk) || null,
        btw_number: asText(editData.btw_number) || null,
        contact_name: [editData.contact_first_name, editData.contact_last_name].filter(Boolean).join(" "),
        contact_email: asText(editData.contact_email),
        contact_phone: normalizePhone(asText(editData.contact_phone)),
        billing_address_street: billingStreet || null,
        billing_address_postal: asText(editData.billing_address_postal) || null,
        billing_address_city: asText(editData.billing_address_city) || null,
        contract_start_date: asText(editData.contract_start_date) || null,
        contract_duration_months: Number(editData.contract_duration_months) || 12,
        echarging_fee_per_kwh:
          editData.echarging_fee_per_kwh === "" || editData.echarging_fee_per_kwh === null
            ? null
            : Number(editData.echarging_fee_per_kwh),
        charge_rate_per_kwh: Number(editData.charge_rate_per_kwh) || 0.45,
        energy_cost_per_kwh: Number(editData.energy_cost_per_kwh) || 0.25,
        ere_rate_per_kwh: Number(editData.ere_rate_per_kwh) || 0.10,
        calculate_ere_enabled: editData.calculate_ere_enabled === "true",
        // BTW-status (en de legacy vat_liable) lopen via confirm_client_vat_status.
      });

      // Houd de gekoppelde contacten de bron van waarheid: naam → bedrijf,
      // contactgegevens → persoon, via de useContacts-mutaties (juiste cache-invalidatie
      // van companies/persons/leads). De propagate-trigger synct daarna alle gekoppelde
      // leads/klanten/offertes. Naam + kvk/btw óók naar het bedrijf schrijven zodat de
      // klant- en bedrijfs-rij niet uit elkaar lopen (kvk/btw worden niet door een trigger gesynct).
      if (clientData.company_id) {
        await updateCompany.mutateAsync({
          id: clientData.company_id,
          patch: {
            ...(asText(editData.company_name).trim() ? { name: asText(editData.company_name).trim() } : {}),
            kvk: asText(editData.kvk) || null,
            btw_number: asText(editData.btw_number) || null,
          },
        });
      }
      if (clientData.person_id) {
        await updatePerson.mutateAsync({
          id: clientData.person_id,
          patch: {
            first_name: asText(editData.contact_first_name) || null,
            last_name: asText(editData.contact_last_name) || null,
            email: asText(editData.contact_email) || null,
            phone: normalizePhone(asText(editData.contact_phone)),
          },
        });
      }

      await logActivity({
        client_id: clientId,
        action: "client_updated",
        description: "Klantgegevens gewijzigd",
      });

      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast.success("Klantgegevens opgeslagen");
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fout bij opslaan";
      if (
        message.includes("clients_client_number_key") ||
        message.includes("clients_client_number_active_key") ||
        message.toLowerCase().includes("duplicate key")
      ) {
        setEditErrors({ client_number: "Dit klantnummer is al in gebruik" });
        toast.error("Dit klantnummer is al in gebruik");
      } else if (
        message.includes("clients_client_number_check") ||
        message.includes("clients_client_number_active_check") ||
        message.toLowerCase().includes("klantnummer")
      ) {
        setEditErrors({ client_number: "Klantnummer moet 101 of hoger zijn" });
        toast.error("Controleer het klantnummer");
      } else {
        toast.error(message);
      }
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

  if (!clientData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Klant niet gevonden</p>
        <Button variant="link" onClick={() => onClose()}>Terug naar overzicht</Button>
      </div>
    );
  }

  const client = clientData as ClientWithRelations;
  const isErased = client.status === "verwijderd";
  const canEraseClient = role === "admin" && !isErased;

  const handleEraseClient = async (confirmationName: string) => {
    if (!clientId || !canEraseClient) return;
    setErasingClient(true);
    try {
      const result = await deleteClientProfile(clientId, confirmationName);
      if (result?.status === "partial") {
        toast.warning(result.message || "Klantgegevens zijn geanonimiseerd, maar controleer het auth-account");
      } else {
        toast.success("Klantprofiel verwijderd");
      }
      setEraseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-payment-details", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-invitation", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-activity", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Klantprofiel verwijderen mislukt");
    } finally {
      setErasingClient(false);
    }
  };

  const typedSettlements = (settlements ?? []) as Settlement[];
  const typedActivity = (activity ?? []) as AdminActivity[];
  const typedInvitation = invitation as ClientInvitationSummary | null | undefined;
  const allCPs = (client.locations || []).flatMap((l) => l.charge_points || []);
  const totalKwh = typedSettlements.reduce((s, set) => s + Number(set.total_kwh || 0), 0);
  // "Omzet" = som van reimbursement (= Road's "Prijs excl BTW") over alle kwartalen
  // Settlement-aggregaten gesplitst op status zodat KPI's niet misleidend zijn:
  //  - liveOrCalculated = lopende of nog-niet-goedgekeurde afrekeningen
  //  - approvedOrPaid   = formeel afgerekend (klant heeft of krijgt geld)
  //  - paidOnly         = wat al daadwerkelijk als bankbetaling is verwerkt
  const settlementsApproved = typedSettlements.filter((s) =>
    ["approved", "paid", "invoice_sent", "invoice_paid", "charged_back"].includes(s.status || ""),
  );
  const settlementsPaid = typedSettlements.filter((s) => s.status === "paid");

  // "Totaal omzet" = alle bruto excl BTW = volledig overzicht voor admin (incl. lopend)
  const totalRevenue = typedSettlements.reduce((s, set) => s + Number(set.gross_revenue || 0), 0);
  // Teken-routing op bruto; de getoonde bedragen zijn NETTO (na activatie-verrekening).
  const openBankCashflow = typedSettlements
    .filter((set) => set.status === "approved" && settlementCustomerCashflow(set) >= 0)
    .reduce((sum, set) => sum + settlementNetPaid(set), 0);
  const openInvoiceAmount = typedSettlements
    .filter((set) =>
      set.status === "invoice_sent" ||
      (set.status === "approved" && settlementCustomerCashflow(set) < 0),
    )
    .reduce((sum, set) => sum + Math.abs(settlementCustomerCashflow(set)), 0); // negatieve maand → geen activatie
  // "Totaal uitbetaald" = alleen status='paid', netto (na activatie).
  const totalPaidOut = settlementsPaid.reduce(
    (s, set) => s + settlementNetPaid(set),
    0,
  );
  // Aantal formele afrekeningen (live/calculated tellen niet)
  const afrekeningenCount = settlementsApproved.length;


  const ed = editData;
  const setEd = (field: string, value: string | number | null) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    setEditErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const onlineCps = allCPs.filter(
    (cp) => cp.status === "online" || cp.status === "in_use",
  ).length;
  // Euros altijd op 2 decimalen (geen afronding naar gehele euro)
  const fmtEuro = (v: number) =>
    `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtKwh = (v: number) => Math.round(v).toLocaleString("nl-NL");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onClose()}
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Klanten
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{client.company_name}</h1>
            {client.client_number && (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                #{client.client_number}
              </span>
            )}
            <StatusBadge status={client.status || "actief"} />
            {client.managed === false && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Zonder beheer</span>
            )}
          </div>
          {(client.kvk || client.contact_email) && (
            <p className="text-sm text-muted-foreground mt-1">
              {client.kvk && <>KvK {client.kvk}</>}
              {client.kvk && client.contact_email && " · "}
              {client.contact_email}
            </p>
          )}
          {client.company_id && (
            <button
              onClick={() => navigate(`/sales/contacten?company=${client.company_id}`)}
              className="mt-1 block text-xs font-medium text-primary hover:underline"
            >
              → Bedrijfsdossier in Contacten
            </button>
          )}
          {client.managed === false && (
            <button
              onClick={handleActivateManagement}
              className="mt-1 block text-xs font-medium text-primary hover:underline"
            >
              Beheer activeren (dashboard + maandelijkse afrekening)
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && !isErased && canSendMessage && (
            <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)} className="portal-card">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Bericht sturen
            </Button>
          )}
          {!isEditing && !isErased && (
            <Button variant="outline" size="sm" onClick={startEditing} className="portal-card">
              <Pencil className="w-4 h-4 mr-1.5" />
              Bewerken
            </Button>
          )}
          {canEraseClient && !isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEraseDialogOpen(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Verwijderen
            </Button>
          )}
          {isEditing && (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? "Opslaan..." : "Opslaan"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="portal-card">
                <X className="w-4 h-4 mr-1.5" />
                Annuleren
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Locaties"
          value={String((client.locations || []).length)}
          icon={<MapPin className="w-4 h-4" />}
        />
        <KpiTile
          label="Laadpunten online"
          value={`${onlineCps} / ${allCPs.length}`}
          subtitle={
            allCPs.length > 0
              ? `${Math.round((onlineCps / allCPs.length) * 100)}% beschikbaar`
              : "Geen laadpunten"
          }
          icon={<Plug className="w-4 h-4" />}
          accent={
            allCPs.length === 0
              ? "muted"
              : onlineCps === allCPs.length
              ? "primary"
              : "amber"
          }
        />
        <KpiTile
          label="Totaal kWh"
          value={fmtKwh(totalKwh)}
          subtitle="Totaal geladen"
          icon={<Zap className="w-4 h-4" />}
          accent="blue"
        />
        <KpiTile
          label="Totaal uitbetaald"
          value={fmtEuro(totalPaidOut)}
          subtitle={`${afrekeningenCount} afrekening(en), waarvan ${settlementsPaid.length} uitbetaald`}
          icon={<Wallet className="w-4 h-4" />}
          accent="primary"
        />
      </div>

      {isErased ? (
        <Card className="border-destructive/25 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Klantprofiel verwijderd</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Portaltoegang, bankgegevens, contactgegevens en locaties zijn verwijderd of ontkoppeld. Historische sessies en afrekeningen blijven administratief bewaard.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <OnboardingChecklistPanel
          client={client}
          invitation={typedInvitation}
          paymentDetails={paymentDetails}
          sendingInvite={sendingInvite}
          onSendInvitation={handleSendInvitation}
          onLinkLocation={() => setLinkLocationOpen(true)}
          onEdit={() => setIsEditing(true)}
        />
      )}

      {/* Invitatie + betaalgegevens */}
      {!isErased && invitationError && (
        <p className="text-xs text-destructive">De uitnodigingsstatus kon niet worden geladen.</p>
      )}
      {!isErased && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PortalAccountPanel
            client={client}
            invitation={typedInvitation}
            sendingInvite={sendingInvite}
            onSend={handleSendInvitation}
            onEdit={() => setIsEditing(true)}
          />
          <PaymentDetailsPanel
            client={client}
            paymentDetails={paymentDetails}
          />
        </div>
      )}

      {!isErased && <InstallationOrdersCard clientId={clientId} />}

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
          <ClientOverviewTab
            client={client}
            clientId={clientId}
            isEditing={isEditing}
            ed={ed}
            setEd={setEd}
            editErrors={editErrors}
            paymentDetails={paymentDetails}
          />
        </TabsContent>

        {/* Tab 2: Locaties & Laadpunten — koppelen via het zoekbare koppel-scherm (LinkLocationsDialog). */}
        <TabsContent value="locaties" className="space-y-4">
          <ClientLocationsTab
            client={client}
            onNavigate={(path) => navigate(path)}
            onLinkLocation={() => setLinkLocationOpen(true)}
          />
        </TabsContent>

        {/* Tab 3: Financieel — detail-breakdown per kwartaal */}
        <TabsContent value="financieel" className="space-y-4">
          <ClientFinancialTab
            settlements={typedSettlements}
            settlementsLoading={settlementsLoading}
            settlementsError={settlementsError}
            totalPaidOut={totalPaidOut}
            paidCount={settlementsPaid.length}
            openBankCashflow={openBankCashflow}
            openInvoiceAmount={openInvoiceAmount}
            totalRevenue={totalRevenue}
            afrekeningenCount={afrekeningenCount}
            client={client}
            org={org}
            paymentDetails={paymentDetails}
            approvingId={approvingId}
            approveSettlement={approveSettlement}
            unapproveSettlement={unapproveSettlement}
            executeMoneyFlow={executeMoneyFlow}
            markEfluxReimbursed={markEfluxReimbursed}
          />
        </TabsContent>

        {/* Tab 4: Documenten — SharePoint-dossiers */}
        <TabsContent value="documenten">
          <Card>
            <CardHeader><CardTitle className="text-base">Dossiers (SharePoint)</CardTitle></CardHeader>
            <CardContent>
              <DossierDocuments clientId={clientId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Activiteit */}
        <TabsContent value="activiteit">
          <ClientActivityTab
            activity={typedActivity}
            activityLoading={activityLoading}
            activityError={activityError}
          />
        </TabsContent>
      </Tabs>

      <LinkLocationsDialog
        clientId={clientId}
        clientName={client.company_name}
        open={linkLocationOpen}
        onOpenChange={setLinkLocationOpen}
      />

      <SendClientMessageDialog
        clientId={clientId}
        clientName={client.company_name}
        hasPortalAccount={!!client.portal_user_id}
        recipientEmail={client.contact_email ?? null}
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
      />

      <DeleteConfirmDialog
        open={eraseDialogOpen}
        onOpenChange={setEraseDialogOpen}
        title="Klantprofiel verwijderen"
        description="Deze actie verwijdert portaltoegang, bank- en contactgegevens, trekt uitnodigingen in en ontkoppelt alle locaties. Historische sessies en afrekeningen blijven administratief bewaard."
        warning={
          <>
            <p className="font-medium text-destructive">Dit kan niet via de UI worden teruggedraaid.</p>
            <p className="mt-1 text-muted-foreground">
              Typ de naam hieronder om zeker te weten dat u het juiste klantprofiel verwijdert.
            </p>
          </>
        }
        confirmationValue={client.company_name ?? ""}
        confirmLabel="Verwijderen"
        isSubmitting={erasingClient}
        onConfirm={handleEraseClient}
      />
    </div>
  );
}
