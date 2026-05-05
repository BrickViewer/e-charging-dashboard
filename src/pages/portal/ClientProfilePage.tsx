import { useClientProfile } from "@/hooks/useClientData";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Building2, FileSignature } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export default function ClientProfile() {
  const { data: client, isLoading } = useClientProfile();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (isLoading) return <div className="text-center text-muted-foreground py-12">Laden...</div>;
  if (!client) return <div className="text-center text-muted-foreground py-12">Geen gegevens gevonden.</div>;

  const row = (label: string, value?: string | number | null) => (
    <div className="flex justify-between items-center py-3 border-b border-border last:border-0 gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || "-"}</span>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Bedrijfsinformatie */}
      <Card className="portal-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-primary" />
            <h2 className="cockpit-section-label tracking-[0.28em] text-foreground/90">
              Bedrijfsinformatie
            </h2>
          </div>
          <div className="space-y-0">
            {row("Bedrijfsnaam", client.company_name)}
            {row("KVK-nummer", client.kvk)}
            {row("Contactpersoon", client.contact_name)}
            {row("E-mail", client.contact_email)}
            {row("Telefoon", client.contact_phone)}
            {row("Factuuradres", client.billing_address)}
          </div>
        </CardContent>
      </Card>

      {/* Contract */}
      <Card className="portal-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSignature className="w-4 h-4 text-primary" />
            <h2 className="cockpit-section-label tracking-[0.28em] text-foreground/90">
              Contract
            </h2>
          </div>
          <div className="space-y-0">
            {row(
              "Startdatum",
              client.contract_start_date
                ? format(new Date(client.contract_start_date), "d MMMM yyyy", { locale: nl })
                : undefined
            )}
            {row(
              "Looptijd",
              client.contract_duration_months ? `${client.contract_duration_months} maanden` : undefined
            )}
            {row(
              "Opbrengstdeling",
              client.revenue_share_percentage
                ? `${client.revenue_share_percentage}% / ${100 - Number(client.revenue_share_percentage)}%`
                : undefined
            )}
            {row("Status", client.status)}
          </div>
        </CardContent>
      </Card>

      {/* Uitloggen */}
      <div className="flex justify-center pt-2">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="portal-card w-full sm:w-auto px-8"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Uitloggen
        </Button>
      </div>
    </div>
  );
}
