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
import AdminLayout from "./layouts/AdminLayout";
import NotFound from "./pages/NotFound";
import InviteAccept from "./pages/InviteAccept";
import ResetPassword from "./pages/ResetPassword";

// Client portal pages
const ClientDashboard = lazy(() => import("./pages/portal/ClientDashboard"));
const ClientSessions = lazy(() => import("./pages/portal/ClientSessions"));
const ClientFinancial = lazy(() => import("./pages/portal/ClientFinancial"));
const ClientProfilePage = lazy(() => import("./pages/portal/ClientProfilePage"));
const ClientMessages = lazy(() => import("./pages/portal/ClientMessages"));
const ClientLocationDetail = lazy(() => import("./pages/portal/ClientLocationDetail"));

// Admin pages — lazy loaded
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminClients = lazy(() => import("./pages/admin/AdminClients"));
const AdminClientWizard = lazy(() => import("./pages/admin/AdminClientWizard"));
const AdminClientDetail = lazy(() => import("./pages/admin/AdminClientDetail"));
const AdminFinancial = lazy(() => import("./pages/admin/AdminFinancial"));
const AdminLocations = lazy(() => import("./pages/admin/AdminLocations"));
const AdminLocationDetail = lazy(() => import("./pages/admin/AdminLocationDetail"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminConfiguratorSettings = lazy(() => import("./pages/admin/AdminConfiguratorSettings"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center text-muted-foreground">
      Laden...
    </div>
  );
}

function AuthRedirect() {
  const { isLoading, user, role, isInternal } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isInternal) return <Navigate to="/admin" replace />;
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

              {/* Admin Panel */}
              <Route path="/admin" element={
                <RequireAuth allowedRoles={["admin", "manager", "viewer"]}>
                  <AdminLayout />
                </RequireAuth>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="klanten" element={<AdminClients />} />
                <Route path="klanten/nieuw" element={<AdminClientWizard />} />
                <Route path="klanten/:id" element={<AdminClientDetail />} />
                <Route path="locaties" element={<AdminLocations />} />
                <Route path="locaties/:id" element={<AdminLocationDetail />} />
                <Route path="financieel" element={<AdminFinancial />} />
                <Route path="instellingen" element={<AdminSettings />} />
                <Route path="instellingen/configurator" element={<AdminConfiguratorSettings />} />
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
