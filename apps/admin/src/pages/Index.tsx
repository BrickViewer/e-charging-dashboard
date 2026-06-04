import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function Index() {
  const { user, isLoading, isInternal, role } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Laden...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isInternal) return <Navigate to="/admin" replace />;
  if (role === "client") return <Navigate to="/portal" replace />;
  return <Navigate to="/login" replace />;
}
