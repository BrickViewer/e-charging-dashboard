import { useClientProfile, useClientSessions } from "@/hooks/useClientData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Download } from "lucide-react";
import { useState } from "react";

export default function ClientSessions() {
  const { data: client } = useClientProfile();
  const { data: sessions, isLoading } = useClientSessions(client?.id);
  const [search, setSearch] = useState("");

  const filtered = sessions?.filter((s: any) =>
    (s.charge_points?.name || "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = "Datum,Laadpunt,Duur (min),kWh,Bruto,Uw opbrengst\n";
    const rows = filtered.map((s: any) =>
      `${s.started_at},${s.charge_points?.name || ""},${s.duration_minutes},${s.kwh_delivered},€${Number(s.gross_revenue).toFixed(2)},€${Number(s.client_share).toFixed(2)}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "laadsessies.csv";
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Laadsessies</h1>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-2" />
          CSV Export
        </Button>
      </div>

      <Input
        placeholder="Zoek op laadpunt..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-medium">Datum</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Laadpunt</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Duur</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">kWh</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Bruto</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Uw opbrengst</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="p-3">{s.started_at ? format(new Date(s.started_at), "d MMM yyyy HH:mm", { locale: nl }) : "-"}</td>
                    <td className="p-3">{s.charge_points?.name || "-"}</td>
                    <td className="p-3 text-right">{s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}u ${s.duration_minutes % 60}m` : "-"}</td>
                    <td className="p-3 text-right">{Number(s.kwh_delivered || 0).toFixed(1)}</td>
                    <td className="p-3 text-right">€{Number(s.gross_revenue || 0).toFixed(2)}</td>
                    <td className="p-3 text-right text-primary font-medium">€{Number(s.client_share || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Geen sessies gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
