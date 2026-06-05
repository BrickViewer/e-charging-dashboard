import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function SalesOffertes() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Offertes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overzicht en beheer van uitgebrachte offertes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Binnenkort beschikbaar</CardTitle>
              <CardDescription>De Offertes-module wordt in een volgende stap gebouwd.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hier maak en volg je straks offertes — voortbouwend op de configurator-berekeningen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
