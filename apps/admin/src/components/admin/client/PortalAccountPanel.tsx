import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, MailCheck, MailWarning, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { ClientInvitationSummary, ClientWithRelations } from "@/types/db";

export function PortalAccountPanel({
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
