import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientById, useClientSettlements, useClientActivity, useClientInvitation, useOrganization } from "@/hooks/useAdminData";
import { generateSelfBillingInvoicePdf, InvoiceValidationError } from "@/services/invoicePdf";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DossierDocuments } from "@/components/documents/DossierDocuments";
import { FeeWaiverControl } from "@/components/admin/financial/FeeWaiverControl";
import { formatEuro, formatNumber, settlementVat } from "@/services/calculations";
import { monthFullLabel } from "@/lib/period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import {
  ArrowLeft, MapPin, Zap, FileText, Activity, Building2, Upload, Pencil, Save, X,
  Mail, MailCheck, MailWarning, RefreshCw, Loader2, RotateCcw,
  Plug, Wallet, Landmark, CheckCircle2, Circle, Trash2, AlertTriangle, Wrench, Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/services/activityLog";
import { deleteClientProfile } from "@/services/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useClientOrders, useUpdateOrder, useHandoffOrder, ORDER_STATUSES } from "@/hooks/useInstallations";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type {
  AdminActivity,
  ChargePoint,
  ClientPaymentDetails,
  ClientInvitationSummary,
  ClientWithRelations,
  QuarterlySettlement,
} from "@/types/db";

// Klant-cashflow = uitbetaling aan klant (energie loopt niet meer via ons).
const settlementCustomerCashflow = (settlement: QuarterlySettlement) =>
  Number(settlement.client_payout || 0);

const settlementPeriodLabel = (s: { year: number; month: number }) => monthFullLabel(s.year, s.month);

