import { Link, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import ClientDashboard from "./ClientDashboard";
import { DashboardBootSkeleton } from "@/components/portal/DashboardBootSkeleton";
import { useClientProfile } from "@/hooks/useClientData";
import { useDemoMode } from "@/contexts/demoModeContextValue";

// Index van /portal. Zachte onboarding-gate: een klant die de begeleide onboarding nog niet afrondde
// (en 'm deze sessie niet heeft uitgesteld) sturen we naar de wizard. Anders het dashboard, met een
// subtiele "rond je aanmelding af"-nudge zolang het nog niet compleet is.
export default function PortalHome() {
  const demo = useDemoMode();
  const { data: client, isLoading } = useClientProfile();

  if (demo) return <ClientDashboard />;

  if (isLoading) {
    // Mobiel: zelfde skelet als de login-splash → inloggen vloeit zonder
    // geknipper over in het dashboard. Desktop houdt de kleine spinner.
    return (
      <>
        <div className="lg:hidden h-full">
          <DashboardBootSkeleton />
        </div>
        <div className="hidden lg:flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const completed = Boolean(client?.onboarding_completed_at);
  const snoozed = typeof window !== "undefined" && window.sessionStorage.getItem("portal-onboarding-snoozed") === "1";

  if (client && !completed && !snoozed) {
    return <Navigate to="/portal/welkom" replace />;
  }

  return (
    <>
      <ClientDashboard />
      {client && !completed && (
        <Link
          to="/portal/welkom"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-primary/30 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur transition-colors hover:bg-primary/25 lg:bottom-6"
        >
          Rond uw aanmelding af →
        </Link>
      )}
    </>
  );
}
