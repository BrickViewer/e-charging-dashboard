import { CompanyDetailsForm } from "@/components/portal/CompanyDetailsForm";
import { useClientPaymentDetails, useClientProfile } from "@/hooks/useClientData";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function ClientProfile() {
  const [searchParams] = useSearchParams();
  const { data: client, isLoading } = useClientProfile();
  const { data: paymentDetails } = useClientPaymentDetails(client?.id);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const demo = useDemoMode();
  const showWelcome = searchParams.get("welkom") === "1";

  const handleLogout = async () => {
    if (demo) {
      // Demo sluiten: NIET uitloggen (dat zou de ingelogde sales-gebruiker
      // raken). Venster sluiten; als de browser dat weigert, terug naar sales.
      window.close();
      setTimeout(() => navigate("/sales/leads"), 150);
      return;
    }
    await signOut();
    navigate("/login");
  };

  // Uitloggen hoort bij de profielinstellingen; ook tonen als het profiel
  // niet laadt — juist dan wil je het account kunnen verlaten.
  const accountSection = (
    <div className="portal-card mt-5 p-5">
      <p className="cockpit-section-label">Account</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {demo ? "Sluit de demo-omgeving." : "Uitloggen op dit apparaat. Uw gegevens blijven bewaard."}
        </p>
        <Button variant="outline" onClick={handleLogout} className="flex-shrink-0">
          <LogOut className="w-4 h-4 mr-2" />
          {demo ? "Demo sluiten" : "Uitloggen"}
        </Button>
      </div>
    </div>
  );

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Laden...</div>;
  if (!client) {
    return (
      <div className="animate-fade-in">
        <div className="py-12 text-center text-muted-foreground">Geen gegevens gevonden.</div>
        {accountSection}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {showWelcome && (
        <div className="portal-card mb-5 p-5 sm:p-6">
          <p className="cockpit-section-label text-primary">Welkom</p>
          <h1 className="mt-2 text-xl font-semibold text-foreground">
            Maak uw klantprofiel compleet
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Vul uw contact-, bedrijfs-, factuur- en bankgegevens aan. Daarna kan E-Charging uw locaties koppelen en blijven afrekeningen netjes gekoppeld aan uw klantnummer.
          </p>
        </div>
      )}
      <CompanyDetailsForm client={client} paymentDetails={paymentDetails} />
      {accountSection}
    </div>
  );
}
