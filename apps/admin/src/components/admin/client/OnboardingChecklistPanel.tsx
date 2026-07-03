import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, Mail, MapPin, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { ClientInvitationSummary, ClientPaymentDetails, ClientWithRelations } from "@/types/db";
import { hasCompleteClientProfile } from "./clientDetailUtils";

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
      label: "Locatie gekoppeld",
      done: hasLocation,
      subtitle: hasLocation
        ? `${client.locations?.length ?? 0} locatie${client.locations?.length === 1 ? "" : "s"} gekoppeld`
        : "Koppel een gesyncde e-Flux locatie",
      action: !hasLocation ? (
        <Button size="sm" variant="default" className="h-8 w-full text-xs" onClick={onLinkLocation}>
          <MapPin className="mr-1.5 h-3.5 w-3.5" />
          Locatie koppelen
        </Button>
      ) : null,
    },
    {
      label: "Uitnodiging verstuurd",
      done: hasSentInvite,
      subtitle: invitationSubtitle,
      action: !hasPortalAccount ? (
        client.managed === false ? (
          <span className="text-[11px] font-medium text-amber-600">Activeer eerst beheer</span>
        ) : !client.contact_email ? (
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={onEdit}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> E-mailadres toevoegen
          </Button>
        ) : (
          <div className="space-y-1.5">
            {!hasLocation && !hasSentInvite && (
              <p className="text-[11px] leading-tight text-amber-600">Koppel bij voorkeur eerst een locatie</p>
            )}
            <Button
              size="sm"
              variant={hasPendingInvite || !hasLocation ? "outline" : "default"}
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
          </div>
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
              className="flex flex-col rounded-lg border border-border/70 bg-background/20 p-3"
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
              {step.action && <div className="mt-auto pt-3">{step.action}</div>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