function hasCompleteClientProfile(
  client: ClientWithRelations,
  paymentDetails?: ClientPaymentDetails | null,
) {
  const requiredClientFields = [
    client.company_name,
    client.kvk,
    client.btw_number,
    client.contact_name,
    client.contact_email,
    client.billing_address_street,
    client.billing_address_postal,
    client.billing_address_city,
  ];
  const hasCompanyFields = requiredClientFields.every((value) => String(value ?? "").trim().length > 0);
  const hasPaymentFields = Boolean(
    paymentDetails?.invoice_email &&
      paymentDetails?.payout_account_holder_name &&
      paymentDetails?.payout_iban_last4,
  );
  return hasCompanyFields && hasPaymentFields;
}

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { data: clientData, isLoading } = useClientById(id);
  const { data: settlements } = useClientSettlements(id);
  const { data: activity } = useClientActivity(id);
  const { data: invitation } = useClientInvitation(id);
  const { data: org } = useOrganization();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number | null>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [sendingInvite, setSendingInvite] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [erasingClient, setErasingClient] = useState(false);
  const canViewPaymentDetails = role === "admin" || role === "manager";
  const { data: paymentDetails } = useQuery({
    queryKey: ["admin-client-payment-details", id],
    enabled: !!id && canViewPaymentDetails,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payment_details")
        .select("*")
        .eq("client_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const approveSettlement = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "approve_settlements", args: { settlement_ids: string[] }): Promise<{
          data: Array<{ approved_count?: number }> | null;
          error: Error | null;
        }>;
      };
      const { error } = await rpcClient.rpc("approve_settlements", {
        settlement_ids: [settlementId],
      });
      if (error) throw error;
      toast.success("Afrekening goedgekeurd - zichtbaar voor klant in portaal");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err.message || "Goedkeuring mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  // Goedkeuring terugdraaien (approved → calculated) — kan zolang er geen
  // geldstroom is gestart; de RPC dwingt dat server-side af.
  const unapproveSettlementAction = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "unapprove_settlements", args: { settlement_ids: string[] }): Promise<{
          data: Array<{ unapproved_count?: number }> | null;
          error: Error | null;
        }>;
      };
      const { error } = await rpcClient.rpc("unapprove_settlements", {
        settlement_ids: [settlementId],
      });
      if (error) throw error;
      toast.success("Goedkeuring teruggedraaid — afrekening staat weer op 'berekend'");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err.message || "Terugdraaien mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  const executeMoneyFlow = async (settlement: QuarterlySettlement) => {
    const settlementId = settlement.id;
    setApprovingId(settlementId);
    try {
      const totalCashflow = settlementCustomerCashflow(settlement);
      const rpcName =
        settlement.status === "invoice_sent"
          ? "mark_settlements_invoice_paid"
          : totalCashflow < 0
          ? "mark_settlements_invoice_sent"
          : "mark_settlements_paid";
      const rpcClient = supabase as unknown as {
        rpc(
          name: "mark_settlements_paid" | "mark_settlements_invoice_sent" | "mark_settlements_invoice_paid",
          args: { settlement_ids: string[] },
        ): Promise<{ data: unknown; error: Error | null }>;
      };
      const { error } = await rpcClient.rpc(rpcName, { settlement_ids: [settlementId] });
      if (error) throw error;
      if (rpcName === "mark_settlements_invoice_sent") {
        toast.success("Factuur gemarkeerd als verzonden");
      } else if (rpcName === "mark_settlements_invoice_paid") {
        toast.success("Factuur gemarkeerd als voldaan");
      } else {
        toast.success("Afrekening gemarkeerd als bankuitbetaling");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  // Leg vast dat e-Flux ONS heeft uitbetaald — voorwaarde voordat we de klant uitbetalen.
  const markEfluxReimbursed = async (settlementId: string) => {
    setApprovingId(settlementId);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "mark_settlements_eflux_reimbursed", args: { settlement_ids: string[] }): Promise<{ data: unknown; error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("mark_settlements_eflux_reimbursed", { settlement_ids: [settlementId] });
      if (error) throw error;
      toast.success("Vastgelegd: e-Flux heeft uitbetaald");
      queryClient.invalidateQueries({ queryKey: ["admin-client-settlements", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update mislukt");
    } finally {
      setApprovingId(null);
    }
  };

  const handleSendInvitation = async (isResend = false) => {
    if (!id) return;
    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-invitation", {
        body: { client_id: id, resend: isResend },
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
      queryClient.invalidateQueries({ queryKey: ["admin-client-invitation", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
    } catch (err) {
      toast.error(err.message || "Versturen mislukt");
    } finally {
      setSendingInvite(false);
    }
  };

  const startEditing = () => {
    if (!clientData) return;
    const client = clientData as ClientWithRelations;
    const contactName = splitContactName(client.contact_name);
    const contactPhone = splitDutchPhone(client.contact_phone);
    setEditErrors({});
    setEditData({
      client_number: client.client_number,
      company_name: client.company_name || "",
      kvk: client.kvk || "",
      btw_number: client.btw_number || "",
      contact_first_name: contactName.firstName,
      contact_last_name: contactName.lastName,
      contact_email: client.contact_email || "",
      contact_country_code: contactPhone.countryCode,
      contact_phone: contactPhone.phone,
      billing_address_street: client.billing_address_street || "",
      billing_address_postal: client.billing_address_postal || "",
      billing_address_city: client.billing_address_city || "",
      contract_start_date: client.contract_start_date || "",
      contract_duration_months: client.contract_duration_months ?? 36,
      echarging_fee_per_kwh: client.echarging_fee_per_kwh ?? "",
      charge_rate_per_kwh: client.charge_rate_per_kwh ?? 0.45,
      energy_cost_per_kwh: client.energy_cost_per_kwh ?? 0.25,
      ere_rate_per_kwh: client.ere_rate_per_kwh ?? 0.10,
      calculate_ere_enabled: client.calculate_ere_enabled ? "true" : "false",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!id || !clientData) return;
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
    try {
      const { error } = await supabase.from("clients").update({
        client_number: nextClientNumber,
        company_name: asText(editData.company_name),
        kvk: asText(editData.kvk) || null,
        btw_number: asText(editData.btw_number) || null,
        contact_name: [editData.contact_first_name, editData.contact_last_name].filter(Boolean).join(" "),
        contact_email: asText(editData.contact_email),
        contact_phone: editData.contact_phone ? `${editData.contact_country_code || "+31"}${editData.contact_phone}` : null,
        billing_address_street: asText(editData.billing_address_street) || null,
        billing_address_postal: asText(editData.billing_address_postal) || null,
        billing_address_city: asText(editData.billing_address_city) || null,
        contract_start_date: asText(editData.contract_start_date) || null,
        contract_duration_months: Number(editData.contract_duration_months) || 36,
        echarging_fee_per_kwh:
          editData.echarging_fee_per_kwh === "" || editData.echarging_fee_per_kwh === null
            ? null
            : Number(editData.echarging_fee_per_kwh),
        charge_rate_per_kwh: Number(editData.charge_rate_per_kwh) || 0.45,
        energy_cost_per_kwh: Number(editData.energy_cost_per_kwh) || 0.25,
        ere_rate_per_kwh: Number(editData.ere_rate_per_kwh) || 0.10,
        calculate_ere_enabled: editData.calculate_ere_enabled === "true",
        // BTW-status (en de legacy vat_liable) lopen via confirm_client_vat_status.
      }).eq("id", id);
      if (error) throw error;

      // Houd de gekoppelde contacten de bron van waarheid: naam → bedrijf,
      // contactgegevens → persoon. De propagate-trigger synct daarna alle
      // gekoppelde leads/klanten/offertes. (Adres/kvk blijven klant-/billing-lokaal.)
      if (clientData.company_id && asText(editData.company_name).trim()) {
        await supabase.from("companies").update({ name: asText(editData.company_name).trim() }).eq("id", clientData.company_id);
      }
      if (clientData.person_id) {
        await supabase.from("persons").update({
          first_name: asText(editData.contact_first_name) || null,
          last_name: asText(editData.contact_last_name) || null,
          email: asText(editData.contact_email) || null,
          phone: editData.contact_phone ? `${editData.contact_country_code || "+31"}${editData.contact_phone}` : null,
        }).eq("id", clientData.person_id);
      }

      await logActivity({
        client_id: id,
        action: "client_updated",
        description: "Klantgegevens gewijzigd",
      });

      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
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
        <Button variant="link" onClick={() => navigate("/admin/klanten")}>Terug naar overzicht</Button>
      </div>
    );
  }

  const client = clientData as ClientWithRelations;
  const isErased = client.status === "verwijderd";
  const canEraseClient = role === "admin" && !isErased;

  const handleEraseClient = async (confirmationName: string) => {
    if (!id || !canEraseClient) return;
    setErasingClient(true);
    try {
      const result = await deleteClientProfile(id, confirmationName);
      if (result?.status === "partial") {
        toast.warning(result.message || "Klantgegevens zijn geanonimiseerd, maar controleer het auth-account");
      } else {
        toast.success("Klantprofiel verwijderd");
      }
      setEraseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-payment-details", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-invitation", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-client-activity", id] });
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

  const typedSettlements = (settlements ?? []) as QuarterlySettlement[];
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
  const openBankCashflow = typedSettlements
    .filter((set) => set.status === "approved" && settlementCustomerCashflow(set) >= 0)
    .reduce((sum, set) => sum + settlementCustomerCashflow(set), 0);
  const openInvoiceAmount = typedSettlements
    .filter((set) =>
      set.status === "invoice_sent" ||
      (set.status === "approved" && settlementCustomerCashflow(set) < 0),
    )
    .reduce((sum, set) => sum + Math.abs(settlementCustomerCashflow(set)), 0);
  // "Totaal uitbetaald" = alleen status='paid', volledige klant-cashflow.
  const totalPaidOut = settlementsPaid.reduce(
    (s, set) => s + settlementCustomerCashflow(set),
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
        onClick={() => navigate("/admin/klanten")}
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
              onClick={async () => {
                if (!id) return;
                const { error } = await supabase.from("clients").update({ managed: true }).eq("id", id);
                if (error) { toast.error(error.message); return; }
                queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
                toast.success("Beheer geactiveerd");
              }}
              className="mt-1 block text-xs font-medium text-primary hover:underline"
            >
              Beheer activeren (dashboard + opbrengstdeling)
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        <ClientKpi
          label="Locaties"
          value={String((client.locations || []).length)}
          icon={<MapPin className="w-4 h-4" />}
        />
        <ClientKpi
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
        <ClientKpi
          label="Totaal kWh"
          value={fmtKwh(totalKwh)}
          subtitle="Totaal geladen"
          icon={<Zap className="w-4 h-4" />}
          accent="blue"
        />
        <ClientKpi
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
          onLinkLocation={() => navigate("/admin/locaties?filter=unlinked")}
          onEdit={() => setIsEditing(true)}
        />
      )}

      {/* Invitatie + betaalgegevens */}
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

      {!isErased && <InstallationOrdersCard clientId={id} />}

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ContactPersonCard client={client} isEditing={isEditing} ed={ed} setEd={setEd} />
            <BusinessDetailsCard client={client} isEditing={isEditing} ed={ed} setEd={setEd} errors={editErrors} />
            <InvoiceAndBankDetailsCard client={client} paymentDetails={paymentDetails} />
            <Card className="portal-card">
              <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {isEditing ? (
                  <div className="space-y-3">
                    <div><Label>Startdatum</Label><Input type="date" value={ed.contract_start_date} onChange={e => setEd("contract_start_date", e.target.value)} /></div>
                    <div><Label>Looptijd (maanden)</Label><Input type="number" value={ed.contract_duration_months} onChange={e => setEd("contract_duration_months", e.target.value)} /></div>
                    <div><Label>E-Charging fee (€/kWh, leeg = standaard)</Label><Input type="number" step="0.01" placeholder="standaard 0,10" value={ed.echarging_fee_per_kwh} onChange={e => setEd("echarging_fee_per_kwh", e.target.value)} /></div>
                    <div><Label>Laadtarief (€/kWh)</Label><Input type="number" step="0.01" value={ed.charge_rate_per_kwh} onChange={e => setEd("charge_rate_per_kwh", e.target.value)} /></div>
                    <div><Label>Energiekost (€/kWh)</Label><Input type="number" step="0.01" value={ed.energy_cost_per_kwh} onChange={e => setEd("energy_cost_per_kwh", e.target.value)} /></div>
                    <div><Label>ERE-tarief (€/kWh)</Label><Input type="number" step="0.01" value={ed.ere_rate_per_kwh} onChange={e => setEd("ere_rate_per_kwh", e.target.value)} /></div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p><span className="text-muted-foreground">Startdatum:</span> {client.contract_start_date || "—"}</p>
                    <p><span className="text-muted-foreground">Looptijd:</span> {client.contract_duration_months} maanden</p>
                    <p><span className="text-muted-foreground">E-Charging fee:</span> {client.echarging_fee_per_kwh != null ? `€${Number(client.echarging_fee_per_kwh).toFixed(2)}/kWh` : "standaard (€0,10/kWh)"}</p>
                    <p><span className="text-muted-foreground">Laadtarief:</span> {client.charge_rate_per_kwh != null ? `€${Number(client.charge_rate_per_kwh).toFixed(2)}/kWh` : "—"}</p>
                    <p><span className="text-muted-foreground">Energiekost:</span> €{Number(client.energy_cost_per_kwh).toFixed(2)}/kWh</p>
                    <p><span className="text-muted-foreground">ERE-tarief:</span> €{Number(client.ere_rate_per_kwh).toFixed(2)}/kWh</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Locaties & Laadpunten — read-only, koppelen gebeurt via /admin/locaties */}
        <TabsContent value="locaties" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Locaties ({(client.locations || []).length})</h3>
            <Button variant="outline" onClick={() => navigate("/admin/locaties?filter=unlinked")}>
              <MapPin className="w-4 h-4 mr-1" />
              Naar Locaties-overzicht
            </Button>
          </div>

          {(client.locations || []).length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Geen locaties gekoppeld aan deze klant. Koppel een locatie via het{" "}
                <button
                  onClick={() => navigate("/admin/locaties")}
                  className="text-primary hover:underline"
                >
                  Locaties-overzicht
                </button>
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
                  onClick={() => navigate(`/admin/locaties/${loc.id}`)}
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
        </TabsContent>

        {/* Tab 3: Financieel — detail-breakdown per kwartaal */}
        <TabsContent value="financieel" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Totaal uitbetaald</p>
              <p className="text-2xl font-semibold">{formatEuro(totalPaidOut)}</p>
              <p className="text-xs text-muted-foreground mt-1">{settlementsPaid.length} kwartaal uitbetaald</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Nog uit te betalen</p>
              <p className="text-2xl font-semibold">{formatEuro(openBankCashflow)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {openInvoiceAmount > 0
                  ? `${formatEuro(openInvoiceAmount)} te factureren`
                  : "Rendement + stroomvergoeding"}
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Totaal omzet (incl. lopend)</p>
              <p className="text-2xl font-semibold">{formatEuro(totalRevenue)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Afrekeningen</p>
              <p className="text-2xl font-semibold">{afrekeningenCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Lopende/concept tellen niet mee</p>
            </CardContent></Card>
          </div>

          {typedSettlements.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Nog geen afrekeningen. Dit wordt automatisch berekend zodra er sessies binnenkomen.
            </CardContent></Card>
          )}

          {typedSettlements.map((s) => {
            const grossRevenue = Number(s.gross_revenue || 0);
            const totalKwh = Number(s.total_kwh || 0);
            const feePerKwh = Number(s.echarging_fee_per_kwh || 0);
            const echargingRevenue = Number(s.echarging_revenue || 0);
            const clientPayout = Number(s.client_payout || 0);
            const vat = settlementVat({ clientPayout, vatRate: Number(s.vat_rate ?? 0.21) });
            const isLive = s.status === "live";
            const isCalculated = s.status === "calculated";
            const efluxReimbursed = Boolean(s.eflux_reimbursed_at);
            const needsEfluxReimbursed = s.status === "approved" && clientPayout >= 0 && !efluxReimbursed;
            const canMarkBankPaid = s.status === "approved" && clientPayout >= 0 && efluxReimbursed;
            const canMarkInvoiceSent = s.status === "approved" && clientPayout < 0;
            const canMarkInvoicePaid = s.status === "invoice_sent";

            return (
              <Card key={s.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{settlementPeriodLabel(s)}</h3>
                      <SettlementAdminStatusBadge settlement={s} />
                      {isLive && (
                        <span className="text-xs text-muted-foreground">Cijfers updaten met elke sync, definitief na afloop maand</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isCalculated && (
                        <Button size="sm" onClick={() => approveSettlement(s.id)} disabled={approvingId === s.id}>
                          {approvingId === s.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                          Goedkeuren
                        </Button>
                      )}
                      {needsEfluxReimbursed && (
                        <Button size="sm" variant="outline" onClick={() => markEfluxReimbursed(s.id)} disabled={approvingId === s.id}>
                          e-Flux heeft ons betaald
                        </Button>
                      )}
                      {(canMarkBankPaid || canMarkInvoiceSent || canMarkInvoicePaid) && (
                        <Button size="sm" variant="outline" onClick={() => executeMoneyFlow(s)} disabled={approvingId === s.id}>
                          {canMarkInvoicePaid
                            ? "Factuur voldaan"
                            : canMarkInvoiceSent
                            ? "Factuur verstuurd"
                            : "Bankbetaling markeren"}
                        </Button>
                      )}
                      {s.status === "approved" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unapproveSettlementAction(s.id)}
                          disabled={approvingId === s.id}
                          title="Terug naar 'berekend' — daarna kun je bv. de fee kwijtschelden"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                          Terugdraaien
                        </Button>
                      )}
                      {!isLive && !isCalculated && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await generateSelfBillingInvoicePdf(s, client, org, paymentDetails);
                            } catch (err) {
                              if (err instanceof InvoiceValidationError) {
                                toast.error(`Factuur geblokkeerd — ontbrekend: ${err.issues.map((i) => i.label).join(", ")}`);
                              } else {
                                toast.error((err as Error).message || "Factuur genereren mislukt");
                              }
                            }
                          }}
                          title="Self-billing afrekening als PDF"
                        >
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          Factuur
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {s.total_sessions} sessies · {formatNumber(totalKwh, 3)} kWh
                  </div>

                  <div className="border-t border-border pt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Laadopbrengst (bruto, excl. BTW)</span>
                      <span className="tabular-nums">{formatEuro(grossRevenue)}</span>
                    </div>
                    <details className="group">
                      <summary className="flex justify-between cursor-pointer hover:text-foreground list-none">
                        <span className="text-muted-foreground inline-flex items-center gap-1">
                          <span className="text-[10px] opacity-60 group-open:rotate-90 transition-transform inline-block">▶</span>
                          - E-Charging service-fee
                        </span>
                        <span className="tabular-nums">-{formatEuro(echargingRevenue)}</span>
                      </summary>

                      {/* Factuur-regel: kWh x tarief = fee. Geen minimum, geen abonnement, geen opstartkosten. */}
                      <div className="ml-4 mt-2 mb-1 pl-3 border-l border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground/70 border-b border-border/60">
                              <th className="text-left font-medium py-1.5 pr-2">Omschrijving</th>
                              <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">kWh</th>
                              <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Tarief / kWh</th>
                              <th className="text-right font-medium py-1.5 pl-2">Totaal</th>
                            </tr>
                          </thead>
                          <tbody className="text-muted-foreground/85">
                            <tr>
                              <td className="py-1.5 pr-2">Service-fee over geladen energie</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{formatNumber(totalKwh, 3)}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{formatEuro(feePerKwh)}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{formatEuro(echargingRevenue)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </details>
                    {/* Kwijtschelding: badge + toggle (alleen actief bij live/calculated) */}
                    <div className="flex justify-end">
                      <FeeWaiverControl settlement={s} />
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
                      <span>Uitbetaling klant</span>
                      <span className="text-primary tabular-nums">{formatEuro(clientPayout)}</span>
                    </div>
                  </div>

                  {/* Cashflow-samenvatting per partij — klant + E-Charging tellen samen op tot bruto. */}
                  <div className="border-t border-border pt-2 mt-2 text-xs text-muted-foreground bg-muted/30 -mx-5 -mb-5 px-5 py-3 rounded-b-md space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <span>Netto naar klant <span className="text-muted-foreground/70">(excl. BTW)</span></span>
                      <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(vat.net)}</span>
                    </div>
                    {vat.vatRate > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>BTW ({(vat.vatRate * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%)</span>
                        <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(vat.vatAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-border/40 pt-1.5 text-foreground font-semibold">
                      <span>Over te boeken <span className="text-muted-foreground/70 font-normal">(incl. BTW)</span></span>
                      <span className="text-primary tabular-nums whitespace-nowrap">{formatEuro(vat.inclVat)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Naar E-Charging <span className="text-muted-foreground/70">(service-fee)</span></span>
                      <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{formatEuro(echargingRevenue)}</span>
                    </div>
                    {s.eflux_reimbursed_at && (
                      <div className="text-muted-foreground/80 pt-1 border-t border-border/40">
                        e-Flux heeft uitbetaald op {format(new Date(s.eflux_reimbursed_at), "d MMM yyyy", { locale: nl })}
                      </div>
                    )}
                    {s.paid_at && (
                      <div className="text-muted-foreground/80">
                        {s.status === "invoice_paid" ? "Factuur voldaan op" : "Uitbetaald op"}{" "}
                        {format(new Date(s.paid_at), "d MMM yyyy", { locale: nl })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 4: Documenten — SharePoint-dossiers */}
        <TabsContent value="documenten">
          <Card>
            <CardHeader><CardTitle className="text-base">Dossiers (SharePoint)</CardTitle></CardHeader>
            <CardContent>
              <DossierDocuments clientId={id} />
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
                  {typedActivity.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 font-medium">{a.action}</td>
                      <td className="p-3 text-muted-foreground">{a.description}</td>
                    </tr>
                  ))}
                  {typedActivity.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Geen activiteit</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={eraseDialogOpen}
        onOpenChange={setEraseDialogOpen}
        title="Klantprofiel verwijderen"
        description="Deze actie verwijdert portaltoegang, bank- en contactgegevens, trekt uitnodigingen in en ontkoppelt alle locaties. Historische sessies en afrekeningen blijven administratief bewaard."
        warning={
          <>
            <p className="font-medium text-destructive">Dit kan niet via de UI worden teruggedraaid.</p>
            <p className="mt-1 text-muted-foreground">
              Typ de bedrijfsnaam hieronder om zeker te weten dat u het juiste klantprofiel verwijdert.
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper components

function splitContactName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function splitDutchPhone(phone?: string | null) {
  const compact = (phone ?? "").replace(/[^\d+]/g, "");
  if (compact.startsWith("+31")) {
    return { countryCode: "+31", phone: compact.slice(3).replace(/^0+/, "") };
  }
  if (compact.startsWith("0031")) {
    return { countryCode: "+31", phone: compact.slice(4).replace(/^0+/, "") };
  }
  if (compact.startsWith("31") && compact.length > 9) {
    return { countryCode: "+31", phone: compact.slice(2).replace(/^0+/, "") };
  }
  return { countryCode: "+31", phone: compact.replace(/^0+/, "") };
}

function displayValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{displayValue(value)}</span>
    </div>
  );
}

function ContactPersonCard({
  client,
  isEditing,
  ed,
  setEd,
}: {
  client: ClientWithRelations;
  isEditing: boolean;
  ed: Record<string, string | number | null>;
  setEd: (field: string, value: string | number | null) => void;
}) {
  const contactName = splitContactName(client.contact_name);
  const phone = splitDutchPhone(client.contact_phone);

  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Contactpersoon bedrijf</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Voornaam</Label><Input value={ed.contact_first_name ?? ""} onChange={e => setEd("contact_first_name", e.target.value)} /></div>
              <div><Label>Achternaam</Label><Input value={ed.contact_last_name ?? ""} onChange={e => setEd("contact_last_name", e.target.value)} /></div>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={ed.contact_email ?? ""} onChange={e => setEd("contact_email", e.target.value)} /></div>
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <Label>Landcode</Label>
                <Select value={String(ed.contact_country_code ?? "+31")} onValueChange={(value) => setEd("contact_country_code", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+31">🇳🇱 NL +31</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Telefoonnummer</Label><Input value={ed.contact_phone ?? ""} onChange={e => setEd("contact_phone", e.target.value)} /></div>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            <DetailRow label="Voornaam" value={contactName.firstName} />
            <DetailRow label="Achternaam" value={contactName.lastName} />
            <DetailRow label="E-mail" value={client.contact_email} />
            <DetailRow label="Landcode" value="🇳🇱 NL +31" />
            <DetailRow label="Telefoonnummer" value={phone.phone} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessDetailsCard({
  client,
  isEditing,
  ed,
  setEd,
  errors,
}: {
  client: ClientWithRelations;
  isEditing: boolean;
  ed: Record<string, string | number | null>;
  setEd: (field: string, value: string | number | null) => void;
  errors: Record<string, string>;
}) {
  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Bedrijfsgegevens</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label>Klantnummer</Label>
              <Input
                type="number"
                min={101}
                value={ed.client_number ?? ""}
                onChange={e => setEd("client_number", e.target.value)}
                className={errors.client_number ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {errors.client_number && (
                <p className="mt-1 text-xs text-destructive">{errors.client_number}</p>
              )}
            </div>
            <div><Label>Bedrijfsnaam</Label><Input value={ed.company_name ?? ""} onChange={e => setEd("company_name", e.target.value)} /></div>
            <div><Label>KvK-nummer</Label><Input value={ed.kvk ?? ""} onChange={e => setEd("kvk", e.target.value)} /></div>
            <div><Label>BTW-nummer</Label><Input value={ed.btw_number ?? ""} onChange={e => setEd("btw_number", e.target.value)} /></div>
            <div><Label>Factuuradres</Label><Input value={ed.billing_address_street ?? ""} onChange={e => setEd("billing_address_street", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Postcode</Label><Input value={ed.billing_address_postal ?? ""} onChange={e => setEd("billing_address_postal", e.target.value)} /></div>
              <div><Label>Plaats</Label><Input value={ed.billing_address_city ?? ""} onChange={e => setEd("billing_address_city", e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="admin-calculate-ere">Bereken ERE's</Label>
              <Switch
                id="admin-calculate-ere"
                checked={ed.calculate_ere_enabled === "true"}
                onCheckedChange={(checked) => setEd("calculate_ere_enabled", checked ? "true" : "false")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            <DetailRow label="Klantnummer" value={client.client_number ? `#${client.client_number}` : "Niet actief"} />
            <DetailRow label="Bedrijfsnaam" value={client.company_name} />
            <DetailRow label="KvK-nummer" value={client.kvk} />
            <DetailRow label="BTW-nummer" value={client.btw_number} />
            <DetailRow label="Factuuradres" value={client.billing_address_street} />
            <DetailRow label="Postcode" value={client.billing_address_postal} />
            <DetailRow label="Plaats" value={client.billing_address_city} />
            <DetailRow label="Bereken ERE's" value={client.calculate_ere_enabled ? "Ja" : "Nee"} />
          </div>
        )}
        {/* BTW-status loopt buiten de gewone edit-flow: host geeft op, admin
            bevestigt via een eigen RPC (vereist voor goedkeuren/factureren). */}
        <VatStatusBlock client={client} />
      </CardContent>
    </Card>
  );
}

const VAT_STATUS_LABELS: Record<string, string> = {
  vat_liable: "BTW-ondernemer (21%)",
  kor: "KOR — vrijgesteld van BTW",
  private: "Particulier — geen BTW",
};

// Weergave + bevestiging van de BTW-status van de leverancier (Wet OB).
// Zonder bevestigde status blokkeert approve_settlements het goedkeuren.
function VatStatusBlock({ client }: { client: ClientWithRelations }) {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<string>(client.vat_status ?? "");
  const [confirming, setConfirming] = useState(false);

  const confirmed = Boolean(client.vat_status && client.vat_status_confirmed_at);
  const pending = Boolean(client.vat_status && !client.vat_status_confirmed_at);

  const confirm = async () => {
    if (!selected) { toast.error("Kies eerst een BTW-status"); return; }
    setConfirming(true);
    try {
      const rpcClient = supabase as unknown as {
        rpc(name: "confirm_client_vat_status", args: { p_client_id: string; p_vat_status: string }): Promise<{ data: unknown; error: Error | null }>;
      };
      const { error } = await rpcClient.rpc("confirm_client_vat_status", {
        p_client_id: client.id,
        p_vat_status: selected,
      });
      if (error) throw error;
      toast.success("BTW-status bevestigd");
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    } catch (err) {
      toast.error((err as Error).message || "Bevestigen mislukt");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">BTW-status</p>
        {confirmed && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-primary/15 text-primary border border-primary/25">
            Bevestigd
          </span>
        )}
        {pending && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-[hsl(var(--status-amber)/0.15)] text-[hsl(var(--status-amber))] border border-[hsl(var(--status-amber)/0.25)]">
            Wacht op bevestiging
          </span>
        )}
        {!client.vat_status && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium bg-muted/50 text-muted-foreground border border-border">
            Nog niet opgegeven
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {client.vat_status
          ? `Opgegeven: ${VAT_STATUS_LABELS[client.vat_status] ?? client.vat_status}`
          : "De host kan dit in het portaal opgeven; jij kunt het hier direct vaststellen."}
        {" "}Zonder bevestigde status kan de maand niet worden goedgekeurd.
      </p>
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder="Kies BTW-status…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vat_liable">{VAT_STATUS_LABELS.vat_liable}</SelectItem>
            <SelectItem value="kor">{VAT_STATUS_LABELS.kor}</SelectItem>
            <SelectItem value="private">{VAT_STATUS_LABELS.private}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={confirm} disabled={confirming || !selected}>
          {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          Bevestigen
        </Button>
      </div>
    </div>
  );
}

function InvoiceAndBankDetailsCard({
  client,
  paymentDetails,
}: {
  client: ClientWithRelations;
  paymentDetails?: ClientPaymentDetails | null;
}) {
  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Factuur- en bankgegevens</CardTitle></CardHeader>
      <CardContent className="text-sm">
        <div className="space-y-0">
          <DetailRow label="Factuurmail" value={paymentDetails?.invoice_email ?? client.contact_email} />
          <DetailRow label="Naam rekeninghouder" value={paymentDetails?.payout_account_holder_name} />
          <DetailRow label="IBAN" value={paymentDetails?.payout_iban} />
          <DetailRow label="BIC" value={paymentDetails?.payout_bic} />
        </div>
      </CardContent>
    </Card>
  );
}

function ClientKpi({
  label,
  value,
  subtitle,
  icon,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "primary" | "amber" | "blue" | "muted";
}) {
  const accentBg = {
    primary: "bg-primary/10 border-primary/20 text-primary",
    amber: "bg-amber-400/10 border-amber-400/20 text-amber-400",
    blue: "bg-blue-400/10 border-blue-400/20 text-blue-400",
    muted: "bg-muted/30 border-border text-muted-foreground",
  }[accent ?? "muted"];

  return (
    <Card className="portal-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${accentBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="cockpit-section-label">{label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1.5 leading-none">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingChecklistPanel({
  client,
  invitation,
  paymentDetails,
  sendingInvite,
  onSendInvitation,
  onLinkLocation,
  onEdit,
}: {
  client: ClientWithRelations;
  invitation: ClientInvitationSummary | null | undefined;
  paymentDetails?: ClientPaymentDetails | null;
  sendingInvite: boolean;
  onSendInvitation: (resend: boolean) => void;
  onLinkLocation: () => void;
  onEdit: () => void;
}) {
  const hasPortalAccount = Boolean(client.portal_user_id);
  const hasPendingInvite = invitation?.status === "pending";
  const hasSentInvite = hasPortalAccount || hasPendingInvite || invitation?.status === "accepted";
  const detailsComplete = hasCompleteClientProfile(client, paymentDetails);
  const hasLocation = Boolean(client.locations?.length);

  const invitationSubtitle = hasPortalAccount
    ? "Klant kan inloggen"
    : client.managed === false
      ? "Zonder beheer — geen portaaltoegang"
      : !client.contact_email
        ? "Geen e-mailadres bekend"
        : hasPendingInvite && invitation?.expires_at
          ? `Verloopt ${format(new Date(invitation.expires_at), "d MMM yyyy", { locale: nl })}`
          : invitation?.status === "expired"
            ? "Laatste uitnodiging is verlopen"
            : "Nog geen actieve uitnodiging";

  const steps: Array<{
    label: string;
    done: boolean;
    subtitle: string;
    action?: React.ReactNode;
  }> = [
    {
      label: "Klant aangemaakt",
      done: true,
      subtitle: client.client_number ? `Klantnummer #${client.client_number}` : "Klantnummer vrijgegeven",
    },
    {
      label: "Uitnodiging verstuurd",
      done: hasSentInvite,
      subtitle: invitationSubtitle,
      action: !hasPortalAccount ? (
        client.managed === false ? (
          <span className="text-[11px] font-medium text-amber-600">Activeer eerst beheer</span>
        ) : !client.contact_email ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> E-mailadres toevoegen
          </Button>
        ) : (
          <Button
            size="sm"
            variant={hasPendingInvite ? "outline" : "default"}
            onClick={() => onSendInvitation(Boolean(hasPendingInvite))}
            disabled={sendingInvite}
          >
            {sendingInvite ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : hasPendingInvite ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Mail className="mr-1.5 h-3.5 w-3.5" />
            )}
            {hasPendingInvite ? "Opnieuw sturen" : "Uitnodiging sturen"}
          </Button>
        )
      ) : null,
    },
    {
      label: "Account actief",
      done: hasPortalAccount,
      subtitle: hasPortalAccount ? "Portal-account gekoppeld" : "Wacht op activatie door klant",
    },
    {
      label: "Gegevens compleet",
      done: detailsComplete,
      subtitle: detailsComplete ? "Contact-, factuur- en bankgegevens opgeslagen" : "Klant vult dit in via Mijn gegevens",
    },
    {
      label: "Locatie gekoppeld",
      done: hasLocation,
      subtitle: hasLocation
        ? `${client.locations?.length ?? 0} locatie${client.locations?.length === 1 ? "" : "s"} gekoppeld`
        : "Koppel een gesyncde e-Flux locatie",
      action: !hasLocation ? (
        <Button size="sm" variant="outline" onClick={onLinkLocation}>
          <MapPin className="mr-1.5 h-3.5 w-3.5" />
          Locatie koppelen
        </Button>
      ) : null,
    },
  ];

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Onboarding</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step) => (
            <div
              key={step.label}
              className="rounded-lg border border-border/70 bg-background/20 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.subtitle}</p>
                </div>
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
                )}
              </div>
              {step.action && <div className="mt-3">{step.action}</div>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PortalAccountPanel({
  client,
  invitation,
  sendingInvite,
  onSend,
  onEdit,
}: {
  client: ClientWithRelations;
  invitation: ClientInvitationSummary | null | undefined;
  sendingInvite: boolean;
  onSend: (resend: boolean) => void;
  onEdit: () => void;
}) {
  const linked = !!client.portal_user_id;
  const isPending = invitation && invitation.status === "pending";
  const isExpired = invitation && invitation.status === "expired";

  let icon: React.ReactNode;
  let iconBg: string;
  let title: string;
  let subtitle: string;
  let action: React.ReactNode;

  if (linked) {
    icon = <MailCheck className="w-4 h-4 text-primary" />;
    iconBg = "bg-primary/10 border-primary/20";
    title = "Portal-account actief";
    subtitle = `${client.contact_email} kan inloggen op /portal`;
    action = null;
  } else if (isPending) {
    icon = <Mail className="w-4 h-4 text-amber-400" />;
    iconBg = "bg-amber-400/10 border-amber-400/20";
    title = "Uitnodiging verstuurd";
    subtitle = `${invitation.email} · vervalt ${format(
      new Date(invitation.expires_at),
      "d MMM yyyy",
      { locale: nl },
    )}`;
    action = (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSend(true)}
        disabled={sendingInvite}
        className="portal-card"
      >
        {sendingInvite ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        )}
        Opnieuw
      </Button>
    );
  } else if (isExpired) {
    icon = <MailWarning className="w-4 h-4 text-destructive" />;
    iconBg = "bg-destructive/10 border-destructive/20";
    title = "Uitnodiging verlopen";
    subtitle = `Verlopen op ${format(
      new Date(invitation.expires_at),
      "d MMM yyyy",
      { locale: nl },
    )}`;
    action = (
      <Button
        size="sm"
        onClick={() => onSend(false)}
        disabled={sendingInvite}
      >
        {sendingInvite ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <Mail className="w-3.5 h-3.5 mr-1.5" />
        )}
        Nieuwe sturen
      </Button>
    );
  } else if (client.managed === false) {
    icon = <Mail className="w-4 h-4 text-amber-500" />;
    iconBg = "bg-amber-400/10 border-amber-400/20";
    title = "Geen portaaltoegang";
    subtitle = "Klant staat op 'zonder beheer' — activeer eerst beheer";
    action = null;
  } else if (!client.contact_email) {
    icon = <MailWarning className="w-4 h-4 text-muted-foreground" />;
    iconBg = "bg-muted/40 border-border";
    title = "Geen e-mailadres";
    subtitle = "Voeg een e-mailadres toe om uit te nodigen";
    action = (
      <Button size="sm" variant="outline" onClick={onEdit} className="portal-card">
        <Mail className="w-3.5 h-3.5 mr-1.5" />
        E-mailadres toevoegen
      </Button>
    );
  } else {
    icon = <Mail className="w-4 h-4 text-muted-foreground" />;
    iconBg = "bg-muted/40 border-border";
    title = "Geen portal-account";
    subtitle = "Stuur uitnodiging voor portaal-toegang";
    action = (
      <Button
        size="sm"
        onClick={() => onSend(false)}
        disabled={sendingInvite}
      >
        {sendingInvite ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <Mail className="w-3.5 h-3.5 mr-1.5" />
        )}
        Uitnodigen
      </Button>
    );
  }

  return (
    <Card className="portal-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconBg}`}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <p className="cockpit-section-label mb-0.5">Portal-account</p>
              <p className="text-sm font-medium truncate">{title}</p>
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentDetailsPanel({
  client,
  paymentDetails,
}: {
  client: ClientWithRelations;
  paymentDetails?: ClientPaymentDetails | null;
}) {
  const status = client.payment_onboarding_status ?? "missing";
  const hasBankDetails = Boolean(paymentDetails?.payout_iban_last4);
  let iconBg: string;
  let title: string;
  let subtitle: string;

  if ((status === "saved" || status === "needs_review") && hasBankDetails) {
    iconBg = "bg-primary/10 border-primary/20";
    title = "Gegevens opgeslagen";
    subtitle = `${paymentDetails?.invoice_email ?? client.contact_email} · IBAN eindigt op ${paymentDetails?.payout_iban_last4}`;
  } else if (paymentDetails?.invoice_email) {
    iconBg = "bg-muted/40 border-border";
    title = "Bankgegevens ontbreken";
    subtitle = `${paymentDetails.invoice_email} · klant heeft nog geen IBAN opgeslagen`;
  } else {
    iconBg = "bg-muted/40 border-border";
    title = "Betaalgegevens ontbreken";
    subtitle = "Klant vult deze in via Mijn gegevens";
  }

  return (
    <Card className="portal-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconBg}`}
            >
              <Landmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="cockpit-section-label mb-0.5">Betaalgegevens</p>
              <p className="text-sm font-medium truncate">{title}</p>
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SettlementAdminStatusBadge({ settlement }: { settlement: QuarterlySettlement }) {
  if (settlement.status === "approved" && settlementCustomerCashflow(settlement) < 0) {
    return <span className="badge-offerte">Factuur te sturen</span>;
  }

  return <StatusBadge status={settlement.status || "calculated"} />;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw", overgedragen: "Overgedragen", ingepland: "Ingepland",
  geinstalleerd: "Geïnstalleerd", afgerond: "Afgerond", geannuleerd: "Geannuleerd",
};

function InstallationOrdersCard({ clientId }: { clientId: string | undefined }) {
  const orders = useClientOrders(clientId);
  const update = useUpdateOrder();
  const handoff = useHandoffOrder();
  const list = orders.data ?? [];
  if (orders.isLoading || list.length === 0) return null;

  const doHandoff = async (orderId: string) => {
    try {
      const res = await handoff.mutateAsync(orderId);
      if (res.status === "ok") {
        toast.success(`Verstuurd naar E-Group (${res.egroup_order_number ?? res.egroup_order_id ?? "—"})`);
      } else if (res.status === "validation_error") {
        toast.error(res.message ?? "Site-adres onvolledig, vul aan via Installaties");
      } else if (res.status === "not_configured") {
        toast.warning("E-Group koppeling is nog niet geconfigureerd");
      } else {
        toast.error(res.message ?? "Versturen mislukt");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    }
  };

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Installatie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 p-3 text-sm">
            <span className="font-medium text-foreground">{o.external_ref || "Installatie-order"}</span>
            <Select value={o.status} onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("nl-NL")}</span>
            {o.status === "nieuw" && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => doHandoff(o.id)} disabled={handoff.isPending}>
                <Send className="mr-1.5 h-4 w-4" /> Verstuur naar e-portal
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
