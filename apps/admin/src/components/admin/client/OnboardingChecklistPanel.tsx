import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, Lock, Mail, MapPin, MinusCircle, Receipt, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { ClientInvitationSummary, ClientPaymentDetails, ClientWithRelations } from "@/types/db";
import { hasCompleteClientProfile, toOnboardingItem } from "./clientDetailUtils";
import { useClientOrders } from "@/hooks/useInstallations";
import { useOnboardingSkips } from "@/hooks/useOnboarding";
import { OnboardingInvoiceDialog } from "@/components/sales/OnboardingInvoiceDialog";
import { formatEuro } from "@/services/calculations";
import {
  buildSkipIndex, onboardingFacts, stepStates, type OnbOrder, type StepState,
} from "@/services/onboardingPipeline";

const STATUS_ICON: Record<StepState["status"], React.ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />,
  todo: <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />,
  waiting: <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />,
  blocked: <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />,
  skipped: <MinusCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />,
  na: <MinusCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground/30" />,
};

export function OnboardingChecklistPanel({
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
  // Zelfde queryKey als InstallationOrdersCard → react-query deelt de cache, geen extra call.
  const ordersQ = useClientOrders(client.id);
  const skipsQ = useOnboardingSkips();

  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const item = toOnboardingItem(client, (ordersQ.data ?? []) as unknown as OnbOrder[]);
  const states = stepStates(item, buildSkipIndex(skipsQ.data));
  const facts = onboardingFacts(item);

  const hasPortalAccount = Boolean(client.portal_user_id);
  const hasPendingInvite = invitation?.status === "pending";
  const hasLocation = Boolean(client.locations?.length);
  // Strengere regel (contactnaam/-e-mail + echte bankgegevens-rij). Niet leidend voor
  // de fase — wél als adviesregel, zodat je hier ziet wat er strikt genomen mist.
  const strictComplete = hasCompleteClientProfile(client, paymentDetails);

  const subtitleFor = (s: StepState): string => {
    if (s.reason) return s.reason;
    switch (s.step.key) {
      case "klant_aanmaken":
        return client.client_number ? `Klantnummer #${client.client_number}` : "Klantnummer vrijgegeven";
      case "klant_uitnodigen":
        if (hasPortalAccount) return "Klant kan inloggen";
        if (s.status === "na") return "Zonder beheer — geen portaaltoegang";
        if (!client.contact_email) return "Geen e-mailadres bekend";
        if (hasPendingInvite && invitation?.expires_at)
          return `Verloopt ${format(new Date(invitation.expires_at), "d MMM yyyy", { locale: nl })}`;
        if (invitation?.status === "expired") return "Laatste uitnodiging is verlopen";
        return "Nog geen actieve uitnodiging";
      case "werkvoorbereiding":
        return s.status === "done" ? "Opdracht klaargezet" : "Materialen bestellen uit de calculatie";
      case "bij_installateur":
        return s.status === "done" ? "Installatie afgerond" : "Wacht op de installateur";
      case "opgeleverd":
        if (s.status === "done") return "Gefactureerd";
        // Beheer-klant zonder installatie-order: het gaat om de losse activatiefactuur.
        return facts.needsInstall && facts.hasOrder
          ? "Klaar om te factureren"
          : `Activatiekosten openstaand — ${formatEuro(facts.activationOpen)}`;
      case "locaties_koppelen":
        return hasLocation
          ? `${client.locations?.length ?? 0} locatie${client.locations?.length === 1 ? "" : "s"} gekoppeld`
          : "Koppel een gesyncde e-Flux locatie";
      case "gegevens":
        if (s.status === "done") {
          return strictComplete
            ? "Contact-, factuur- en bankgegevens opgeslagen"
            : "Compleet — maar contactgegevens of bankrekening ontbreken nog";
        }
        return "Klant vult dit in via Mijn gegevens";
      default:
        return "";
    }
  };

  const actionFor = (s: StepState): React.ReactNode => {
    if (s.status === "done" || s.status === "na" || s.status === "skipped") return null;
    if (s.step.key === "locaties_koppelen" && s.status !== "blocked") {
      return (
        <Button size="sm" variant="default" className="h-8 w-full text-xs" onClick={onLinkLocation}>
          <MapPin className="mr-1.5 h-3.5 w-3.5" /> Locatie koppelen
        </Button>
      );
    }
    // Zelfde factuurscherm als het onboarding-bord (installatie- én activatiemodus), zodat
    // je hier niet naar Financieel hoeft te navigeren voor de openstaande activatiekosten.
    if (s.step.key === "opgeleverd" && s.status !== "blocked") {
      return (
        <Button size="sm" variant="default" className="h-8 w-full text-xs" onClick={() => setInvoiceOpen(true)}>
          <Receipt className="mr-1.5 h-3.5 w-3.5" /> Factureren
        </Button>
      );
    }
    if (s.step.key === "klant_uitnodigen" && !hasPortalAccount) {
      if (!client.contact_email) {
        return (
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={onEdit}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> E-mailadres toevoegen
          </Button>
        );
      }
      return (
        <Button
          size="sm"
          variant={hasPendingInvite ? "outline" : "default"}
          className="h-8 w-full text-xs"
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
      );
    }
    return null;
  };

  const visible = states.filter((s) => !s.step.terminal);

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Onboarding</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {visible.map((s) => (
            <div
              key={s.step.key}
              className={`flex flex-col rounded-lg border border-border/70 bg-background/20 p-3 ${s.status === "na" || s.status === "skipped" ? "opacity-55" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${s.status === "na" || s.status === "skipped" ? "line-through decoration-muted-foreground/50" : ""}`}>
                    {s.step.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitleFor(s)}</p>
                </div>
                {STATUS_ICON[s.status]}
              </div>
              {actionFor(s) && <div className="mt-auto pt-3">{actionFor(s)}</div>}
            </div>
          ))}
        </div>
      </CardContent>
      <OnboardingInvoiceDialog client={invoiceOpen ? item : null} onClose={() => setInvoiceOpen(false)} />
    </Card>
  );
}
