import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert } from "lucide-react";
import logoBright from "@/assets/icon-bright.svg";

// Geauthenticeerd (bv. via Microsoft, e-group) maar nog géén rol toegekend → nette
// wachtpagina i.p.v. een verwarrende redirect-lus naar /login.
export default function NoAccess() {
  const { isLoading, user, role, signOut } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Laden...</div>;
  }
  // Niet ingelogd → naar login. Wél een rol → hoort hier niet, laat de router herrouteren.
  if (!user) return <Navigate to="/login" replace />;
  if (role) return <Navigate to="/" replace />;

  return (
    <div className="portal-theme relative min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 text-foreground">
      <img src={logoBright} alt="E-Charging" className="h-10 w-auto opacity-90" />
      <div className="portal-card max-w-md rounded-2xl bg-card/80 p-7 text-center backdrop-blur-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">Nog geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Je account is herkend{user.email ? <> (<span className="font-medium">{user.email}</span>)</> : null}, maar er is nog
          geen rol toegekend. Vraag de beheerder om je toegang te geven; daarna werkt het inloggen meteen.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Uitloggen
        </Button>
      </div>
    </div>
  );
}
