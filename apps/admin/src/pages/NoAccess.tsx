import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert, RefreshCw } from "lucide-react";
import logoBright from "@/assets/icon-bright.svg";

// Geauthenticeerd (bv. via Microsoft, e-group) maar nog géén rol toegekend → nette
// wachtpagina. Er staat automatisch een toegangsverzoek open; zodra een admin een rol
// toekent, herlaadt de pagina zichzelf en komt de gebruiker in z'n werkblad.
export default function NoAccess() {
  const { isLoading, user, role, signOut } = useAuth();

  const { data: request } = useQuery({
    queryKey: ["my-access-request", user?.id],
    enabled: !!user && !role,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data } = await supabase.from("access_requests").select("status").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    if (request?.status === "approved") window.location.reload();
  }, [request?.status]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  }
  if (!user) return <Navigate to="/login/admin" replace />;
  if (role) return <Navigate to="/" replace />;

  const denied = request?.status === "denied";

  return (
    <div className="portal-theme relative min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 text-foreground">
      <img src={logoBright} alt="E-Charging" className="h-10 w-auto opacity-90" />
      <div className="portal-card max-w-md rounded-2xl bg-card/80 p-7 text-center backdrop-blur-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">{denied ? "Toegang geweigerd" : "Toegang aangevraagd"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {denied ? (
            <>Je aanvraag is afgewezen. Neem contact op met de beheerder als dit niet klopt.</>
          ) : (
            <>Je account is herkend{user.email ? <> (<span className="font-medium">{user.email}</span>)</> : null}. De beheerder
            heeft een verzoek ontvangen om je een rol te geven; zodra dat gebeurt, kun je meteen aan de slag.</>
          )}
        </p>
        {!denied && (
          <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Ik heb toegang gekregen — opnieuw proberen
          </Button>
        )}
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Uitloggen
          </Button>
        </div>
      </div>
    </div>
  );
}
