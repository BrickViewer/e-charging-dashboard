import { useAllClients } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function AdminClients() {
  const { data: clients, isLoading } = useAllClients();
  const [search, setSearch] = useState("");

  const filtered = clients?.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name || "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <Link to="/admin/klanten/nieuw">
          <Button><Plus className="w-4 h-4 mr-2" />Klant toevoegen</Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Zoek klant..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Bedrijf</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Locaties</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Laadpunten</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => {
                  const locs = c.locations || [];
                  const cps = locs.flatMap((l: any) => l.charge_points || []);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer">
                      <td className="p-3 font-medium">{c.company_name}</td>
                      <td className="p-3 text-muted-foreground">{c.contact_name}</td>
                      <td className="p-3 text-right">{locs.length}</td>
                      <td className="p-3 text-right">{cps.length}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          c.status === "actief" ? "bg-primary/10 text-primary" :
                          c.status === "offerte" ? "bg-warning/10 text-warning" :
                          c.status === "prospect" ? "bg-muted text-muted-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>{c.status}</span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Geen klanten gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
