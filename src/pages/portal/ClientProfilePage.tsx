import { useClientProfile } from "@/hooks/useClientData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function ClientProfile() {
  const { data: client, isLoading } = useClientProfile();

  if (isLoading) return <div className="text-muted-foreground">Laden...</div>;
  if (!client) return <div className="text-muted-foreground">Geen gegevens gevonden.</div>;

  const row = (label: string, value?: string | number | null) => (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Mijn gegevens</h1>

      <Card>
        <CardHeader><CardTitle>Bedrijfsinformatie</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {row("Bedrijfsnaam", client.company_name)}
          {row("KVK-nummer", client.kvk)}
          {row("Contactpersoon", client.contact_name)}
          {row("E-mail", client.contact_email)}
          {row("Telefoon", client.contact_phone)}
          {row("Factuuradres", client.billing_address)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contract</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {row("Startdatum", client.contract_start_date ? format(new Date(client.contract_start_date), "d MMMM yyyy", { locale: nl }) : undefined)}
          {row("Looptijd", client.contract_duration_months ? `${client.contract_duration_months} maanden` : undefined)}
          {row("Opbrengstdeling", client.revenue_share_percentage ? `${client.revenue_share_percentage}% / ${100 - Number(client.revenue_share_percentage)}%` : undefined)}
          {row("Status", client.status)}
        </CardContent>
      </Card>
    </div>
  );
}
