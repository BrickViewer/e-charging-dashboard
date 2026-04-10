import { useAllChargePoints } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Plug, Search } from "lucide-react";

export default function AdminChargePoints() {
  const { data: chargePoints, isLoading } = useAllChargePoints();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = chargePoints?.filter((cp: any) => {
    const matchSearch = (cp.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (cp.locations?.clients?.company_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || cp.status === statusFilter;
    return matchSearch && matchStatus;
  }) || [];

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      online: "bg-primary/10 text-primary",
      in_use: "bg-primary/10 text-primary",
      offline: "bg-destructive/10 text-destructive",
      error: "bg-destructive/10 text-destructive",
      installation_pending: "bg-warning/10 text-warning",
    };
    return styles[status] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold">Laadpunt Monitoring</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Zoek op naam of klant..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="in_use">In gebruik</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="error">Storing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Laadpunt</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Locatie</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Merk</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cp: any) => (
                  <tr key={cp.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <Plug className="w-4 h-4 text-muted-foreground" />
                      {cp.name}
                    </td>
                    <td className="p-3 text-muted-foreground">{cp.locations?.name || cp.locations?.address || "-"}</td>
                    <td className="p-3">{cp.locations?.clients?.company_name || "-"}</td>
                    <td className="p-3 text-muted-foreground uppercase text-xs">{cp.type?.replace("_", " ")}</td>
                    <td className="p-3 text-muted-foreground">{cp.brand || "-"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(cp.status)}`}>{cp.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
