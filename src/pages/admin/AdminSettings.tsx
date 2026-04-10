import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminSettings() {
  const { user, role } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Instellingen</h1>

      <Card>
        <CardHeader><CardTitle>Gebruiker</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">E-mail</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Rol</span>
            <span className="capitalize">{role}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Standaard tarieven</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Laadtarief per kWh</span>
            <span>€0,45</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Stroominkoop per kWh</span>
            <span>€0,25</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">e-Flux kosten AC</span>
            <span>€5,50/socket/maand</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">e-Flux kosten DC</span>
            <span>€10,40/socket/maand</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Opbrengstdeling</span>
            <span>50/50</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>API-koppelingen (Fase 2)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>e-Flux/Road API en Stripe Connect worden in fase 2 geconfigureerd.</p>
        </CardContent>
      </Card>
    </div>
  );
}
