import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import Login from "./pages/Login";
import ClientLayout from "./layouts/ClientLayout";
import WorkspaceLayout from "./layouts/WorkspaceLayout";
import NotFound from "./pages/NotFound";
import InviteAccept from "./pages/InviteAccept";
import OfferAccept from "./pages/OfferAccept";
import ResetPassword from "./pages/ResetPassword";
import { workspacesForRole } from "@/lib/workspaces";

// Client portal pages
const ClientDashboard = lazy(() => import("./pages/portal/ClientDashboard"));
const ClientSessions = lazy(() => import("./pages/portal/ClientSessions"));
const ClientFinancial = lazy(() => import("./pages/portal/ClientFinancial"));
const ClientProfilePage = lazy(() => import("./pages/portal/ClientProfilePage"));
const ClientMessages = lazy(() => import("./pages/portal/ClientMessages"));
const ClientLocationDetail = lazy(() => import("./pages/portal/ClientLocationDetail"));
const DemoLayout = lazy(() => import("./layouts/DemoLayout"));

// Admin pages — lazy loaded
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminClients = lazy(() => import("./pages/admin/AdminClients"));
const AdminClientWizard = lazy(() => import("./pages/admin/AdminClientWizard"));
const AdminClientDetail = lazy(() => import("./pages/admin/AdminClientDetail"));
const AdminFinancial = lazy(() => import("./pages/admin/AdminFinancial"));
const AdminLocations = lazy(() => import("./pages/admin/AdminLocations"));
const SalesInstallations = lazy(() => import("./pages/sales/SalesInstallations"));
const SalesOnboarding = lazy(() => import("./pages/sales/SalesOnboarding"));
const AdminLocationDetail = lazy(() => import("./pages/admin/AdminLocationDetail"));
const AdminStoringen = lazy(() => import("./pages/admin/AdminStoringen"));
const AdminStoringDetail = lazy(() => import("./pages/admin/AdminStoringDetail"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminConfiguratorSettings = lazy(() => import("./pages/admin/AdminConfiguratorSettings"));

// Sales pages — lazy loaded
const SalesLeads = lazy(() => import("./pages/sales/SalesLeads"));
const SalesContacts = lazy(() => import("./pages/sales/SalesContacts"));
const SalesOffertes = lazy(() => import("./pages/sales/SalesOffertes"));

// Marketing pages — lazy loaded
const MarketingBlogs = lazy(() => import("./pages/marketing/MarketingBlogs"));
const BlogEditor = lazy(() => import("./pages/marketing/BlogEditor"));

// refetchOnWindowFocus uit: terugkeren naar het tabblad mag geen achtergrond-
// refetch (en dus geen geflikker / sluitende panelen) veroorzaken. Data blijft
// vers via mount + mutatie-invalidatie.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center text-muted-foreground">
      Laden...
    </div>
  );
}

function AuthRedirect() {
  const { isLoading, user, role } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const workspaces = workspacesForRole(role);
  if (workspaces.includes("beheer")) return <Navigate to="/admin" replace />;
  if (workspaces.includes("sales")) return <Navigate to="/sales" replace />;
  if (workspaces.includes("marketing")) return <Navigate to="/marketing" replace />;
  if (role === "client") return <Navigate to="/portal" replace />;
  return <Navigate to="/login" replace />;
}

