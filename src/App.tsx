import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense } from "react";

import Login from "./pages/Login";
import ClientLayout from "./layouts/ClientLayout";
import AdminLayout from "./layouts/AdminLayout";
import NotFound from "./pages/NotFound";

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
const AdminCalculator = lazy(() => import("./pages/admin/AdminCalculator"));
const AdminQuotes = lazy(() => import("./pages/admin/AdminQuotes"));
const AdminQuoteCreate = lazy(() => import("./pages/admin/AdminQuoteCreate"));
const AdminQuoteDetail = lazy(() => import("./pages/admin/AdminQuoteDetail"));
const AdminFinancial = lazy(() => import("./pages/admin/AdminFinancial"));
const AdminChargePoints = lazy(() => import("./pages/admin/AdminChargePoints"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

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

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { isLoading, user, role } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  if (!user) return <Navigate to="/login" replace />;
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
                <Route path="offertes" element={<AdminQuotes />} />
                <Route path="offertes/nieuw" element={<AdminQuoteCreate />} />
                <Route path="offertes/:id" element={<AdminQuoteDetail />} />
                <Route path="calculator" element={<AdminCalculator />} />
                <Route path="financieel" element={<AdminFinancial />} />
                <Route path="laadpunten" element={<AdminChargePoints />} />
                <Route path="instellingen" element={<AdminSettings />} />
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
