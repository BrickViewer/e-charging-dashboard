import { CompanyDetailsForm } from "@/components/portal/CompanyDetailsForm";
import { useClientPaymentDetails, useClientProfile } from "@/hooks/useClientData";
import { useSearchParams } from "react-router-dom";

export default function ClientProfile() {
  const [searchParams] = useSearchParams();
  const { data: client, isLoading } = useClientProfile();
  const { data: paymentDetails } = useClientPaymentDetails(client?.id);
  const showWelcome = searchParams.get("welkom") === "1";

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Laden...</div>;
  if (!client) return <div className="py-12 text-center text-muted-foreground">Geen gegevens gevonden.</div>;

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
    </div>
  );
}
