import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Login from "./pages/Login";
import ClientLayout from "./layouts/ClientLayout";
import ClientDashboard from "./pages/portal/ClientDashboard";
import ClientSessions from "./pages/portal/ClientSessions";
import ClientFinancial from "./pages/portal/ClientFinancial";
import ClientProfilePage from "./pages/portal/ClientProfilePage";
import ClientMessages from "./pages/portal/ClientMessages";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminClients from "./pages/admin/AdminClients";
import AdminCalculator from "./pages/admin/AdminCalculator";
import AdminFinancial from "./pages/admin/AdminFinancial";
import AdminChargePoints from "./pages/admin/AdminChargePoints";
import AdminSettings from "./pages/admin/AdminSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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

// E-Charging App
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            </Route>

            {/* Admin Panel */}
            <Route path="/admin" element={
              <RequireAuth allowedRoles={["admin", "manager", "viewer"]}>
                <AdminLayout />
              </RequireAuth>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="klanten" element={<AdminClients />} />
              <Route path="calculator" element={<AdminCalculator />} />
              <Route path="financieel" element={<AdminFinancial />} />
              <Route path="laadpunten" element={<AdminChargePoints />} />
              <Route path="instellingen" element={<AdminSettings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