function InactiveAccountRedirect() {
  const { signOut } = useAuth();
  const [done, setDone] = useState(false);

  useEffect(() => {
    toast.error("Account niet actief");
    void signOut().finally(() => setDone(true));
  }, [signOut]);

  if (!done) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Uitloggen...</div>;
  }

  return <Navigate to="/login" replace />;
}

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { isLoading, user, role } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!role && allowedRoles.includes("client")) return <InactiveAccountRedirect />;
  if (!role || !allowedRoles.includes(role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<AuthRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/wachtwoord-herstellen" element={<ResetPassword />} />
              <Route path="/uitnodiging/:token" element={<InviteAccept />} />
              <Route path="/offerte/:token" element={<OfferAccept />} />

              {/* Client Portal */}
              <Route path="/portal" element={
                <RequireAuth allowedRoles={["client"]}>
                  <ClientLayout />
                </RequireAuth>
              }>
                <Route index element={<ClientDashboard />} />
                <Route path="sessies" element={<ClientSessions />} />
                <Route path="financieel" element={<ClientFinancial />} />
                <Route path="gegevens" element={<ClientProfilePage />} />
                <Route path="onboarding" element={<Navigate to="/portal/financieel" replace />} />
                <Route path="berichten" element={<ClientMessages />} />
                <Route path="locatie/:id" element={<ClientLocationDetail />} />
              </Route>

              {/* Demo-omgeving voor sales: keuzescherm (5/10/20) of config-gedreven (?cfg=),
                  daarna het volledige klantportaal op geparametriseerde fictieve data.
                  PUBLIEK (geen login): de config zit in de link, dus geen DB-query nodig. */}
              <Route path="/demo" element={<DemoLayout />}>
                <Route index element={<ClientDashboard />} />
                <Route path="sessies" element={<ClientSessions />} />
                <Route path="financieel" element={<ClientFinancial />} />
                <Route path="gegevens" element={<ClientProfilePage />} />
                <Route path="berichten" element={<ClientMessages />} />
                <Route path="locatie/:id" element={<ClientLocationDetail />} />
              </Route>

              {/* Beheer-werkblad */}
              <Route path="/admin" element={
                <RequireAuth allowedRoles={["admin", "manager", "viewer"]}>
                  <WorkspaceLayout />
                </RequireAuth>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="klanten" element={<AdminClients />} />
                <Route path="klanten/nieuw" element={<AdminClientWizard />} />
                <Route path="klanten/:id" element={<AdminClientDetail />} />
                <Route path="locaties" element={<AdminLocations />} />
                <Route path="locaties/:id" element={<AdminLocationDetail />} />
                <Route path="storingen" element={<AdminStoringen />} />
                <Route path="storingen/:id" element={<AdminStoringDetail />} />
                {/* Installaties zijn naar het Sales-werkblad verhuisd; redirect voor oude bookmarks */}
                <Route path="installaties" element={<Navigate to="/sales/installaties" replace />} />
                <Route path="financieel" element={<AdminFinancial />} />
                <Route path="instellingen" element={<AdminSettings />} />
                {/* Configurator verhuisd naar Sales — oude pad blijft werken via redirect */}
                <Route path="instellingen/configurator" element={<Navigate to="/sales/configurator" replace />} />
              </Route>

              {/* Sales-werkblad */}
              <Route path="/sales" element={
                <RequireAuth allowedRoles={["admin", "manager", "sales"]}>
                  <WorkspaceLayout />
                </RequireAuth>
              }>
                <Route index element={<Navigate to="/sales/leads" replace />} />
                <Route path="leads" element={<SalesLeads />} />
                <Route path="contacten" element={<SalesContacts />} />
                <Route path="offertes" element={<SalesOffertes />} />
                <Route path="installaties" element={<SalesInstallations />} />
                <Route path="onboarding" element={<SalesOnboarding />} />
                <Route path="configurator" element={<AdminConfiguratorSettings />} />
              </Route>

              {/* Marketing-werkblad */}
              <Route path="/marketing" element={
                <RequireAuth allowedRoles={["admin", "manager", "marketing"]}>
                  <WorkspaceLayout />
                </RequireAuth>
              }>
                <Route index element={<Navigate to="/marketing/blogs" replace />} />
                <Route path="blogs" element={<MarketingBlogs />} />
                <Route path="blogs/nieuw" element={<BlogEditor />} />
                <Route path="blogs/:id" element={<BlogEditor />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
